import { validateLifecycleEventEnvelope } from "../analytics/core.js";
import type { AnalyticsDataMode, LifecycleEventEnvelope } from "../analytics/contracts.js";
import { validateAcquisitionDefinition } from "./catalog.js";
import {
  ACQUISITION_RUNTIME_SCHEMA_VERSION,
  DEFAULT_JOB_LEASE_SECONDS,
  DEFAULT_UNKNOWN_STATE_RECHECK_SECONDS,
  type AcquisitionAutomationDefinition,
  type AcquisitionAutomationStep,
  type AcquisitionCurrentState,
  type AcquisitionDefinitionPort,
  type AcquisitionEmailDispatchPort,
  type AcquisitionEmailEligibilityInput,
  type AcquisitionEnrollmentDecision,
  type AcquisitionJob,
  type AcquisitionJobStatus,
  type AcquisitionReasonCode,
  type AcquisitionRuntimeStore,
  type AcquisitionStatePort,
  type AcquisitionStateReadInput,
  type AcquisitionSubjectKind,
  type AcquisitionTriggerRequest,
  type AcquisitionWorkerResult,
} from "./contracts.js";

export interface AcquisitionRuntimeDependencies {
  definitions: AcquisitionDefinitionPort;
  store: AcquisitionRuntimeStore;
  state: AcquisitionStatePort;
  email: AcquisitionEmailDispatchPort;
  now?: () => string;
  id?: () => string;
}

export interface DrainAcquisitionJobsInput {
  workerId: string;
  limit?: number;
  dataMode?: AnalyticsDataMode;
}

export interface StateDecision {
  disposition: "eligible" | "hold" | "cancel";
  reason: AcquisitionReasonCode;
  detail?: string;
}

function nowIso(dependencies: AcquisitionRuntimeDependencies): string {
  return dependencies.now?.() ?? new Date().toISOString();
}

