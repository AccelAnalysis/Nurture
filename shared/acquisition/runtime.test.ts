import { describe, expect, it } from "vitest";
import type { AnalyticsDataMode, LifecycleEventEnvelope, LifecycleEventSource } from "../analytics/contracts";
import { validateAcquisitionDefinition } from "./catalog";
import {
  ACQUISITION_AUTOMATION_SCHEMA_VERSION,
  type AcquisitionAutomationDefinition,
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

class TestClock {
  constructor(public current = "2026-09-05T13:00:00.000Z") {}
  now = () => this.current;
  advance(seconds: number) {
    this.current = new Date(Date.parse(this.current) + seconds * 1000).toISOString();
  }
}

class MemoryDefinitionPort implements AcquisitionDefinitionPort {
  constructor(public definition: AcquisitionAutomationDefinition) {}
  async listPublishedForTrigger(input: { organizationId: string; eventType: string }) {
    return input.organizationId === this.definition.organizationId && input.eventType === this.definition.triggerEventType
      ? [this.definition]
      : [];
  }
  async getVersion(input: { organizationId: string; automationId: string; versionId: string }) {
    return input.organizationId === this.definition.organizationId
      && input.automationId === this.definition.automationId
      && input.versionId === this.definition.versionId
      ? this.definition
      : null;
  }
}

class MemoryStatePort implements AcquisitionStatePort {
  state: AcquisitionCurrentState = {
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
  async readCurrentState() {
    return structuredClone(this.state);
  }
}

class MemoryEmailPort implements AcquisitionEmailDispatchPort {
  evaluation: AcquisitionEmailEligibilityResult = {
    status: "eligible",
    checkedAt: "2026-09-05T13:00:00.000Z",
    recipientRef: "customer:customer-1",
  };
  submissions: AcquisitionEmailSubmitInput[] = [];
  submitResults: AcquisitionEmailSubmitResult[] = [{
    status: "provider-accepted",
    acceptedAt: "2026-09-05T13:01:00.000Z",
    messageId: "message-1",
  }];

  async evaluate(_input: AcquisitionEmailEligibilityInput) {
    return structuredClone(this.evaluation);
  }
  async submit(input: AcquisitionEmailSubmitInput) {
    this.submissions.push(structuredClone(input));
    return structuredClone(this.submitResults.shift() ?? {
      status: "provider-accepted",
      acceptedAt: "2026-09-05T13:01:00.000Z",
      messageId: `message-${this.submissions.length}`,
    });
  }
}

class MemoryRuntimeStore implements AcquisitionRuntimeStore {
  enrollments = new Map<string, AcquisitionEnrollment>();
  jobs = new Map<string, AcquisitionJob>();
  platformPaused = false;
  organizationPaused = false;
  automationPaused = false;

  async createEnrollmentIfAbsent(input: CreateEnrollmentInput): Promise<CreateEnrollmentResult> {
    const existing = this.enrollments.get(input.enrollment.enrollmentId);
    if (existing) return { status: "duplicate", enrollment: structuredClone(existing) };
    const enrollment = structuredClone(input.enrollment);
    this.enrollments.set(enrollment.enrollmentId, enrollment);
    for (const job of input.jobs) this.jobs.set(job.jobId, structuredClone(job));
    return { status: "created", enrollment: structuredClone(enrollment), jobs: structuredClone(input.jobs) };
  }

  async getEnrollment(enrollmentId: string) {
    const value = this.enrollments.get(enrollmentId);
    return value ? structuredClone(value) : null;
  }

  async listDueJobs(input: { beforeOrAt: string; limit: number; dataMode?: AnalyticsDataMode }) {
    const now = Date.parse(input.beforeOrAt);
    return [...this.jobs.values()]
      .filter((job) => !TERMINAL.has(job.status))
      .filter((job) => input.dataMode === undefined || job.dataMode === input.dataMode)
      .filter((job) => Date.parse(job.dueAt) <= now)
      .filter((job) => job.status !== "leased" || !job.lease || Date.parse(job.lease.expiresAt) <= now)
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.jobId.localeCompare(b.jobId))
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
        detail: "Expired lease had already crossed the provider submission barrier.",
      };
      this.jobs.set(job.jobId, job);
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
    this.jobs.set(job.jobId, job);
    return { status: "leased", job: structuredClone(job) };
  }

  async markProviderSubmissionStarted(input: MarkProviderSubmissionStartedInput) {
    const job = this.jobs.get(input.jobId);
    if (!job || job.status !== "leased" || job.lease?.leaseToken !== input.leaseToken) throw new Error("lease-lost");
    job.providerAttemptCount += 1;
    job.providerSubmissionStartedAt = input.at;
    job.providerSubmissionAttemptId = input.attemptId;
    job.updatedAt = input.at;
    this.jobs.set(job.jobId, job);
    return structuredClone(job);
  }

  async transitionLeasedJob(input: TransitionLeasedJobInput) {
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
    this.jobs.set(job.jobId, job);
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

  async countProviderAcceptedEffects(input: { organizationId: string; subjectId: string; dataMode: AnalyticsDataMode; since: string }) {
    return [...this.jobs.values()].filter((job) =>
      job.organizationId === input.organizationId
      && job.subjectId === input.subjectId
      && job.dataMode === input.dataMode
      && job.status === "provider-accepted"
      && Date.parse(job.updatedAt) >= Date.parse(input.since)).length;
  }

  async cancelPending(input: { organizationId: string; subjectId: string; dataMode: AnalyticsDataMode; automationId?: string; at: string; reason: AcquisitionReasonCode; detail?: string }) {
    let changed = 0;
    for (const job of this.jobs.values()) {
      if (TERMINAL.has(job.status)) continue;
      if (job.organizationId !== input.organizationId || job.subjectId !== input.subjectId || job.dataMode !== input.dataMode) continue;
      if (input.automationId && job.automationId !== input.automationId) continue;
      job.status = "cancelled";
      job.lease = undefined;
      job.updatedAt = input.at;
      job.lastExplanation = { at: input.at, reason: input.reason, detail: input.detail };
      changed += 1;
    }
    return changed;
  }

  async finalizeEnrollmentIfSettled(input: { enrollmentId: string; at: string }) {
    const enrollment = this.enrollments.get(input.enrollmentId);
    if (!enrollment) return null;
    const jobs = [...this.jobs.values()].filter((job) => job.enrollmentId === input.enrollmentId);
    if (jobs.some((job) => !TERMINAL.has(job.status))) return structuredClone(enrollment);
    if (jobs.some((job) => job.status === "failed" || job.status === "unknown-outcome")) enrollment.status = "failed";
    else if (jobs.every((job) => job.status === "cancelled" || job.status === "suppressed")) enrollment.status = "cancelled";
    else enrollment.status = "completed";
    enrollment.lastExplanation = { at: input.at, reason: jobs.at(-1)?.lastExplanation.reason ?? "runtime-error" };
    this.enrollments.set(enrollment.enrollmentId, enrollment);
    return structuredClone(enrollment);
  }

  async getOperationsSnapshot(input: { organizationId?: string; dataMode?: AnalyticsDataMode; limit: number }): Promise<AcquisitionOperationsSnapshot> {
    const filtered = [...this.jobs.values()].filter((job) =>
      (input.organizationId === undefined || job.organizationId === input.organizationId)
      && (input.dataMode === undefined || job.dataMode === input.dataMode));
    const counts: AcquisitionOperationsSnapshot["counts"] = {};
    for (const job of filtered) counts[job.status] = (counts[job.status] ?? 0) + 1;
    return {
      generatedAt: "2026-09-05T13:00:00.000Z",
      platformPaused: this.platformPaused,
      organizationPaused: this.organizationPaused,
      counts,
      recentJobs: structuredClone(filtered.slice(-input.limit)),
      backendPersistence: "unknown",
      scheduler: "unknown",
    };
  }
}

function checkoutDefinition(overrides: Partial<AcquisitionAutomationDefinition> = {}): AcquisitionAutomationDefinition {
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

function checkoutEvent(overrides: Partial<LifecycleEventEnvelope> = {}): LifecycleEventEnvelope {
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

function fixture(definition = checkoutDefinition()) {
  const clock = new TestClock();
  const definitions = new MemoryDefinitionPort(definition);
  const store = new MemoryRuntimeStore();
  const state = new MemoryStatePort();
  const email = new MemoryEmailPort();
  let id = 0;
  const dependencies = { definitions, store, state, email, now: clock.now, id: () => `id-${++id}` };
  return { clock, definitions, store, state, email, dependencies, runtime: createAcquisitionRuntime(dependencies) };
}

describe("Release 2 acquisition definition boundary", () => {
  it("rejects an unapproved browser trigger source for checkout recovery", () => {
    const definition = checkoutDefinition({ allowedTriggerSources: ["browser" as LifecycleEventSource] });
    expect(() => validateAcquisitionDefinition(definition)).toThrow(/unsupported values/i);
  });

  it("rejects general-workflow expansion outside the approved checkout predicates", () => {
    const definition = checkoutDefinition({ predicates: ["subject.active", "purchase.absent", "commercial.eligible", "onboarding.incomplete"] });
    expect(() => validateAcquisitionDefinition(definition)).toThrow(/unsupported values/i);
  });
});

describe("Release 2 acquisition enrollment", () => {
  it("deduplicates replayed trusted triggers into one enrollment and effect", async () => {
    const { runtime, store } = fixture();
    const first = await runtime.enroll({ event: checkoutEvent() });
    const second = await runtime.enroll({ event: checkoutEvent() });
    expect(first[0]?.status).toBe("enrolled");
    expect(second[0]?.status).toBe("duplicate");
    expect(store.enrollments.size).toBe(1);
    expect(store.jobs.size).toBe(1);
  });

  it("makes historical projection replay side-effect free", async () => {
    const { runtime, store } = fixture();
    const result = await runtime.enroll({ event: checkoutEvent(), executionIntent: "projection-replay" });
    expect(result[0]).toMatchObject({ status: "skipped", reason: "projection-replay-no-effects" });
    expect(store.enrollments.size).toBe(0);
    expect(store.jobs.size).toBe(0);
  });

  it("never persists preview enrollment state", async () => {
    const { runtime, store } = fixture();
    const result = await runtime.enroll({ event: checkoutEvent({ dataMode: "preview" }) });
    expect(result[0]).toMatchObject({ status: "dry-run", reason: "preview-no-effects" });
    expect(store.jobs.size).toBe(0);
  });

  it("does not enroll checkout recovery from an otherwise valid browser signal", async () => {
    const { runtime, store } = fixture();
    const result = await runtime.enroll({ event: checkoutEvent({ source: "browser" }) });
    expect(result[0]).toMatchObject({ status: "skipped", reason: "trigger-source-not-approved" });
    expect(store.jobs.size).toBe(0);
  });
});

describe("Release 2 acquisition dispatch safety", () => {
  it("survives a runtime restart because due work lives in the store contract", async () => {
    const fx = fixture();
    await fx.runtime.enroll({ event: checkoutEvent() });
    fx.clock.advance(61);
    const restartedRuntime = createAcquisitionRuntime(fx.dependencies);
    const result = await restartedRuntime.drain({ workerId: "worker-after-restart" });
    expect(result.providerAccepted).toBe(1);
    expect(fx.email.submissions).toHaveLength(1);
    expect([...fx.store.jobs.values()][0]?.status).toBe("provider-accepted");
  });

  it("cancels checkout recovery when an authoritative purchase appears during the delay", async () => {
    const fx = fixture();
    await fx.runtime.enroll({ event: checkoutEvent() });
    fx.state.state.purchase = "completed";
    fx.clock.advance(61);
    const result = await fx.runtime.drain({ workerId: "worker-purchase" });
    expect(result.cancelled).toBe(1);
    expect(fx.email.submissions).toHaveLength(0);
    expect([...fx.store.jobs.values()][0]?.lastExplanation.reason).toBe("purchase-completed");
  });

  it("cancels pending work when the organization is paused during the delay", async () => {
    const fx = fixture();
    await fx.runtime.enroll({ event: checkoutEvent() });
    fx.store.organizationPaused = true;
    fx.clock.advance(61);
    const result = await fx.runtime.drain({ workerId: "worker-paused" });
    expect(result.cancelled).toBe(1);
    expect(fx.email.submissions).toHaveLength(0);
    expect([...fx.store.jobs.values()][0]?.lastExplanation.reason).toBe("organization-paused");
  });

  it("uses D's final eligibility decision to suppress a withdrawn recipient", async () => {
    const fx = fixture();
    await fx.runtime.enroll({ event: checkoutEvent() });
    fx.email.evaluation = {
      status: "suppress",
      checkedAt: fx.clock.now(),
      reason: "marketing consent was withdrawn",
      code: "consent",
    };
    fx.clock.advance(61);
    const result = await fx.runtime.drain({ workerId: "worker-optout" });
    expect(result.suppressed).toBe(1);
    expect(fx.email.submissions).toHaveLength(0);
    expect([...fx.store.jobs.values()][0]?.lastExplanation.reason).toBe("communication-suppressed");
  });

  it("holds instead of guessing when an authoritative required fact becomes unknown", async () => {
    const fx = fixture();
    await fx.runtime.enroll({ event: checkoutEvent() });
    fx.state.state.purchase = "unknown";
    fx.clock.advance(61);
    const result = await fx.runtime.drain({ workerId: "worker-unknown" });
    expect(result.held).toBe(1);
    expect(fx.email.submissions).toHaveLength(0);
    expect([...fx.store.jobs.values()][0]?.status).toBe("held");
  });

  it("never submits email from demo mode", async () => {
    const fx = fixture(checkoutDefinition({ steps: [{
      stepId: "recovery-1",
      schedule: { kind: "after-trigger", delaySeconds: 0 },
      action: { kind: "email", templateId: "checkout-recovery", templateVersionId: "checkout-recovery@1", purpose: "promotional" },
    }] }));
    await fx.runtime.enroll({ event: checkoutEvent({ dataMode: "demo" }) });
    const result = await fx.runtime.drain({ workerId: "worker-demo", dataMode: "demo" });
    expect(result.dryRun).toBe(1);
    expect(fx.email.submissions).toHaveLength(0);
  });

  it("retries only a known retryable failure and preserves the same logical effect identity", async () => {
    const fx = fixture(checkoutDefinition({ steps: [{
      stepId: "recovery-1",
      schedule: { kind: "after-trigger", delaySeconds: 0 },
      action: { kind: "email", templateId: "checkout-recovery", templateVersionId: "checkout-recovery@1", purpose: "promotional" },
    }] }));
    fx.email.submitResults = [
      { status: "retryable-failure", reason: "provider rejected before acceptance", retryAfterSeconds: 10 },
      { status: "provider-accepted", acceptedAt: "2026-09-05T13:00:10.000Z", messageId: "message-after-retry" },
    ];
    await fx.runtime.enroll({ event: checkoutEvent() });
    const first = await fx.runtime.drain({ workerId: "worker-retry-1" });
    expect(first.retrying).toBe(1);
    fx.clock.advance(10);
    const second = await fx.runtime.drain({ workerId: "worker-retry-2" });
    expect(second.providerAccepted).toBe(1);
    expect(fx.email.submissions).toHaveLength(2);
    expect(fx.email.submissions[0]?.idempotencyKey).toBe(fx.email.submissions[1]?.idempotencyKey);
    expect([...fx.store.jobs.values()][0]?.providerAttemptCount).toBe(2);
  });

  it("holds a provider timeout/unknown outcome for review and never blindly retries it", async () => {
    const fx = fixture(checkoutDefinition({ steps: [{
      stepId: "recovery-1",
      schedule: { kind: "after-trigger", delaySeconds: 0 },
      action: { kind: "email", templateId: "checkout-recovery", templateVersionId: "checkout-recovery@1", purpose: "promotional" },
    }] }));
    fx.email.submitResults = [{ status: "unknown-outcome", reason: "provider timed out after request submission" }];
    await fx.runtime.enroll({ event: checkoutEvent() });
    const first = await fx.runtime.drain({ workerId: "worker-unknown-provider" });
    expect(first.unknownOutcome).toBe(1);
    fx.clock.advance(600);
    const second = await fx.runtime.drain({ workerId: "worker-should-not-repeat" });
    expect(second.scanned).toBe(0);
    expect(fx.email.submissions).toHaveLength(1);
  });

  it("classifies a killed worker after the submission barrier as unknown instead of granting a new lease", async () => {
    const fx = fixture(checkoutDefinition({ steps: [{
      stepId: "recovery-1",
      schedule: { kind: "after-trigger", delaySeconds: 0 },
      action: { kind: "email", templateId: "checkout-recovery", templateVersionId: "checkout-recovery@1", purpose: "promotional" },
    }] }));
    await fx.runtime.enroll({ event: checkoutEvent() });
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
    // No transition simulates process death after submission admission.
    fx.clock.advance(121);
    const restarted = createAcquisitionRuntime(fx.dependencies);
    const result = await restarted.drain({ workerId: "recovery-worker" });
    expect(result.unknownOutcome).toBe(1);
    expect(fx.email.submissions).toHaveLength(0);
    expect([...fx.store.jobs.values()][0]?.status).toBe("unknown-outcome");
  });
});
