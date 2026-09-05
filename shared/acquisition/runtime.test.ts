import { describe, expect, it } from "vitest";
import type {
  AnalyticsDataMode,
  AnalyticsEventType,
  LifecycleEventEnvelope,
  LifecycleEventSource,
} from "../analytics/contracts";
import { validateAcquisitionDefinition } from "./catalog";
import {
  ACQUISITION_AUTOMATION_SCHEMA_VERSION,
  type AcquisitionAutomationDefinition,
  type AcquisitionCatalogId,
  type AcquisitionCurrentState,
  type AcquisitionDefinitionPort,
  type AcquisitionEmailDispatchPort,
  type AcquisitionEmailEligibilityInput,
  type AcquisitionEmailEligibilityResult,
  type AcquisitionEmailSubmitInput,
  type AcquisitionEmailSubmitResult,
  type AcquisitionEnrollment,
  type AcquisitionJob,
  type AcquisitionJobStatus,
  type AcquisitionMessagePurpose,
  type AcquisitionOperationsSnapshot,
  type AcquisitionPauseState,
  type AcquisitionReasonCode,
  type AcquisitionRuntimeStore,
  type AcquisitionStatePort,
  type CreateEnrollmentInput,
  type CreateEnrollmentResult,
  type LeaseJobInput,
  type LeaseJobResult,
  type MarkProviderSubmissionStartedInput,
  type TransitionLeasedJobInput,
} from "./contracts";
import { createAcquisitionRuntime } from "./runtime";

const TERMINAL = new Set<AcquisitionJobStatus>([
  "provider-accepted",
  "dry-run",
  "suppressed",
  "cancelled",
  "failed",
  "unknown-outcome",
]);

class Clock {
  value = "2026-09-05T13:00:00.000Z";
  now = () => this.value;
  advance(seconds: number) {
    this.value = new Date(Date.parse(this.value) + seconds * 1000).toISOString();
  }
}

class Definitions implements AcquisitionDefinitionPort {
  constructor(public definition: AcquisitionAutomationDefinition) {}

  async listPublishedForTrigger(input: {
    organizationId: string;
    eventType: AnalyticsEventType;
  }): Promise<readonly AcquisitionAutomationDefinition[]> {
    return input.organizationId === this.definition.organizationId && input.eventType === this.definition.triggerEventType
      ? [this.definition]
      : [];
  }

  async getVersion(input: {
    organizationId: string;
    automationId: AcquisitionCatalogId;
    versionId: string;
  }): Promise<AcquisitionAutomationDefinition | null> {
    return input.organizationId === this.definition.organizationId
      && input.automationId === this.definition.automationId
      && input.versionId === this.definition.versionId
      ? this.definition
      : null;
  }
}

class State implements AcquisitionStatePort {
  value: AcquisitionCurrentState = {
    checkedAt: "2026-09-05T13:00:00.000Z",
    organization: "active",
    subject: "active",
    registration: "completed",
    onboarding: { status: "incomplete", flowVersionId: "onboarding-v1" },
    activation: "missing",
    trial: { status: "none" },
    purchase: "absent",
    commercialEligibility: "eligible",
  };

  async readCurrentState(): Promise<AcquisitionCurrentState> {
    return structuredClone(this.value);
  }
}

class Email implements AcquisitionEmailDispatchPort {
  eligibility: AcquisitionEmailEligibilityResult = {
    status: "eligible",
    checkedAt: "2026-09-05T13:00:00.000Z",
    recipientRef: "customer:customer-1",
  };
  submissions: AcquisitionEmailSubmitInput[] = [];
  outcomes: AcquisitionEmailSubmitResult[] = [];

  async evaluate(_input: AcquisitionEmailEligibilityInput): Promise<AcquisitionEmailEligibilityResult> {
    return structuredClone(this.eligibility);
  }

  async submit(input: AcquisitionEmailSubmitInput): Promise<AcquisitionEmailSubmitResult> {
    this.submissions.push(structuredClone(input));
    const outcome = this.outcomes.shift();
    if (outcome) return structuredClone(outcome);
    const accepted: AcquisitionEmailSubmitResult = {
      status: "provider-accepted",
      acceptedAt: "2026-09-05T13:01:00.000Z",
      messageId: `message-${this.submissions.length}`,
    };
    return accepted;
  }
}