function nextId(dependencies: AcquisitionRuntimeDependencies): string {
  return dependencies.id?.()
    ?? globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseTime(label: string, value: string): number {
  const result = Date.parse(value);
  if (Number.isNaN(result)) throw new Error(`${label} must be an ISO-compatible timestamp.`);
  return result;
}

function addSeconds(timestamp: string, seconds: number): string {
  return new Date(parseTime("timestamp", timestamp) + seconds * 1000).toISOString();
}

function subtractSeconds(timestamp: string, seconds: number): string {
  return new Date(parseTime("timestamp", timestamp) - seconds * 1000).toISOString();
}

function laterTimestamp(left: string, right: string): string {
  return parseTime("left timestamp", left) >= parseTime("right timestamp", right) ? left : right;
}

function stableRuntimeId(prefix: string, parts: readonly string[]): string {
  return `${prefix}:${parts.map((part) => encodeURIComponent(part)).join(":")}`;
}

export function acquisitionEnrollmentId(input: {
  organizationId: string;
  dataMode: AnalyticsDataMode;
  automationId: string;
  automationVersionId: string;
  triggerIdempotencyKey: string;
  subjectId: string;
}): string {
  return stableRuntimeId("enrollment", [
    input.organizationId,
    input.dataMode,
    input.automationId,
    input.automationVersionId,
    input.triggerIdempotencyKey,
    input.subjectId,
  ]);
}

export function acquisitionEffectId(input: {
  organizationId: string;
  dataMode: AnalyticsDataMode;
  automationId: string;
  automationVersionId: string;
  triggerIdempotencyKey: string;
  subjectId: string;
  stepId: string;
}): string {
  return stableRuntimeId("effect", [
    input.organizationId,
    input.dataMode,
    input.automationId,
    input.automationVersionId,
    input.triggerIdempotencyKey,
    input.subjectId,
    input.stepId,
  ]);
}

function resolveSubject(event: LifecycleEventEnvelope): {
  kind: AcquisitionSubjectKind;
  id: string;
  customerId?: string;
  leadId?: string;
} | null {
  if (event.customerId) {
    return { kind: "customer", id: event.customerId, customerId: event.customerId };
  }
  if (event.subjectKind === "customer" && event.subjectId) {
    return { kind: "customer", id: event.subjectId, customerId: event.subjectId };
  }
  if (event.subjectKind === "lead" && event.subjectId) {
    return { kind: "lead", id: event.subjectId, leadId: event.subjectId };
  }
  return null;
}

function stateReadInput(job: AcquisitionJob): AcquisitionStateReadInput {
  return {
    organizationId: job.organizationId,
    subjectKind: job.subjectKind,
    subjectId: job.subjectId,
    customerId: job.customerId,
    leadId: job.leadId,
    automationId: job.automationId,
    automationVersionId: job.automationVersionId,
    dataMode: job.dataMode,
  };
}

function enrollmentStateReadInput(input: {
  organizationId: string;
  subject: NonNullable<ReturnType<typeof resolveSubject>>;
  definition: AcquisitionAutomationDefinition;
  dataMode: AnalyticsDataMode;
}): AcquisitionStateReadInput {
  return {
    organizationId: input.organizationId,
    subjectKind: input.subject.kind,
    subjectId: input.subject.id,
    customerId: input.subject.customerId,
    leadId: input.subject.leadId,
    automationId: input.definition.automationId,
    automationVersionId: input.definition.versionId,
    dataMode: input.dataMode,
  };
}

function stopRuleDecision(
  definition: AcquisitionAutomationDefinition,
  state: AcquisitionCurrentState,
): StateDecision | null {
  for (const rule of definition.stopRules) {
    if (rule === "subject.deleted" && state.subject === "deleted") {
      return { disposition: "cancel", reason: "subject-deleted" };
    }
    if (rule === "registration.completed" && state.registration === "completed") {
      return { disposition: "cancel", reason: "registration-completed" };
    }
    if (rule === "activation.completed" && state.activation === "completed") {
      return { disposition: "cancel", reason: "activation-completed" };
    }
    if (rule === "onboarding.completed" && state.onboarding.status === "completed") {
      return { disposition: "cancel", reason: "onboarding-completed" };
    }
    if (rule === "trial.ended" && state.trial.status === "ended") {
      return { disposition: "cancel", reason: "trial-ended" };
    }
    if (rule === "purchase.completed" && state.purchase === "completed") {
      return { disposition: "cancel", reason: "purchase-completed" };
    }
    if (rule === "commercial.ineligible" && state.commercialEligibility === "ineligible") {
      return { disposition: "cancel", reason: "commercial-ineligible" };
    }
  }
  return null;
}

/**
 * Conservative current-state admission. Unknown required facts hold; known stop
 * conditions cancel. The state adapter must compose authoritative C/B/D/R1
 * commercial sources. F's projection is observability, not permission to send.
 */
export function evaluateAcquisitionCurrentState(
  definition: AcquisitionAutomationDefinition,
  state: AcquisitionCurrentState,
): StateDecision {
  if (state.organization === "missing") return { disposition: "cancel", reason: "organization-missing" };
  if (state.organization === "paused") return { disposition: "cancel", reason: "organization-paused" };
  if (state.organization === "unknown") {
    return { disposition: "hold", reason: "state-unknown", detail: "Organization state is unknown." };
  }
  if (state.subject === "missing") return { disposition: "cancel", reason: "subject-missing" };
  if (state.subject === "deleted") return { disposition: "cancel", reason: "subject-deleted" };
  if (state.subject === "unknown") {
    return { disposition: "hold", reason: "state-unknown", detail: "Subject state is unknown." };
  }

  const stop = stopRuleDecision(definition, state);
  if (stop) return stop;

  for (const predicate of definition.predicates) {
    if (predicate === "subject.active") continue;

    if (predicate === "registration.incomplete") {
      if (state.registration === "unknown") {
        return { disposition: "hold", reason: "state-unknown", detail: "Registration state is unknown." };
      }
      if (state.registration !== "incomplete") {
        return { disposition: "cancel", reason: "registration-completed" };
      }
    }

    if (predicate === "registration.completed") {
      if (state.registration === "unknown") {
        return { disposition: "hold", reason: "state-unknown", detail: "Registration state is unknown." };
      }
      if (state.registration !== "completed") {
        return { disposition: "cancel", reason: "registration-incomplete" };
      }
    }

    if (predicate === "activation.missing") {
      if (state.activation === "unknown") {
        return { disposition: "hold", reason: "state-unknown", detail: "Activation state is unknown." };
      }
      if (state.activation !== "missing") {
        return { disposition: "cancel", reason: "activation-completed" };
      }
    }

    if (predicate === "onboarding.incomplete") {
      if (state.onboarding.status === "unknown") {
        return { disposition: "hold", reason: "state-unknown", detail: "Onboarding state is unknown." };
      }
      if (state.onboarding.status === "completed") {
        return { disposition: "cancel", reason: "onboarding-completed" };
      }
      if (state.onboarding.status === "not-started") {
        return {
          disposition: "hold",
          reason: "state-unknown",
          detail: "Onboarding has not started for an onboarding reminder.",
        };
      }
    }

    if (predicate === "trial.active") {
      if (state.trial.status === "unknown") {
        return { disposition: "hold", reason: "state-unknown", detail: "Trial state is unknown." };
      }
      if (state.trial.status === "ended") return { disposition: "cancel", reason: "trial-ended" };
      if (state.trial.status !== "active") return { disposition: "cancel", reason: "trial-not-active" };
    }

    if (predicate === "purchase.absent") {
      if (state.purchase === "unknown") {
        return { disposition: "hold", reason: "state-unknown", detail: "Purchase state is unknown." };
      }
      if (state.purchase !== "absent") return { disposition: "cancel", reason: "purchase-completed" };
    }

    if (predicate === "commercial.eligible") {
      if (state.commercialEligibility === "unknown") {
        return { disposition: "hold", reason: "state-unknown", detail: "Commercial eligibility is unknown." };
      }
      if (state.commercialEligibility !== "eligible") {
        return { disposition: "cancel", reason: "commercial-ineligible" };
      }
    }
  }

  return { disposition: "eligible", reason: "scheduled" };
}

function scheduleDueAt(
  step: AcquisitionAutomationStep,
  triggerReceivedAt: string,
  state: AcquisitionCurrentState,
  recheckAt: string,
): { dueAt: string; held: boolean; reason: AcquisitionReasonCode; detail?: string } {
  if (step.schedule.kind === "after-trigger") {
    return {
      dueAt: addSeconds(triggerReceivedAt, step.schedule.delaySeconds),
      held: false,
      reason: "scheduled",
    };
  }

  if (state.trial.status === "active" && state.trial.endsAt && !Number.isNaN(Date.parse(state.trial.endsAt))) {
    const target = subtractSeconds(state.trial.endsAt, step.schedule.offsetSeconds);
    return {
      dueAt: parseTime("trial schedule", target) <= parseTime("trigger receipt", triggerReceivedAt)
        ? triggerReceivedAt
        : target,
      held: false,
      reason: "scheduled",
    };
  }

  return {
    dueAt: recheckAt,
    held: true,
    reason: "schedule-fact-unknown",
    detail: "A trusted trial end time is required before this step can be scheduled.",
  };
}

function initialWorkerResult(scanned: number): AcquisitionWorkerResult {
  return {
    scanned,
    leased: 0,
    processed: 0,
    providerAccepted: 0,
    held: 0,
    suppressed: 0,
    cancelled: 0,
    retrying: 0,
    failed: 0,
    unknownOutcome: 0,
    dryRun: 0,
  };
}

function incrementForStatus(result: AcquisitionWorkerResult, status: AcquisitionJobStatus): void {
  if (status === "provider-accepted") result.providerAccepted += 1;
  else if (status === "held" || status === "scheduled") result.held += 1;
  else if (status === "suppressed") result.suppressed += 1;
  else if (status === "cancelled") result.cancelled += 1;
  else if (status === "retrying") result.retrying += 1;
  else if (status === "failed") result.failed += 1;
  else if (status === "unknown-outcome") result.unknownOutcome += 1;
  else if (status === "dry-run") result.dryRun += 1;
}

function communicationReason(
  code: string | undefined,
  status: "hold" | "suppress",
): AcquisitionReasonCode {
  if (code === "sender-not-ready") return "sender-not-ready";
  if (code === "test-recipient-not-allowlisted") return "test-recipient-not-allowlisted";
  return status === "hold" ? "communication-held" : "communication-suppressed";
}

export function acquisitionRetryDelaySeconds(
  definition: AcquisitionAutomationDefinition,
  providerRetryAfterSeconds: number | undefined,
  providerAttemptCount: number,
): number {
  if (
    providerRetryAfterSeconds !== undefined
    && Number.isFinite(providerRetryAfterSeconds)
    && providerRetryAfterSeconds > 0
  ) {
    return Math.min(Math.ceil(providerRetryAfterSeconds), definition.retryPolicy.maxBackoffSeconds);
  }
  const exponential = definition.retryPolicy.baseBackoffSeconds * (2 ** Math.max(0, providerAttemptCount - 1));
  return Math.min(exponential, definition.retryPolicy.maxBackoffSeconds);
}

async function transition(
  dependencies: AcquisitionRuntimeDependencies,
  job: AcquisitionJob,
  leaseToken: string,
  status: Exclude<AcquisitionJobStatus, "leased">,
  reason: AcquisitionReasonCode,
  detail?: string,
  options: {
    dueAt?: string;
    providerAttemptCount?: number;
    providerMessageId?: string;
    providerRequestId?: string;
  } = {},
): Promise<AcquisitionJob> {
  const at = nowIso(dependencies);
  const updated = await dependencies.store.transitionLeasedJob({
    jobId: job.jobId,
    leaseToken,
    status,
    at,
    reason,
    detail,
    ...options,
  });
  await dependencies.store.finalizeEnrollmentIfSettled({ enrollmentId: job.enrollmentId, at });
  return updated;
}

async function holdForRecheck(
  dependencies: AcquisitionRuntimeDependencies,
  job: AcquisitionJob,
  leaseToken: string,
  reason: AcquisitionReasonCode,
  detail: string,
): Promise<AcquisitionJob> {
  const current = nowIso(dependencies);
  return transition(dependencies, job, leaseToken, "held", reason, detail, {
    dueAt: addSeconds(current, DEFAULT_UNKNOWN_STATE_RECHECK_SECONDS),
  });
}

async function processLeasedJob(
  dependencies: AcquisitionRuntimeDependencies,
  job: AcquisitionJob,
  leaseToken: string,
): Promise<AcquisitionJob> {
  const enrollment = await dependencies.store.getEnrollment(job.enrollmentId);
  if (!enrollment) {
    return transition(dependencies, job, leaseToken, "failed", "runtime-error", "Enrollment record is missing.");
  }

  const definition = await dependencies.definitions.getVersion({
    organizationId: job.organizationId,
    automationId: job.automationId,
    versionId: job.automationVersionId,
  });
  if (!definition) {
    return transition(
      dependencies,
      job,
      leaseToken,
      "failed",
      "definition-version-unavailable",
      "Pinned automation version is unavailable.",
    );
  }

  try {
    validateAcquisitionDefinition(definition);
  } catch (error) {
    return transition(
      dependencies,
      job,
      leaseToken,
      "failed",
      "runtime-error",
      error instanceof Error ? error.message : "Invalid automation definition.",
    );
  }

  const step = definition.steps.find((candidate) => candidate.stepId === job.stepId);
  if (!step) {
    return transition(
      dependencies,
      job,
      leaseToken,
      "failed",
      "definition-version-unavailable",
      "Pinned automation step is unavailable.",
    );
  }

  const pause = await dependencies.store.getPauseState({
    organizationId: job.organizationId,
    automationId: job.automationId,
    dataMode: job.dataMode,
  });
  if (pause.platformPaused) return transition(dependencies, job, leaseToken, "cancelled", "platform-paused");
  if (pause.organizationPaused) return transition(dependencies, job, leaseToken, "cancelled", "organization-paused");
  if (pause.automationPaused) return transition(dependencies, job, leaseToken, "cancelled", "automation-paused");

  const current = nowIso(dependencies);
  if (parseTime("expiration", enrollment.expiresAt) <= parseTime("current time", current)) {
    return transition(dependencies, job, leaseToken, "cancelled", "expired");
  }

  let state: AcquisitionCurrentState;
  try {
    state = await dependencies.state.readCurrentState(stateReadInput(job));
  } catch (error) {
    return holdForRecheck(
      dependencies,
      job,
      leaseToken,
      "state-unknown",
      error instanceof Error ? error.message : "Current authoritative state could not be read.",
    );
  }

  const stateDecision = evaluateAcquisitionCurrentState(definition, state);
  if (stateDecision.disposition === "cancel") {
    return transition(dependencies, job, leaseToken, "cancelled", stateDecision.reason, stateDecision.detail);
  }
  if (stateDecision.disposition === "hold") {
    return holdForRecheck(
      dependencies,
      job,
      leaseToken,
      stateDecision.reason,
      stateDecision.detail ?? "A required authoritative fact is unknown.",
    );
  }

  if (step.schedule.kind === "before-trial-end") {
    if (state.trial.status !== "active" || !state.trial.endsAt || Number.isNaN(Date.parse(state.trial.endsAt))) {
      return holdForRecheck(
        dependencies,
        job,
        leaseToken,
        "schedule-fact-unknown",
        "Trusted trial end time is unavailable.",
      );
    }
    const target = subtractSeconds(state.trial.endsAt, step.schedule.offsetSeconds);
    if (parseTime("trial step", target) > parseTime("current time", current)) {
      return transition(dependencies, job, leaseToken, "scheduled", "scheduled", undefined, { dueAt: target });
    }
  }

  const acceptedSince = subtractSeconds(current, definition.frequencyPolicy.windowSeconds);
  const acceptedCount = await dependencies.store.countProviderAcceptedEffects({
    organizationId: job.organizationId,
    subjectId: job.subjectId,
    dataMode: job.dataMode,
    purpose: step.action.purpose,
    since: acceptedSince,
  });
  if (acceptedCount >= definition.frequencyPolicy.maxProviderAcceptedEffects) {
    return transition(dependencies, job, leaseToken, "suppressed", "frequency-cap-reached");
  }

  const eligibilityInput: AcquisitionEmailEligibilityInput = {
    ...stateReadInput(job),
    effectId: job.effectId,
    stepId: job.stepId,
    templateId: step.action.templateId,
    templateVersionId: step.action.templateVersionId,
    purpose: step.action.purpose,
  };

  let eligibility;
  try {
    eligibility = await dependencies.email.evaluate(eligibilityInput);
  } catch (error) {
    return holdForRecheck(
      dependencies,
      job,
      leaseToken,
      "communication-held",
      error instanceof Error ? error.message : "Communication eligibility could not be evaluated.",
    );
  }

  if (eligibility.status === "hold") {
    return holdForRecheck(
      dependencies,
      job,
      leaseToken,
      communicationReason(eligibility.code, "hold"),
      eligibility.reason,
    );
  }
  if (eligibility.status === "suppress") {
    return transition(
      dependencies,
      job,
      leaseToken,
      "suppressed",
      communicationReason(eligibility.code, "suppress"),
      eligibility.reason,
    );
  }

  if (job.dataMode === "preview" || job.dataMode === "demo" || job.dataMode === "development") {
    return transition(
      dependencies,
      job,
      leaseToken,
      "dry-run",
      "preview-no-effects",
      "This execution mode never submits email to a provider.",
    );
  }

  // This durable marker is the ambiguity barrier. A worker that dies after it
  // is written must be recovered as unknown-outcome rather than re-leased.
  const markedJob = await dependencies.store.markProviderSubmissionStarted({
    jobId: job.jobId,
    leaseToken,
    at: current,
    attemptId: nextId(dependencies),
  });

  let submission;
  try {
    submission = await dependencies.email.submit({
      ...eligibilityInput,
      recipientRef: eligibility.recipientRef,
      correlationId: enrollment.triggerEventId,
      idempotencyKey: job.effectId,
    });
  } catch (error) {
    return transition(
      dependencies,
      markedJob,
      leaseToken,
      "unknown-outcome",
      "provider-unknown-outcome",
      error instanceof Error ? error.message : "Provider submission threw after the ambiguity barrier.",
      { providerAttemptCount: markedJob.providerAttemptCount },
    );
  }

  if (submission.status === "provider-accepted") {
    return transition(dependencies, markedJob, leaseToken, "provider-accepted", "provider-accepted", undefined, {
      providerAttemptCount: markedJob.providerAttemptCount,
      providerMessageId: submission.messageId,
      providerRequestId: submission.providerRequestId,
    });
  }

  if (submission.status === "suppressed") {
    return transition(
      dependencies,
      markedJob,
      leaseToken,
      "suppressed",
      "communication-suppressed",
      submission.reason,
      { providerAttemptCount: markedJob.providerAttemptCount },
    );
  }

  if (submission.status === "unknown-outcome") {
    return transition(
      dependencies,
      markedJob,
      leaseToken,
      "unknown-outcome",
      "provider-unknown-outcome",
      submission.reason,
      {
        providerAttemptCount: markedJob.providerAttemptCount,
        providerRequestId: submission.providerRequestId,
      },
    );
  }

  if (submission.status === "permanent-failure") {
    return transition(
      dependencies,
      markedJob,
      leaseToken,
      "failed",
      "provider-permanent-failure",
      submission.reason,
      {
        providerAttemptCount: markedJob.providerAttemptCount,
        providerRequestId: submission.providerRequestId,
      },
    );
  }

  if (markedJob.providerAttemptCount >= definition.retryPolicy.maxAttempts) {
    return transition(dependencies, markedJob, leaseToken, "failed", "retry-exhausted", submission.reason, {
      providerAttemptCount: markedJob.providerAttemptCount,
      providerRequestId: submission.providerRequestId,
    });
  }

  const retryDelay = acquisitionRetryDelaySeconds(
    definition,
    submission.retryAfterSeconds,
    markedJob.providerAttemptCount,
  );
  return transition(
    dependencies,
    markedJob,
    leaseToken,
    "retrying",
    "provider-retryable-failure",
    submission.reason,
    {
      providerAttemptCount: markedJob.providerAttemptCount,
      providerRequestId: submission.providerRequestId,
      dueAt: addSeconds(current, retryDelay),
    },
  );
}

export function createAcquisitionRuntime(dependencies: AcquisitionRuntimeDependencies) {
  return {
    async enroll(request: AcquisitionTriggerRequest): Promise<readonly AcquisitionEnrollmentDecision[]> {
      const event = validateLifecycleEventEnvelope(request.event);
      const definitions = await dependencies.definitions.listPublishedForTrigger({
        organizationId: event.organizationId,
        eventType: event.eventType,
      });
      const subject = resolveSubject(event);
      const decisions: AcquisitionEnrollmentDecision[] = [];

      for (const candidate of definitions) {
        const definition = validateAcquisitionDefinition(candidate);

        if (definition.organizationId !== event.organizationId || definition.triggerEventType !== event.eventType) {
          decisions.push({
            automationId: definition.automationId,
            versionId: definition.versionId,
            status: "skipped",
            reason: "trigger-not-approved",
          });
          continue;
        }
        if (!definition.enabled) {
          decisions.push({
            automationId: definition.automationId,
            versionId: definition.versionId,
            status: "skipped",
            reason: "definition-disabled",
          });
          continue;
        }
        if (!definition.allowedTriggerSources.includes(event.source)) {
          decisions.push({
            automationId: definition.automationId,
            versionId: definition.versionId,
            status: "skipped",
            reason: "trigger-source-not-approved",
          });
          continue;
        }
        if (request.executionIntent === "projection-replay") {
          decisions.push({
            automationId: definition.automationId,
            versionId: definition.versionId,
            status: "skipped",
            reason: "projection-replay-no-effects",
          });
          continue;
        }
        if (!subject) {
          decisions.push({
            automationId: definition.automationId,
            versionId: definition.versionId,
            status: "held",
            reason: "subject-unresolved",
          });
          continue;
        }

        const pause = await dependencies.store.getPauseState({
          organizationId: event.organizationId,
          automationId: definition.automationId,
          dataMode: event.dataMode,
        });
        if (pause.platformPaused || pause.organizationPaused || pause.automationPaused) {
          decisions.push({
            automationId: definition.automationId,
            versionId: definition.versionId,
            status: "skipped",
            reason: pause.platformPaused
              ? "platform-paused"
              : pause.organizationPaused
                ? "organization-paused"
                : "automation-paused",
          });
          continue;
        }

        let currentState: AcquisitionCurrentState;
        try {
          currentState = await dependencies.state.readCurrentState(enrollmentStateReadInput({
            organizationId: event.organizationId,
            subject,
            definition,
            dataMode: event.dataMode,
          }));
        } catch {
          currentState = {
            checkedAt: nowIso(dependencies),
            organization: "unknown",
            subject: "unknown",
            registration: "unknown",
            onboarding: { status: "unknown" },
            activation: "unknown",
            trial: { status: "unknown" },
            purchase: "unknown",
            commercialEligibility: "unknown",
          };
        }

        const stateDecision = evaluateAcquisitionCurrentState(definition, currentState);
        if (stateDecision.disposition === "cancel") {
          decisions.push({
            automationId: definition.automationId,
            versionId: definition.versionId,
            status: "skipped",
            reason: stateDecision.reason,
          });
          continue;
        }

        if (event.dataMode === "preview") {
          decisions.push({
            automationId: definition.automationId,
            versionId: definition.versionId,
            status: "dry-run",
            reason: "preview-no-effects",
          });
          continue;
        }

        const enrollmentId = acquisitionEnrollmentId({
          organizationId: event.organizationId,
          dataMode: event.dataMode,
          automationId: definition.automationId,
          automationVersionId: definition.versionId,
          triggerIdempotencyKey: event.idempotencyKey,
          subjectId: subject.id,
        });
        const createdAt = event.receivedAt;
        const expiresAt = addSeconds(createdAt, definition.expirationSeconds);
        const recheckAt = addSeconds(nowIso(dependencies), DEFAULT_UNKNOWN_STATE_RECHECK_SECONDS);

        const jobs: AcquisitionJob[] = definition.steps.map((step) => {
          const schedule = scheduleDueAt(step, event.receivedAt, currentState, recheckAt);
          const held = stateDecision.disposition === "hold" || schedule.held;
          const reason = stateDecision.disposition === "hold" ? stateDecision.reason : schedule.reason;
          const detail = stateDecision.disposition === "hold" ? stateDecision.detail : schedule.detail;
          const effectId = acquisitionEffectId({
            organizationId: event.organizationId,
            dataMode: event.dataMode,
            automationId: definition.automationId,
            automationVersionId: definition.versionId,
            triggerIdempotencyKey: event.idempotencyKey,
            subjectId: subject.id,
            stepId: step.stepId,
          });

          // Unknown state must never cause a configured future step to run early.
          // Trial-relative unknown schedules deliberately recheck because the
          // not-before instant cannot yet be calculated.
          const heldDueAt = schedule.held
            ? schedule.dueAt
            : laterTimestamp(schedule.dueAt, recheckAt);

          return {
            schemaVersion: ACQUISITION_RUNTIME_SCHEMA_VERSION,
            jobId: effectId,
            effectId,
            enrollmentId,
            organizationId: event.organizationId,
            automationId: definition.automationId,
            automationVersionId: definition.versionId,
            subjectKind: subject.kind,
            subjectId: subject.id,
            customerId: subject.customerId,
            leadId: subject.leadId,
            dataMode: event.dataMode,
            stepId: step.stepId,
            dueAt: held ? heldDueAt : schedule.dueAt,
            status: held ? "held" : "scheduled",
            providerAttemptCount: 0,
            lastExplanation: { at: createdAt, reason, detail },
            updatedAt: createdAt,
          };
        });

        const result = await dependencies.store.createEnrollmentIfAbsent({
          enrollment: {
            schemaVersion: ACQUISITION_RUNTIME_SCHEMA_VERSION,
            enrollmentId,
            organizationId: event.organizationId,
            automationId: definition.automationId,
            automationVersionId: definition.versionId,
            subjectKind: subject.kind,
            subjectId: subject.id,
            customerId: subject.customerId,
            leadId: subject.leadId,
            triggerEventId: event.eventId,
            triggerIdempotencyKey: event.idempotencyKey,
            triggerEventType: event.eventType,
            dataMode: event.dataMode,
            createdAt,
            expiresAt,
            status: stateDecision.disposition === "hold" ? "held" : "active",
            lastExplanation: {
              at: createdAt,
              reason: stateDecision.disposition === "hold" ? stateDecision.reason : "scheduled",
              detail: stateDecision.detail,
            },
          },
          jobs,
        });

        decisions.push({
          automationId: definition.automationId,
          versionId: definition.versionId,
          status: result.status === "created"
            ? stateDecision.disposition === "hold" ? "held" : "enrolled"
            : "duplicate",
          reason: result.status === "created"
            ? stateDecision.disposition === "hold" ? stateDecision.reason : "scheduled"
            : "duplicate-enrollment",
          enrollmentId: result.enrollment.enrollmentId,
        });
      }

      return decisions;
    },

    async drain(input: DrainAcquisitionJobsInput): Promise<AcquisitionWorkerResult> {
      const current = nowIso(dependencies);
      const due = await dependencies.store.listDueJobs({
        beforeOrAt: current,
        limit: Math.max(1, Math.min(input.limit ?? 50, 200)),
        dataMode: input.dataMode,
      });
      const result = initialWorkerResult(due.length);

      for (const job of due) {
        const leaseToken = nextId(dependencies);
        const leasedAt = nowIso(dependencies);
        const lease = await dependencies.store.tryLeaseJob({
          jobId: job.jobId,
          workerId: input.workerId,
          leaseToken,
          leasedAt,
          leaseExpiresAt: addSeconds(leasedAt, DEFAULT_JOB_LEASE_SECONDS),
        });

        if (lease.status === "unknown-outcome") {
          result.processed += 1;
          result.unknownOutcome += 1;
          await dependencies.store.finalizeEnrollmentIfSettled({
            enrollmentId: lease.job.enrollmentId,
            at: leasedAt,
          });
          continue;
        }
        if (lease.status !== "leased") continue;

        result.leased += 1;
        try {
          const processed = await processLeasedJob(dependencies, lease.job, leaseToken);
          result.processed += 1;
          incrementForStatus(result, processed.status);
        } catch {
          // Never guess which side of the external submission boundary an
          // unexpected crash occurred on. Leave the lease durable. Once it
          // expires, the store may safely re-lease work that never crossed the
          // persisted barrier, while barrier-crossed work becomes unknown-outcome.
          continue;
        }
      }

      return result;
    },
  };
}
