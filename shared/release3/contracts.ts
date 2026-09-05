export const RELEASE3_CONTRACT_VERSION = 1 as const;

export type IsoTimestamp = string;
export type ExecutionMode = "live" | "test" | "preview" | "demo" | "development";
export type LifecycleChannel = "email" | "in-app";
export type TreatmentKind =
  | "acquisition"
  | "upsell"
  | "renewal"
  | "payment-recovery"
  | "re-engagement"
  | "cancellation"
  | "win-back";

export type EngagementState = "active" | "inactive" | "unknown";
export type PaymentHealth = "healthy" | "failed" | "recovering" | "recovered" | "unknown";
export type CancellationStatus = "none" | "requested" | "scheduled" | "effective" | "completed";
export type ContactabilityState = "eligible" | "ineligible" | "unknown";

export type Release3ReasonCode =
  | "allowed"
  | "automation-paused"
  | "organization-paused"
  | "customer-missing"
  | "consent-missing"
  | "consent-withdrawn"
  | "provider-suppressed"
  | "channel-not-ready"
  | "mode-not-allowed"
  | "offer-unavailable"
  | "capability-already-present"
  | "commercial-state-conflict"
  | "payment-health-conflict"
  | "cancellation-conflict"
  | "engagement-state-conflict"
  | "cooldown-active"
  | "reentry-not-allowed"
  | "frequency-cap-reached"
  | "conflict-group-blocked"
  | "expired"
  | "superseded"
  | "unknown-required-fact"
  | "unsafe-retry"
  | "ambiguous-provider-outcome"
  | "unauthorized";

export interface ProvenanceRef {
  source: "browser" | "experience" | "provider" | "scheduler" | "administrator" | "projection";
  sourceId?: string;
  occurredAt: IsoTimestamp;
  receivedAt?: IsoTimestamp;
  schemaVersion?: number;
}

export interface MeaningfulActivityFact {
  organizationId: string;
  customerId: string;
  experienceId: string;
  activityKey: string;
  occurredAt: IsoTimestamp;
  provenance: ProvenanceRef;
}

export interface EngagementProjection {
  state: EngagementState;
  lastMeaningfulActivityAt?: IsoTimestamp;
  inactiveSince?: IsoTimestamp;
  reactivatedAt?: IsoTimestamp;
  thresholdHours?: number;
  provenance?: ProvenanceRef;
}

export interface CancellationProjection {
  status: CancellationStatus;
  requestedAt?: IsoTimestamp;
  effectiveAt?: IsoTimestamp;
  accessEndsAt?: IsoTimestamp;
  completedAt?: IsoTimestamp;
  provenance?: ProvenanceRef;
}

export interface CommercialServicingSummary {
  subscriptionId?: string;
  offerId?: string;
  offerVersion?: number;
  subscriptionState: "none" | "trialing" | "active" | "past_due" | "unpaid" | "paused" | "canceled" | "incomplete";
  entitlementKeys: string[];
  nextRenewalAt?: IsoTimestamp;
  renewalAmountMinor?: number;
  currency?: string;
  paymentHealth: PaymentHealth;
  cancellation: CancellationProjection;
  provenance?: ProvenanceRef;
}

export interface ContactabilitySummary {
  organizationId: string;
  customerId: string;
  channel: LifecycleChannel;
  purpose: "transactional" | "promotional";
  state: ContactabilityState;
  timezone?: string;
  quietHours?: { startLocal: string; endLocal: string };
  policyVersion?: string;
  checkedAt: IsoTimestamp;
  reasons: Release3ReasonCode[];
}

export type SegmentFactKey =
  | "customer.tenure_days"
  | "subscription.state"
  | "subscription.offer_id"
  | "capability.present"
  | "capability.absent"
  | "experience.milestone"
  | "engagement.state"
  | "engagement.inactive_hours"
  | "renewal.within_days"
  | "payment.health"
  | "cancellation.status"
  | "treatment.last_outcome"
  | "communication.eligibility";

export type SegmentFactValue = string | number | boolean | string[] | null;

export interface SegmentFact {
  key: SegmentFactKey;
  value: SegmentFactValue;
  observedAt: IsoTimestamp;
  provenance: ProvenanceRef;
}

export type PredicateOperator =
  | "eq"
  | "neq"
  | "in"
  | "not-in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists";

export interface RulePredicate {
  fact: SegmentFactKey;
  operator: PredicateOperator;
  value?: SegmentFactValue;
}

