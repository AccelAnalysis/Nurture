import type {
  AnalyticsDataMode,
  AnalyticsEventType,
  LifecycleEventEnvelope,
  LifecycleEventSource,
} from "../analytics/contracts.js";

export const ACQUISITION_AUTOMATION_SCHEMA_VERSION = 1 as const;
export const ACQUISITION_RUNTIME_SCHEMA_VERSION = 1 as const;
export const MAX_ACQUISITION_STEPS = 4;
export const MAX_ACQUISITION_DELAY_SECONDS = 60 * 60 * 24 * 45;
export const MAX_ACQUISITION_EXPIRATION_SECONDS = 60 * 60 * 24 * 90;
export const DEFAULT_JOB_LEASE_SECONDS = 120;
export const DEFAULT_UNKNOWN_STATE_RECHECK_SECONDS = 300;

export type AcquisitionCatalogId =
  | "R2-WELCOME"
  | "R2-LEAD"
  | "R2-ACTIVATE"
  | "R2-ONBOARD"
  | "R2-TRIAL"
  | "R2-CHECKOUT";

export type AcquisitionSubjectKind = "lead" | "customer";

/**
 * Structurally identical to Track D's canonical CommunicationPurpose. Keep this
 * local alias only so the tracks can compile independently; the release finisher
 * may replace it with D's exported type during composition.
 */
export type AcquisitionMessagePurpose = "transactional" | "marketing";

/** Structurally identical to Track D's approved Release 2 template IDs. */
export type AcquisitionCommunicationTemplateId =
  | "registration-welcome"
  | "onboarding-reminder"
  | "lead-follow-up"
  | "activation-invitation"
  | "trial-conversion"
  | "checkout-recovery";

export type AcquisitionPredicateKey =
  | "subject.active"
  | "registration.incomplete"
  | "registration.completed"
  | "activation.missing"
  | "onboarding.incomplete"
  | "trial.active"
  | "purchase.absent"
  | "commercial.eligible";

export type AcquisitionStopRule =
  | "subject.deleted"
  | "registration.completed"
  | "activation.completed"
  | "onboarding.completed"
  | "trial.ended"
  | "purchase.completed"
  | "commercial.ineligible";

export type AcquisitionSchedule =
  | { kind: "after-trigger"; delaySeconds: number }
  | { kind: "before-trial-end"; offsetSeconds: number };

export interface AcquisitionEmailAction {
  kind: "email";
  templateId: AcquisitionCommunicationTemplateId;
  /** Published Track D template version pinned at enrollment. */
  templateVersion: number;
  purpose: AcquisitionMessagePurpose;
}

export interface AcquisitionAutomationStep {
  stepId: string;
  schedule: AcquisitionSchedule;
  action: AcquisitionEmailAction;
}

export interface AcquisitionRetryPolicy {
  maxAttempts: number;
  baseBackoffSeconds: number;
  maxBackoffSeconds: number;
}

export interface AcquisitionFrequencyPolicy {
  maxProviderAcceptedEffects: number;
  windowSeconds: number;
}

/**
 * Immutable published automation version consumed by the runtime. Draft storage,
 * publication, and configuration UI are separate concerns. Release 2 deliberately
 * supports only the bounded trigger/predicate/email-action vocabulary above.
 */
export interface AcquisitionAutomationDefinition {
  schemaVersion: typeof ACQUISITION_AUTOMATION_SCHEMA_VERSION;
  organizationId: string;
  automationId: AcquisitionCatalogId;
  versionId: string;
  enabled: boolean;
  triggerEventType: AnalyticsEventType;
  allowedTriggerSources: readonly LifecycleEventSource[];
  predicates: readonly AcquisitionPredicateKey[];
  stopRules: readonly AcquisitionStopRule[];
  steps: readonly AcquisitionAutomationStep[];
  expirationSeconds: number;
  retryPolicy: AcquisitionRetryPolicy;
  frequencyPolicy: AcquisitionFrequencyPolicy;
  publishedAt: string;
}

export type AcquisitionRunStatus =
  | "active"
  | "held"
  | "completed"
  | "cancelled"
  | "failed";

