import type { AnalyticsDataMode, LifecycleEventEnvelope, LifecycleEventSource } from "../contracts.js";
import type { OrganizationCapability } from "../../platform/authorization.js";

/** Read contracts only. The canonical lifecycle, customer and commercial models remain authoritative. */
export type MeasurementMode = Extract<AnalyticsDataMode, "live" | "test">;
export type MetricDomain = "acquisition" | "activation" | "experience" | "commercial" | "automation" | "satisfaction" | "referrals" | "retention";
export type Dimension = "offerId" | "experienceId" | "experienceModuleId" | "experienceModuleVersion" | "automationId" | "automationVersion" | "surveyId" | "surveyVersion" | "referralProgramId" | "referralProgramVersion" | "acquisitionSource";
export type SubjectUnit = "event" | "customer" | "lead" | "identity" | "visitor" | "subscription" | "invitation" | "referral" | "communication" | "run" | "transaction";

/**
 * A measurement event may be either a validated canonical LifecycleEventEnvelope or
 * a transient server-side normalization of an accepted durable source record. Derived
 * measurement events are never persisted back into the canonical lifecycle event store.
 */
export type MeasurementEvent = Omit<LifecycleEventEnvelope, "eventType"> & { eventType: string };

export interface EventSelector {
  eventType: string;
  sources: readonly LifecycleEventSource[];
  /** Present only for a reviewed versioned payload mapping; not arbitrary query fields. */
  where?: Readonly<Record<string, string | number | boolean>>;
}
export interface MetricDefinition {
  metricId: string;
  version: 1;
  owner: "B" | "C" | "D" | "F";
  domain: MetricDomain;
  name: string;
  description: string;
  unit: "count" | "percent" | "score" | "hours" | "minor" | "minor/month";
  calculation: "count" | "cohort-rate" | "period-rate" | "median-duration" | "sum" | "net-collected" | "nps" | "current-mrr" | "current-subscriptions" | "churn" | "retention";
  subject: SubjectUnit;
  selectors: readonly EventSelector[];
  outcome?: EventSelector;
  valueField?: string;
  sources: readonly string[];
  dimensions: readonly Dimension[];
  permissions: readonly OrganizationCapability[];
  numerator: string;
  denominator: string | null;
  timeBasis: "occurredAt" | "cohort-entry" | "current-snapshot" | "opening-closing-snapshots";
  defaultObservationDays?: number;
  limitations: readonly string[];
}
export interface MetricQuery {
  organizationId: string;
  from: string;
  to: string;
  dataMode: MeasurementMode;
  metricIds: string[];
  filters: Partial<Record<Dimension, string>>;
  currency?: string;
  observationDays: number;
}
export interface SourceCoverage {
  organizationId: string;
  dataMode: MeasurementMode;
  bindingVersion: 1;
  from: string;
  through: string;
  checkedAt: string;
  complete: boolean;
}
/** In-memory projection from the accepted tenant-scoped customer/lead linking records. Never a second identity store. */
export interface VerifiedSubjectLink {
  organizationId: string;
  dataMode: MeasurementMode;
  subjectKind: "visitor" | "lead" | "identity";
  subjectId: string;
  customerId: string;
}
/** Minimal temporal commercial projection needed by R5 calculations. */
export interface MeasurementSubscriptionSnapshot {
  id: string;
  organizationId: string;
  offerId: string;
  billingInterval: "month" | "year";
  currency: string;
  unitAmountMinor: number;
  status: "incomplete" | "incomplete_expired" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "paused";
  trustedAt: string;
}
/** Temporal read set reconstructed from accepted provider-backed subscription state/history. */
export interface SubscriptionReadSet {
  organizationId: string;
  dataMode: MeasurementMode;
  observedAt: string;
  complete: boolean;
  records: readonly MeasurementSubscriptionSnapshot[];
}
export interface MeasurementInput {
  events: readonly MeasurementEvent[];
  coverage: Readonly<Record<string, SourceCoverage>>;
  calculatedAt: string;
  links?: readonly VerifiedSubjectLink[];
  currentSubscriptions?: SubscriptionReadSet;
  openingSubscriptions?: SubscriptionReadSet;
  closingSubscriptions?: SubscriptionReadSet;
  truncated?: boolean;
  rejected?: number;
}
export interface MetricResult {
  definition: MetricDefinition;
  status: "available" | "partial" | "stale" | "unavailable";
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  currency: string | null;
  from: string;
  to: string;
  dataMode: MeasurementMode;
  calculatedAt: string;
  sourceThrough: string | null;
  snapshotAt: string | null;
  observationDays: number | null;
  pendingSubjects: number;
  reasons: string[];
  quality: { rejected: number; duplicates: number; conflicting: number; truncated: boolean };
  lineage: { registryVersion: string; calculationVersion: string; sources: readonly string[]; filters: MetricQuery["filters"]; sourceRecordCount: number };
}
export interface AnalyticsReport {
  query: MetricQuery;
  results: MetricResult[];
  calculatedAt: string;
  release: { ready: boolean; acceptedR4Sha: string | null; reason: string | null };
}