export interface ConditionGroup {
  mode: "all" | "any";
  predicates: RulePredicate[];
}

export interface ReentryPolicy {
  kind: "once-per-customer" | "once-per-occurrence" | "after-cooldown" | "after-requalification";
  cooldownHours?: number;
}

export interface FrequencyCaps {
  customerPerDay?: number;
  customerPerWeek?: number;
  channelPerDay?: number;
  organizationPerHour?: number;
}

export interface ConflictPolicy {
  group?: string;
  priority: "critical-service" | "service" | "retention" | "promotion";
  caps: FrequencyCaps;
}

export interface EmailTreatmentAction {
  type: "email";
  templateId: string;
  templateVersion: number;
  purpose: "transactional" | "promotional";
}

export interface InAppTreatmentAction {
  type: "in-app";
  templateId: string;
  templateVersion: number;
  placementId: string;
  purpose: "transactional" | "promotional";
}

export interface CommercialHandoffAction {
  type: "commercial-handoff";
  requestedCapability?: string;
  offerId?: string;
}

export type TreatmentAction = EmailTreatmentAction | InAppTreatmentAction | CommercialHandoffAction;

export interface AutomationBranch {
  id: string;
  when?: ConditionGroup;
  actions: TreatmentAction[];
}

export interface AutomationDefinitionV3 {
  id: string;
  organizationId: string;
  version: number;
  name: string;
  kind: TreatmentKind;
  trigger: { eventType: string; schemaVersion?: number };
  audience?: ConditionGroup;
  branches: AutomationBranch[];
  delayMinutes?: number;
  stopConditions?: ConditionGroup;
  reentry: ReentryPolicy;
  conflict: ConflictPolicy;
  expiresAt?: IsoTimestamp;
  mode: ExecutionMode;
  enabled: boolean;
}

export interface InAppTreatmentIntent {
  treatmentId: string;
  runId: string;
  organizationId: string;
  customerId: string;
  experienceId?: string;
  placementId: string;
  templateId: string;
  templateVersion: number;
  title: string;
  body: string;
  cta?: { label: string; href: string; offerId?: string; requestedCapability?: string };
  purpose: "transactional" | "promotional";
  availableFrom: IsoTimestamp;
  expiresAt?: IsoTimestamp;
  mode: ExecutionMode;
}

export interface InAppTreatmentInteraction {
  treatmentId: string;
  runId: string;
  organizationId: string;
  customerId: string;
  interaction: "presented" | "dismissed" | "acted";
  occurredAt: IsoTimestamp;
  idempotencyKey: string;
}

export interface ExpansionOfferCandidate {
  organizationId: string;
  customerId: string;
  offerId: string;
  offerVersion: number;
  requestedCapability: string;
  displayName: string;
  amountMinor: number;
  currency: string;
  billingInterval: "month" | "year" | "one-time";
  providerPriceRef?: string;
  termsSummary: string;
  reason: string;
}

export interface TreatmentAdmissionDecision {
  allowed: boolean;
  reasons: Release3ReasonCode[];
  evaluatedAt: IsoTimestamp;
  policyVersion: number;
  competingRunIds?: string[];
}

export type RecoveryCommandType = "pause" | "resume" | "cancel-run" | "re-evaluate" | "safe-retry" | "reconcile" | "dry-run" | "projection-replay";

export interface RecoveryCommand {
  type: RecoveryCommandType;
  organizationId: string;
  automationId?: string;
  runId?: string;
  effectId?: string;
  mode: ExecutionMode;
  reason: string;
}

export interface RecoveryCommandResult {
  accepted: boolean;
  reason: Release3ReasonCode;
  commandId: string;
  effectId?: string;
  outcome?: "paused" | "resumed" | "cancelled" | "re-evaluated" | "retrying" | "reconciled" | "dry-run-complete" | "projection-replayed";
}

export function buildLogicalEffectId(parts: {
  organizationId: string;
  customerId: string;
  automationId: string;
  automationVersion: number;
  triggerId: string;
  branchId: string;
  actionIndex: number;
}): string {
  return [
    parts.organizationId,
    parts.customerId,
    parts.automationId,
    String(parts.automationVersion),
    parts.triggerId,
    parts.branchId,
    String(parts.actionIndex),
  ].map((part) => encodeURIComponent(part)).join(":");
}

export function modeMayCreateExternalEffect(mode: ExecutionMode): boolean {
  return mode === "live" || mode === "test";
}