export type AcquisitionJobStatus =
  | "scheduled"
  | "leased"
  | "held"
  | "retrying"
  | "provider-accepted"
  | "dry-run"
  | "suppressed"
  | "cancelled"
  | "failed"
  | "unknown-outcome";

export type AcquisitionReasonCode =
  | "scheduled"
  | "duplicate-enrollment"
  | "projection-replay-no-effects"
  | "preview-no-effects"
  | "definition-disabled"
  | "definition-version-unavailable"
  | "trigger-not-approved"
  | "trigger-source-not-approved"
  | "subject-unresolved"
  | "schedule-fact-unknown"
  | "platform-paused"
  | "organization-paused"
  | "automation-paused"
  | "organization-missing"
  | "subject-missing"
  | "subject-deleted"
  | "state-unknown"
  | "registration-completed"
  | "registration-incomplete"
  | "activation-completed"
  | "onboarding-completed"
  | "trial-not-active"
  | "trial-ended"
  | "purchase-completed"
  | "commercial-ineligible"
  | "frequency-cap-reached"
  | "expired"
  | "communication-held"
  | "communication-suppressed"
  | "test-recipient-not-allowlisted"
  | "sender-not-ready"
  | "provider-accepted"
  | "provider-retryable-failure"
  | "provider-permanent-failure"
  | "provider-unknown-outcome"
  | "retry-exhausted"
  | "lease-unavailable"
  | "lease-lost"
  | "runtime-error";

export interface AcquisitionExplanation {
  at: string;
  reason: AcquisitionReasonCode;
  detail?: string;
}

export interface AcquisitionEnrollment {
  schemaVersion: typeof ACQUISITION_RUNTIME_SCHEMA_VERSION;
  enrollmentId: string;
  organizationId: string;
  automationId: AcquisitionCatalogId;
  automationVersionId: string;
  subjectKind: AcquisitionSubjectKind;
  subjectId: string;
  customerId?: string;
  leadId?: string;
  triggerEventId: string;
  triggerIdempotencyKey: string;
  triggerEventType: AnalyticsEventType;
  dataMode: AnalyticsDataMode;
  createdAt: string;
  expiresAt: string;
  status: AcquisitionRunStatus;
  lastExplanation: AcquisitionExplanation;
}

export interface AcquisitionJobLease {
  leaseToken: string;
  workerId: string;
  leasedAt: string;
  expiresAt: string;
}

export interface AcquisitionJob {
  schemaVersion: typeof ACQUISITION_RUNTIME_SCHEMA_VERSION;
  jobId: string;
  effectId: string;
  enrollmentId: string;
  organizationId: string;
  automationId: AcquisitionCatalogId;
  automationVersionId: string;
  subjectKind: AcquisitionSubjectKind;
  subjectId: string;
  customerId?: string;
  leadId?: string;
  dataMode: AnalyticsDataMode;
  stepId: string;
  dueAt: string;
  status: AcquisitionJobStatus;
  providerAttemptCount: number;
  lease?: AcquisitionJobLease;
  /**
   * Persisted immediately before crossing the provider submission boundary.
   * If a worker dies after this marker, recovery must classify the stale job as
   * unknown-outcome rather than re-leasing it for a blind duplicate send.
   */
  providerSubmissionStartedAt?: string;
  providerSubmissionAttemptId?: string;
  providerMessageId?: string;
  providerRequestId?: string;
  lastExplanation: AcquisitionExplanation;
  updatedAt: string;
}

export interface AcquisitionPauseState {
  platformPaused: boolean;
  organizationPaused: boolean;
  automationPaused: boolean;
  checkedAt: string;
}

export interface AcquisitionCurrentState {
  checkedAt: string;
  organization: "active" | "paused" | "missing" | "unknown";
  subject: "active" | "deleted" | "missing" | "unknown";
  registration: "completed" | "incomplete" | "unknown";
  onboarding: {
    status: "not-started" | "incomplete" | "completed" | "unknown";
    flowVersionId?: string;
  };
  activation: "completed" | "missing" | "unknown";
  trial: {
    status: "none" | "active" | "ended" | "unknown";
    endsAt?: string;
  };
  purchase: "completed" | "absent" | "unknown";
  commercialEligibility: "eligible" | "ineligible" | "unknown";
}