class Store implements AcquisitionRuntimeStore {
  enrollments = new Map<string, AcquisitionEnrollment>();
  jobs = new Map<string, AcquisitionJob>();
  platformPaused = false;
  organizationPaused = false;
  automationPaused = false;

  async createEnrollmentIfAbsent(input: CreateEnrollmentInput): Promise<CreateEnrollmentResult> {
    const existing = this.enrollments.get(input.enrollment.enrollmentId);
    if (existing) return { status: "duplicate", enrollment: structuredClone(existing) };
    this.enrollments.set(input.enrollment.enrollmentId, structuredClone(input.enrollment));
    for (const job of input.jobs) this.jobs.set(job.jobId, structuredClone(job));
    return {
      status: "created",
      enrollment: structuredClone(input.enrollment),
      jobs: structuredClone(input.jobs),
    };
  }

  async getEnrollment(enrollmentId: string): Promise<AcquisitionEnrollment | null> {
    const enrollment = this.enrollments.get(enrollmentId);
    return enrollment ? structuredClone(enrollment) : null;
  }

  async listDueJobs(input: {
    beforeOrAt: string;
    limit: number;
    dataMode?: AnalyticsDataMode;
  }): Promise<readonly AcquisitionJob[]> {
    const at = Date.parse(input.beforeOrAt);
    return [...this.jobs.values()]
      .filter((job) => !TERMINAL.has(job.status))
      .filter((job) => input.dataMode === undefined || input.dataMode === job.dataMode)
      .filter((job) => Date.parse(job.dueAt) <= at)
      .filter((job) => job.status !== "leased" || !job.lease || Date.parse(job.lease.expiresAt) <= at)
      .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt) || left.jobId.localeCompare(right.jobId))
      .slice(0, input.limit)
      .map((job) => structuredClone(job));
  }

  async tryLeaseJob(input: LeaseJobInput): Promise<LeaseJobResult> {
    const job = this.jobs.get(input.jobId);
    if (!job) return { status: "unavailable", reason: "missing" };
    if (TERMINAL.has(job.status)) return { status: "unavailable", reason: "terminal" };
    if (Date.parse(job.dueAt) > Date.parse(input.leasedAt)) return { status: "unavailable", reason: "not-due" };
    if (job.status === "leased" && job.lease && Date.parse(job.lease.expiresAt) > Date.parse(input.leasedAt)) {
      return { status: "unavailable", reason: "active-lease" };
    }
    if (job.status === "leased" && job.providerSubmissionStartedAt) {
      job.status = "unknown-outcome";
      job.lease = undefined;
      job.updatedAt = input.leasedAt;
      job.lastExplanation = {
        at: input.leasedAt,
        reason: "provider-unknown-outcome",
        detail: "Expired lease had crossed the provider submission barrier.",
      };
      return { status: "unknown-outcome", job: structuredClone(job) };
    }
    job.status = "leased";
    job.lease = {
      leaseToken: input.leaseToken,
      workerId: input.workerId,
      leasedAt: input.leasedAt,
      expiresAt: input.leaseExpiresAt,
    };
    job.updatedAt = input.leasedAt;
    return { status: "leased", job: structuredClone(job) };
  }

  async markProviderSubmissionStarted(input: MarkProviderSubmissionStartedInput): Promise<AcquisitionJob> {
    const job = this.jobs.get(input.jobId);
    if (!job || job.status !== "leased" || job.lease?.leaseToken !== input.leaseToken) throw new Error("lease-lost");
    job.providerAttemptCount += 1;
    job.providerSubmissionStartedAt = input.at;
    job.providerSubmissionAttemptId = input.attemptId;
    job.updatedAt = input.at;
    return structuredClone(job);
  }

  async transitionLeasedJob(input: TransitionLeasedJobInput): Promise<AcquisitionJob> {
    const job = this.jobs.get(input.jobId);
    if (!job || job.status !== "leased" || job.lease?.leaseToken !== input.leaseToken) throw new Error("lease-lost");
    job.status = input.status;
    job.lease = undefined;
    job.updatedAt = input.at;
    job.lastExplanation = { at: input.at, reason: input.reason, detail: input.detail };
    if (input.dueAt) job.dueAt = input.dueAt;
    if (input.providerAttemptCount !== undefined) job.providerAttemptCount = input.providerAttemptCount;
    if (input.providerMessageId !== undefined) job.providerMessageId = input.providerMessageId;
    if (input.providerRequestId !== undefined) job.providerRequestId = input.providerRequestId;
    return structuredClone(job);
  }

  async getPauseState(): Promise<AcquisitionPauseState> {
    return {
      platformPaused: this.platformPaused,
      organizationPaused: this.organizationPaused,
      automationPaused: this.automationPaused,
      checkedAt: "2026-09-05T13:00:00.000Z",
    };
  }

  async countProviderAcceptedEffects(input: {
    organizationId: string;
    subjectId: string;
    dataMode: AnalyticsDataMode;
    purpose: AcquisitionMessagePurpose;
    since: string;
  }): Promise<number> {
    return [...this.jobs.values()].filter((job) =>
      job.organizationId === input.organizationId
      && job.subjectId === input.subjectId
      && job.dataMode === input.dataMode
      && job.status === "provider-accepted"
      && Date.parse(job.updatedAt) >= Date.parse(input.since)).length;
  }

  async cancelPending(input: {
    organizationId: string;
    subjectId: string;
    dataMode: AnalyticsDataMode;
    automationId?: AcquisitionCatalogId;
    at: string;
    reason: AcquisitionReasonCode;
    detail?: string;
  }): Promise<number> {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (TERMINAL.has(job.status)) continue;
      if (job.organizationId !== input.organizationId || job.subjectId !== input.subjectId || job.dataMode !== input.dataMode) continue;
      if (input.automationId && job.automationId !== input.automationId) continue;
      job.status = "cancelled";
      job.lease = undefined;
      job.updatedAt = input.at;
      job.lastExplanation = { at: input.at, reason: input.reason, detail: input.detail };
      count += 1;
    }
    return count;
  }

  async finalizeEnrollmentIfSettled(input: {
    enrollmentId: string;
    at: string;
  }): Promise<AcquisitionEnrollment | null> {
    const enrollment = this.enrollments.get(input.enrollmentId);
    if (!enrollment) return null;
    const jobs = [...this.jobs.values()].filter((job) => job.enrollmentId === input.enrollmentId);
    if (jobs.some((job) => !TERMINAL.has(job.status))) return structuredClone(enrollment);
    if (jobs.some((job) => job.status === "failed" || job.status === "unknown-outcome")) enrollment.status = "failed";
    else if (jobs.every((job) => job.status === "cancelled" || job.status === "suppressed")) enrollment.status = "cancelled";
    else enrollment.status = "completed";
    enrollment.lastExplanation = {
      at: input.at,
      reason: jobs.at(-1)?.lastExplanation.reason ?? "runtime-error",
    };
    return structuredClone(enrollment);
  }

  async getOperationsSnapshot(input: {
    organizationId?: string;
    dataMode?: AnalyticsDataMode;
    limit: number;
  }): Promise<AcquisitionOperationsSnapshot> {
    const jobs = [...this.jobs.values()].filter((job) =>
      (input.organizationId === undefined || job.organizationId === input.organizationId)
      && (input.dataMode === undefined || job.dataMode === input.dataMode));
    const counts: AcquisitionOperationsSnapshot["counts"] = {};
    for (const job of jobs) counts[job.status] = (counts[job.status] ?? 0) + 1;
    return {
      generatedAt: "2026-09-05T13:00:00.000Z",
      platformPaused: this.platformPaused,
      organizationPaused: this.organizationPaused,
      counts,
      recentJobs: structuredClone(jobs.slice(-input.limit)),
      backendPersistence: "unknown",
      scheduler: "unknown",
    };
  }
}

