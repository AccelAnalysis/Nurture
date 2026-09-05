import type {
  AnalyticsDataMode,
  AnalyticsEventType,
  EventPayload,
  LifecycleEventEnvelope,
  LifecycleEventSource,
} from "../analytics/contracts.js";
import type { OrganizationCapability } from "../platform/authorization.js";

export const LIFECYCLE_PROJECTION_SCHEMA_VERSION = 1 as const;
export const LIFECYCLE_PROCESSOR_VERSION = "r2-f-1" as const;
export const LIFECYCLE_QUERY_DEFAULT_LIMIT = 25;
export const LIFECYCLE_QUERY_MAX_LIMIT = 100;

export type LifecycleProjectionProvenance =
  | "initial"
  | "event"
  | "authoritative_snapshot"
  | "backfill_snapshot";

export interface LifecycleProjectionMetadata {
  provenance: LifecycleProjectionProvenance;
  stale: boolean;
  updatedAt: string;
  source?: string;
  sourceEventId?: string;
  sourceEventType?: AnalyticsEventType;
  sourceOccurredAt?: string;
  sourceReceivedAt?: string;
  sourceVersion?: string;
  note?: string;
}

export type IdentityLifecycleState = "unknown" | "lead" | "registered" | "verified";
export interface IdentityLifecycleProjection {
  state: IdentityLifecycleState;
  identityId?: string;
  metadata: LifecycleProjectionMetadata;
}

export type OnboardingLifecycleState = "unknown" | "not_started" | "in_progress" | "completed";
export interface OnboardingLifecycleProjection {
  state: OnboardingLifecycleState;
  flowVersion?: string;
  startedAt?: string;
  completedAt?: string;
  lastCompletedStepId?: string;
  metadata: LifecycleProjectionMetadata;
}

export type CommercialLifecycleState =
  | "unknown"
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "inactive";

/**
 * This is an administrative commercial summary. It never grants entitlements.
 * Protected Experience access remains derived by the trusted billing/entitlement path.
 */
export interface CommercialLifecycleProjection {
  state: CommercialLifecycleState;
  offerId?: string;
  offerVersion?: string;
  subscriptionId?: string;
  trialEnd?: string;
  currentPeriodEnd?: string;
  metadata: LifecycleProjectionMetadata;
}

export type ExperienceLifecycleState = "unknown" | "not_started" | "started" | "activated" | "inactive";
export interface ExperienceMilestoneProjection {
  /** Logical occurrence identity; canonical duplicates share this idempotency key. */
  milestoneId: string;
  /** B-owned semantic milestone declaration key. */
  milestoneKey: string;
  activation: boolean;
  eventId: string;
  occurredAt: string;
  label?: string;
  experienceId?: string;
  moduleId?: string;
  moduleVersion?: string;
}
export interface ExperienceLifecycleProjection {
  state: ExperienceLifecycleState;
  firstUseAt?: string;
  lastUseAt?: string;
  firstMeaningfulUseAt?: string;
  lastMeaningfulUseAt?: string;
  milestones: readonly ExperienceMilestoneProjection[];
  metadata: LifecycleProjectionMetadata;
}

export type CommunicationPurpose = "transactional" | "marketing";
export type CommunicationEligibilityState = "unknown" | "eligible" | "ineligible" | "suppressed";
export interface CommunicationPurposeProjection {
  state: CommunicationEligibilityState;
  reasonCodes: readonly string[];
  metadata: LifecycleProjectionMetadata;
}
export interface CommunicationLifecycleProjection {
  email: Readonly<Record<CommunicationPurpose, CommunicationPurposeProjection>>;
}

export interface CustomerLifecycleProjection {
  projectionSchemaVersion: typeof LIFECYCLE_PROJECTION_SCHEMA_VERSION;
  processorVersion: typeof LIFECYCLE_PROCESSOR_VERSION;
  organizationId: string;
  customerId: string;
  dataMode: AnalyticsDataMode;
  identity: IdentityLifecycleProjection;
  onboarding: OnboardingLifecycleProjection;
  commercial: CommercialLifecycleProjection;
  experience: ExperienceLifecycleProjection;
  communication: CommunicationLifecycleProjection;
  createdAt: string;
  updatedAt: string;
}

export interface AuthoritativeCommercialSnapshot {
  organizationId: string;
  customerId: string;
  version: string;
  asOf: string;
  state: CommercialLifecycleState;
  offerId?: string;
  offerVersion?: string;
  subscriptionId?: string;
  trialEnd?: string;
  currentPeriodEnd?: string;
  source: "billing-reconciler";
}