export interface AcquisitionStateReadInput {
  organizationId: string;
  subjectKind: AcquisitionSubjectKind;
  subjectId: string;
  customerId?: string;
  leadId?: string;
  automationId: AcquisitionCatalogId;
  automationVersionId: string;
  dataMode: AnalyticsDataMode;
}

export interface AcquisitionStatePort {
  /**
   * Composes current authoritative C/B/D state. Implementations must not use a
   * stale lifecycle projection as permission to send.
   */
  readCurrentState(input: AcquisitionStateReadInput): Promise<AcquisitionCurrentState>;
}

export interface AcquisitionEmailEligibilityInput extends AcquisitionStateReadInput {
  effectId: string;
  stepId: string;
  templateId: AcquisitionCommunicationTemplateId;
  templateVersion: number;
  purpose: AcquisitionMessagePurpose;
}

export type AcquisitionEmailEligibilityResult =
  | {
      status: "eligible";
      checkedAt: string;
      recipientRef: string;
      reason?: string;
    }
  | {
      status: "hold";
      checkedAt: string;
      reason: string;
      code?: "sender-not-ready" | "test-recipient-not-allowlisted" | "consent" | "suppression" | "recipient-unavailable" | "unknown";
    }
  | {
      status: "suppress";
      checkedAt: string;
      reason: string;
      code?: "sender-not-ready" | "test-recipient-not-allowlisted" | "consent" | "suppression" | "recipient-unavailable" | "unknown";
    };

export interface AcquisitionEmailSubmitInput extends AcquisitionEmailEligibilityInput {
  recipientRef: string;
  correlationId: string;
  idempotencyKey: string;
}

export type AcquisitionEmailSubmitResult =
  | {
      status: "provider-accepted";
      acceptedAt: string;
      messageId: string;
      providerRequestId?: string;
    }
  | {
      status: "suppressed";
      reason: string;
    }
  | {
      status: "retryable-failure";
      reason: string;
      retryAfterSeconds?: number;
      providerRequestId?: string;
    }
  | {
      status: "permanent-failure";
      reason: string;
      providerRequestId?: string;
    }
  | {
      status: "unknown-outcome";
      reason: string;
      providerRequestId?: string;
    };

/**
 * Track D implements this boundary. `submit` must apply Track D's safety
 * evaluator again immediately before provider submission; the separate
 * `evaluate` call lets Track E record an explanation before dispatch.
 */
export interface AcquisitionEmailDispatchPort {
  evaluate(input: AcquisitionEmailEligibilityInput): Promise<AcquisitionEmailEligibilityResult>;
  submit(input: AcquisitionEmailSubmitInput): Promise<AcquisitionEmailSubmitResult>;
}

export interface AcquisitionDefinitionPort {
  listPublishedForTrigger(input: {
    organizationId: string;
    eventType: AnalyticsEventType;
  }): Promise<readonly AcquisitionAutomationDefinition[]>;
  getVersion(input: {
    organizationId: string;
    automationId: AcquisitionCatalogId;
    versionId: string;
  }): Promise<AcquisitionAutomationDefinition | null>;
}

export interface CreateEnrollmentInput {
  enrollment: AcquisitionEnrollment;
  jobs: readonly AcquisitionJob[];
}

export type CreateEnrollmentResult =
  | { status: "created"; enrollment: AcquisitionEnrollment; jobs: readonly AcquisitionJob[] }
  | { status: "duplicate"; enrollment: AcquisitionEnrollment };

export interface LeaseJobInput {
  jobId: string;
  workerId: string;
  leaseToken: string;
  leasedAt: string;
  leaseExpiresAt: string;
}

export type LeaseJobResult =
  | { status: "leased"; job: AcquisitionJob }
  | { status: "unknown-outcome"; job: AcquisitionJob }
  | { status: "unavailable"; reason: "terminal" | "not-due" | "active-lease" | "missing" };

export interface MarkProviderSubmissionStartedInput {
  jobId: string;
  leaseToken: string;
  at: string;
  attemptId: string;
}

export interface TransitionLeasedJobInput {
  jobId: string;
  leaseToken: string;
  status: Exclude<AcquisitionJobStatus, "leased">;
  at: string;
  reason: AcquisitionReasonCode;
  detail?: string;
  dueAt?: string;
  providerAttemptCount?: number;
  providerMessageId?: string;
  providerRequestId?: string;
}