function definition(overrides: Partial<AcquisitionAutomationDefinition> = {}): AcquisitionAutomationDefinition {
  return {
    schemaVersion: ACQUISITION_AUTOMATION_SCHEMA_VERSION,
    organizationId: "org-a",
    automationId: "R2-CHECKOUT",
    versionId: "checkout-v1",
    enabled: true,
    triggerEventType: "checkout.started",
    allowedTriggerSources: ["domain_action"],
    predicates: ["subject.active", "purchase.absent", "commercial.eligible"],
    stopRules: ["subject.deleted", "purchase.completed", "commercial.ineligible"],
    steps: [{
      stepId: "recovery-1",
      schedule: { kind: "after-trigger", delaySeconds: 60 },
      action: {
        kind: "email",
        templateId: "checkout-recovery",
        templateVersionId: "checkout-recovery@1",
        purpose: "promotional",
      },
    }],
    expirationSeconds: 86_400,
    retryPolicy: { maxAttempts: 3, baseBackoffSeconds: 10, maxBackoffSeconds: 60 },
    frequencyPolicy: { maxProviderAcceptedEffects: 2, windowSeconds: 86_400 },
    publishedAt: "2026-09-05T12:00:00.000Z",
    ...overrides,
  };
}

function event(overrides: Partial<LifecycleEventEnvelope> = {}): LifecycleEventEnvelope {
  return {
    eventId: "checkout-event-1",
    eventType: "checkout.started",
    schemaVersion: 1,
    organizationId: "org-a",
    subjectId: "customer-1",
    subjectKind: "customer",
    identityId: "identity-1",
    customerId: "customer-1",
    offerId: "offer-1",
    occurredAt: "2026-09-05T12:59:55.000Z",
    receivedAt: "2026-09-05T13:00:00.000Z",
    source: "domain_action",
    correlationId: "checkout-correlation-1",
    idempotencyKey: "checkout-idempotency-1",
    dataMode: "test",
    payload: {},
    ...overrides,
  };
}