export interface AuthoritativeCommunicationEligibilitySnapshot {
  organizationId: string;
  customerId: string;
  version: string;
  asOf: string;
  source: "email-eligibility-evaluator";
  email: Readonly<Record<CommunicationPurpose, {
    state: CommunicationEligibilityState;
    reasonCodes: readonly string[];
  }>>;
}

export interface LifecycleCurrentStateBackfillSnapshot {
  organizationId: string;
  customerId: string;
  version: string;
  asOf: string;
  identity?: Pick<IdentityLifecycleProjection, "state" | "identityId">;
  onboarding?: Pick<OnboardingLifecycleProjection, "state" | "flowVersion" | "startedAt" | "completedAt" | "lastCompletedStepId">;
  experience?: Pick<ExperienceLifecycleProjection, "state" | "firstUseAt" | "lastUseAt" | "firstMeaningfulUseAt" | "lastMeaningfulUseAt" | "milestones">;
}

export interface LifecycleProjectionRefreshRequest {
  commercial: boolean;
  communication: boolean;
}

export type LifecycleProjectionIgnoreReason =
  | "not_customer_scoped"
  | "not_projected"
  | "wrong_scope"
  | "wrong_mode";

export interface LifecycleProjectionApplyResult {
  projection: CustomerLifecycleProjection;
  applied: boolean;
  ignoredReason?: LifecycleProjectionIgnoreReason;
  refresh: LifecycleProjectionRefreshRequest;
}

export interface LifecycleProjectionCheckpoint {
  organizationId: string;
  customerId: string;
  dataMode: AnalyticsDataMode;
  processorVersion: typeof LIFECYCLE_PROCESSOR_VERSION;
  processedCount: number;
  appliedCount: number;
  rejectedCount: number;
  latestReceivedAt?: string;
  latestOccurredAt?: string;
  latestEventId?: string;
  maxReceiptLagMs: number;
  revision: number;
  updatedAt: string;
}

export type LifecycleDataQualityCode =
  | "rejected_event"
  | "projection_stale"
  | "processing_delayed"
  | "projection_failed"
  | "missing_authoritative_snapshot";

export interface LifecycleDataQualityIndicator {
  code: LifecycleDataQualityCode;
  count: number;
  message: string;
}

export interface LifecycleAdminStageView {
  /** Derived administration view only. Never use this value for authorization. */
  nonAuthoritative: true;
  primaryStage: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
  activeStages: readonly (1 | 2 | 3 | 4 | 5 | 6 | 7)[];
  label: string;
  reasons: readonly string[];
}

export interface CustomerLifecycleSummary {
  organizationId: string;
  customerId: string;
  dataMode: AnalyticsDataMode;
  identity: IdentityLifecycleProjection;
  onboarding: OnboardingLifecycleProjection;
  commercial: CommercialLifecycleProjection;
  experience: ExperienceLifecycleProjection;
  communication: CommunicationLifecycleProjection;
  stageView: LifecycleAdminStageView;
  dataQuality: readonly LifecycleDataQualityIndicator[];
  updatedAt: string;
}

export type CustomerTimelineCategory =
  | "identity"
  | "onboarding"
  | "commerce"
  | "experience"
  | "communication"
  | "automation"
  | "configuration"
  | "public"
  | "other";

export interface CustomerTimelineSourceReference {
  eventId: string;
  eventType: AnalyticsEventType;
  source: LifecycleEventSource;
  correlationId: string;
  idempotencyKey: string;
}

export interface CustomerTimelineLinkedAutomationStatus {
  runId: string;
  status: string;
  reasonCode?: string;
  nextScheduledAt?: string;
}

export interface CustomerTimelineLinkedCommunicationStatus {
  messageId: string;
  status: string;
  reasonCode?: string;
}

export interface CustomerTimelineEntry {
  id: string;
  organizationId: string;
  customerId: string;
  eventId: string;
  eventType: AnalyticsEventType;
  category: CustomerTimelineCategory;
  label: string;
  occurredAt: string;
  receivedAt: string;
  dataMode: AnalyticsDataMode;
  source: LifecycleEventSource;
  sourceReference: CustomerTimelineSourceReference;
  details: EventPayload;
  automation?: CustomerTimelineLinkedAutomationStatus;
  communication?: CustomerTimelineLinkedCommunicationStatus;
}

export interface LifecyclePagination {
  limit?: number;
  cursor?: string;
}

