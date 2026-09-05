import type { AnalyticsDataMode, LifecycleEventEnvelope, LifecycleEventSource } from "../contracts.js";
import type { SubscriptionSnapshot } from "../../billing/contracts.js";
import type { OrganizationCapability } from "../../platform/authorization.js";

/** Read contracts only. The canonical lifecycle event and commercial models remain authoritative. */
export type MeasurementMode = Extract<AnalyticsDataMode, "live" | "test">;
export type MetricDomain = "acquisition" | "activation" | "experience" | "commercial" | "automation" | "satisfaction" | "referrals" | "retention";
export type Dimension = "offerId" | "experienceId" | "experienceModuleId" | "experienceModuleVersion" | "automationId" | "automationVersion" | "surveyId" | "surveyVersion" | "referralProgramId" | "referralProgramVersion" | "acquisitionSource";
export type SubjectUnit = "event" | "customer" | "lead" | "identity" | "visitor" | "subscription" | "invitation" | "referral" | "communication" | "run" | "transaction";
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
  calculation: "count" | "cohort-rate" | "median-duration" | "sum" | "net-collected" | "nps" | "current-mrr" | "current-subscriptions" | "churn" | "retention";
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
/** In-memory projection from the identity owner's verified linking service. Never a second identity store. */
export interface VerifiedSubjectLink {
  organizationId: string;
  dataMode: MeasurementMode;
  subjectKind: "visitor" | "lead" | "identity";
  subjectId: string;
  customerId: string;
}
/** Temporal wrapper around the existing trusted subscription contract; no provider credentials. */
export interface SubscriptionReadSet {
  organizationId: string;
  dataMode: MeasurementMode;
  observedAt: string;
  complete: boolean;
  records: readonly SubscriptionSnapshot[];
}
export interface MeasurementInput {
  events: readonly LifecycleEventEnvelope[];
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