function zeroDelayDefinition() {
  return definition({
    steps: [{
      stepId: "recovery-1",
      schedule: { kind: "after-trigger", delaySeconds: 0 },
      action: {
        kind: "email",
        templateId: "checkout-recovery",
        templateVersionId: "checkout-recovery@1",
        purpose: "promotional",
      },
    }],
  });
}

function fixture(automation = definition()) {
  const clock = new Clock();
  const definitions = new Definitions(automation);
  const store = new Store();
  const state = new State();
  const email = new Email();
  let sequence = 0;
  const dependencies = {
    definitions,
    store,
    state,
    email,
    now: clock.now,
    id: () => `runtime-id-${++sequence}`,
  };
  return {
    clock,
    definitions,
    store,
    state,
    email,
    dependencies,
    runtime: createAcquisitionRuntime(dependencies),
  };
}

describe("bounded acquisition catalog", () => {
  it("rejects browser checkout recovery and arbitrary predicate expansion", () => {
    expect(() => validateAcquisitionDefinition(definition({
      allowedTriggerSources: ["browser" as LifecycleEventSource],
    }))).toThrow(/unsupported values/i);
    expect(() => validateAcquisitionDefinition(definition({
      predicates: ["subject.active", "purchase.absent", "commercial.eligible", "onboarding.incomplete"],
    }))).toThrow(/unsupported values/i);
  });
});

describe("acquisition enrollment", () => {
  it("deduplicates replayed triggers and makes projection replay/preview side-effect free", async () => {
    const fx = fixture();
    expect((await fx.runtime.enroll({ event: event() }))[0]?.status).toBe("enrolled");
    expect((await fx.runtime.enroll({ event: event() }))[0]?.status).toBe("duplicate");
    expect(fx.store.enrollments.size).toBe(1);
    expect(fx.store.jobs.size).toBe(1);

    const replay = fixture();
    expect((await replay.runtime.enroll({ event: event(), executionIntent: "projection-replay" }))[0])
      .toMatchObject({ status: "skipped", reason: "projection-replay-no-effects" });
    expect(replay.store.jobs.size).toBe(0);

    const preview = fixture();
    expect((await preview.runtime.enroll({ event: event({ dataMode: "preview" }) }))[0])
      .toMatchObject({ status: "dry-run", reason: "preview-no-effects" });
    expect(preview.store.jobs.size).toBe(0);
  });

  it("does not enroll recovery from a valid-but-untrusted browser checkout signal", async () => {
    const fx = fixture();
    expect((await fx.runtime.enroll({ event: event({ source: "browser" }) }))[0])
      .toMatchObject({ status: "skipped", reason: "trigger-source-not-approved" });
    expect(fx.store.jobs.size).toBe(0);
  });
});