export interface AcquisitionRuntimeStore {
  /** Atomic enrollment + initial job creation. */
  createEnrollmentIfAbsent(input: CreateEnrollmentInput): Promise<CreateEnrollmentResult>;
  getEnrollment(enrollmentId: string): Promise<AcquisitionEnrollment | null>;
  listDueJobs(input: {
    beforeOrAt: string;
    limit: number;
    dataMode?: AnalyticsDataMode;
  }): Promise<readonly AcquisitionJob[]>;
  /**
   * Atomically acquires due work. If an expired lease already crossed the
   * provider-submission marker, implementations must atomically convert it to
   * unknown-outcome and return that status instead of granting another lease.
   */
  tryLeaseJob(input: LeaseJobInput): Promise<LeaseJobResult>;
  /** Durable ambiguity barrier written before calling the external provider. */
  markProviderSubmissionStarted(input: MarkProviderSubmissionStartedInput): Promise<AcquisitionJob>;
  transitionLeasedJob(input: TransitionLeasedJobInput): Promise<AcquisitionJob>;
  getPauseState(input: {
    organizationId: string;
    automationId: AcquisitionCatalogId;
    dataMode: AnalyticsDataMode;
  }): Promise<AcquisitionPauseState>;
  countProviderAcceptedEffects(input: {
    organizationId: string;
    subjectId: string;
    dataMode: AnalyticsDataMode;
    purpose: AcquisitionMessagePurpose;
    since: string;
  }): Promise<number>;
  cancelPending(input: {
    organizationId: string;
    subjectId: string;
    dataMode: AnalyticsDataMode;
    automationId?: AcquisitionCatalogId;
    at: string;
    reason: AcquisitionReasonCode;
    detail?: string;
  }): Promise<number>;
  finalizeEnrollmentIfSettled(input: {
    enrollmentId: string;
    at: string;
  }): Promise<AcquisitionEnrollment | null>;
  getOperationsSnapshot(input: {
    organizationId?: string;
    dataMode?: AnalyticsDataMode;
    limit: number;
  }): Promise<AcquisitionOperationsSnapshot>;
}

export interface AcquisitionTriggerRequest {
  event: LifecycleEventEnvelope;
  /** Historical replay is projection-only by default and must not create effects. */
  executionIntent?: "normal" | "projection-replay";
}

export interface AcquisitionEnrollmentDecision {
  automationId: AcquisitionCatalogId;
  versionId: string;
  status: "enrolled" | "duplicate" | "held" | "skipped" | "dry-run";
  reason: AcquisitionReasonCode;
  enrollmentId?: string;
}

export interface AcquisitionWorkerResult {
  scanned: number;
  leased: number;
  processed: number;
  providerAccepted: number;
  held: number;
  suppressed: number;
  cancelled: number;
  retrying: number;
  failed: number;
  unknownOutcome: number;
  dryRun: number;
}

export interface AcquisitionOperationsSnapshot {
  generatedAt: string;
  platformPaused: boolean;
  organizationPaused?: boolean;
  counts: Partial<Record<AcquisitionJobStatus, number>>;
  recentJobs: readonly AcquisitionJob[];
  backendPersistence: "ready" | "blocked" | "unknown";
  scheduler: "ready" | "blocked" | "unknown";
  note?: string;
}

export interface AcquisitionControlCommandResult {
  ok: boolean;
  reason?: string;
  changedAt?: string;
}

/**
 * Async server command surface for the operations panel. Implementations must
 * authorize organization lifecycle management or platform operations server-side
 * and write audit records before reporting success.
 */
export interface AcquisitionControlCommandPort {
  setOrganizationPaused(input: {
    organizationId: string;
    paused: boolean;
    reason: string;
  }): Promise<AcquisitionControlCommandResult>;
  setAutomationPaused(input: {
    organizationId: string;
    automationId: AcquisitionCatalogId;
    paused: boolean;
    reason: string;
  }): Promise<AcquisitionControlCommandResult>;
  setPlatformPaused(input: {
    paused: boolean;
    reason: string;
  }): Promise<AcquisitionControlCommandResult>;
}