export interface LifecycleCustomerFilters {
  identity?: readonly IdentityLifecycleState[];
  onboarding?: readonly OnboardingLifecycleState[];
  commercial?: readonly CommercialLifecycleState[];
  experience?: readonly ExperienceLifecycleState[];
  communicationMarketing?: readonly CommunicationEligibilityState[];
}

export interface LifecycleCustomerListQuery extends LifecyclePagination {
  organizationId: string;
  actorIdentityId: string;
  dataMode?: AnalyticsDataMode;
  filters?: LifecycleCustomerFilters;
}

export interface CustomerLifecycleQuery {
  organizationId: string;
  customerId: string;
  actorIdentityId: string;
  dataMode?: AnalyticsDataMode;
}

export interface CustomerTimelineQuery extends CustomerLifecycleQuery, LifecyclePagination {
  eventTypes?: readonly AnalyticsEventType[];
  categories?: readonly CustomerTimelineCategory[];
}

export interface LifecyclePage<T> {
  items: readonly T[];
  nextCursor?: string;
}

export interface LifecycleReadAuthorizationRequest {
  organizationId: string;
  actorIdentityId: string;
  capability: Extract<OrganizationCapability, "customers.view" | "lifecycle.view">;
}

export type LifecycleReadAuthorizationDecision =
  | { allowed: true; detailLevel: "standard" | "sensitive"; allowedModes: readonly AnalyticsDataMode[] }
  | { allowed: false; reason: "unauthenticated" | "not_member" | "forbidden" | "scope_unavailable" };

/** Track E provides the server-authoritative implementation. */
export interface LifecycleReadAuthorizationPort {
  authorize(request: LifecycleReadAuthorizationRequest): Promise<LifecycleReadAuthorizationDecision>;
}

export interface LifecycleProjectionReadStore {
  getCheckpoint?(input: {
    organizationId: string;
    customerId: string;
    dataMode: AnalyticsDataMode;
  }): Promise<LifecycleProjectionCheckpoint | null>;
  getProjection(input: {
    organizationId: string;
    customerId: string;
    dataMode: AnalyticsDataMode;
  }): Promise<CustomerLifecycleProjection | null>;
  listProjections(input: {
    organizationId: string;
    dataMode: AnalyticsDataMode;
    limit: number;
    cursor?: string;
    filters?: LifecycleCustomerFilters;
  }): Promise<LifecyclePage<CustomerLifecycleProjection>>;
}

/** E's canonical event store implements this query boundary; F does not maintain a second event store. */
export interface LifecycleTimelineEventStore {
  listCustomerEvents(input: {
    organizationId: string;
    customerId: string;
    identityIds: readonly string[];
    leadIds: readonly string[];
    dataMode: AnalyticsDataMode;
    limit: number;
    cursor?: string;
    eventTypes?: readonly AnalyticsEventType[];
  }): Promise<LifecyclePage<LifecycleEventEnvelope>>;
}

/** C resolves verified, tenant-scoped lead/identity aliases for an already-authorized Customer. */
export interface LifecycleCustomerAliasPort {
  resolveAliases(input: {
    organizationId: string;
    customerId: string;
  }): Promise<{ identityIds: readonly string[]; leadIds: readonly string[] }>;
}

/** D/E may attach current message/run status without F owning those records. */
export interface LifecycleTimelineLinkPort {
  resolveLinks(input: {
    organizationId: string;
    customerId: string;
    eventIds: readonly string[];
  }): Promise<Readonly<Record<string, {
    automation?: CustomerTimelineLinkedAutomationStatus;
    communication?: CustomerTimelineLinkedCommunicationStatus;
  }>>>;
}

export type LifecycleProjectionCommitResult = "committed" | "duplicate" | "conflict";

/**
 * E supplies the atomic persistence adapter. A commit must atomically persist the
 * projection/checkpoint and a receipt for the event idempotency key. This keeps
 * at-least-once trigger delivery from double-processing a logical event.
 */
export interface LifecycleProjectionWritePort {
  commitProjection(input: {
    projection: CustomerLifecycleProjection;
    checkpoint: LifecycleProjectionCheckpoint;
    expectedRevision: number;
    sourceEventId: string;
    sourceIdempotencyKey: string;
  }): Promise<LifecycleProjectionCommitResult>;
}

export interface LifecycleProjectionStore extends LifecycleProjectionReadStore, LifecycleProjectionWritePort {
  getCheckpoint(input: {
    organizationId: string;
    customerId: string;
    dataMode: AnalyticsDataMode;
  }): Promise<LifecycleProjectionCheckpoint | null>;
}