describe("durable dispatch admission", () => {
  it("survives a runtime restart over the same durable-store contract", async () => {
    const fx = fixture();
    await fx.runtime.enroll({ event: event() });
    fx.clock.advance(61);
    const restarted = createAcquisitionRuntime(fx.dependencies);
    expect((await restarted.drain({ workerId: "worker-restarted" })).providerAccepted).toBe(1);
    expect(fx.email.submissions).toHaveLength(1);
  });

  it("stops purchase, pause, opt-out, and unknown-state cases before provider submission", async () => {
    const purchase = fixture();
    await purchase.runtime.enroll({ event: event() });
    purchase.state.value.purchase = "completed";
    purchase.clock.advance(61);
    expect((await purchase.runtime.drain({ workerId: "purchase" })).cancelled).toBe(1);
    expect(purchase.email.submissions).toHaveLength(0);
    expect([...purchase.store.jobs.values()][0]?.lastExplanation.reason).toBe("purchase-completed");

    const pause = fixture();
    await pause.runtime.enroll({ event: event() });
    pause.store.organizationPaused = true;
    pause.clock.advance(61);
    expect((await pause.runtime.drain({ workerId: "pause" })).cancelled).toBe(1);
    expect(pause.email.submissions).toHaveLength(0);

    const optOut = fixture();
    await optOut.runtime.enroll({ event: event() });
    optOut.email.eligibility = {
      status: "suppress",
      checkedAt: optOut.clock.now(),
      reason: "marketing consent withdrawn",
      code: "consent",
    };
    optOut.clock.advance(61);
    expect((await optOut.runtime.drain({ workerId: "optout" })).suppressed).toBe(1);
    expect(optOut.email.submissions).toHaveLength(0);

    const unknown = fixture();
    await unknown.runtime.enroll({ event: event() });
    unknown.state.value.purchase = "unknown";
    unknown.clock.advance(61);
    expect((await unknown.runtime.drain({ workerId: "unknown" })).held).toBe(1);
    expect(unknown.email.submissions).toHaveLength(0);
  });

  it("never submits demo work and retries only a known safe failure with the same effect ID", async () => {
    const demo = fixture(zeroDelayDefinition());
    await demo.runtime.enroll({ event: event({ dataMode: "demo" }) });
    expect((await demo.runtime.drain({ workerId: "demo", dataMode: "demo" })).dryRun).toBe(1);
    expect(demo.email.submissions).toHaveLength(0);

    const retry = fixture(zeroDelayDefinition());
    retry.email.outcomes = [
      { status: "retryable-failure", reason: "rejected before acceptance", retryAfterSeconds: 10 },
      { status: "provider-accepted", acceptedAt: "2026-09-05T13:00:10.000Z", messageId: "accepted-after-retry" },
    ];
    await retry.runtime.enroll({ event: event() });
    expect((await retry.runtime.drain({ workerId: "retry-1" })).retrying).toBe(1);
    retry.clock.advance(10);
    expect((await retry.runtime.drain({ workerId: "retry-2" })).providerAccepted).toBe(1);
    expect(retry.email.submissions).toHaveLength(2);
    expect(retry.email.submissions[0]?.idempotencyKey).toBe(retry.email.submissions[1]?.idempotencyKey);
    expect([...retry.store.jobs.values()][0]?.providerAttemptCount).toBe(2);
  });

  it("holds ambiguous provider outcomes and never blindly retries them", async () => {
    const fx = fixture(zeroDelayDefinition());
    fx.email.outcomes = [{ status: "unknown-outcome", reason: "timeout after request submission" }];
    await fx.runtime.enroll({ event: event() });
    expect((await fx.runtime.drain({ workerId: "ambiguous" })).unknownOutcome).toBe(1);
    fx.clock.advance(600);
    expect((await fx.runtime.drain({ workerId: "no-repeat" })).scanned).toBe(0);
    expect(fx.email.submissions).toHaveLength(1);
  });

  it("recovers a killed worker past the submission barrier as unknown-outcome without a send", async () => {
    const fx = fixture(zeroDelayDefinition());
    await fx.runtime.enroll({ event: event() });
    const job = [...fx.store.jobs.values()][0]!;
    const lease = await fx.store.tryLeaseJob({
      jobId: job.jobId,
      workerId: "killed-worker",
      leaseToken: "killed-lease",
      leasedAt: fx.clock.now(),
      leaseExpiresAt: new Date(Date.parse(fx.clock.now()) + 120_000).toISOString(),
    });
    expect(lease.status).toBe("leased");
    await fx.store.markProviderSubmissionStarted({
      jobId: job.jobId,
      leaseToken: "killed-lease",
      at: fx.clock.now(),
      attemptId: "attempt-before-kill",
    });
    fx.clock.advance(121);
    expect((await createAcquisitionRuntime(fx.dependencies).drain({ workerId: "recovery-worker" })).unknownOutcome).toBe(1);
    expect(fx.email.submissions).toHaveLength(0);
    expect([...fx.store.jobs.values()][0]?.status).toBe("unknown-outcome");
  });
});
