export const CUSTOMER_WORKSPACE_PAGE_SIZE = 25;
export const CUSTOMER_WORKSPACE_MAX_PAGE_SIZE = 50;

export type LifecycleKnowledge<T> =
  | {
      status: "known";
      value: T;
      source: string;
      updatedAt: string;
    }
  | {
      status: "unknown" | "unavailable";
      reason: string;
    };

export type IdentityLifecycleState = "lead" | "registered" | "verified";
export type OnboardingLifecycleState = "not-started" | "in-progress" | "completed";
export type CommercialLifecycleState = "none" | "trialing" | "active" | "past-due" | "cancelled";
export type ExperienceLifecycleState = "not-started" | "active" | "milestone-reached" | "inactive";
export type CommunicationLifecycleState = "eligible" | "suppressed" | "unknown";
export type DerivedLifecycleStage =
  | "acquisition"
  | "registration"
  | "onboarding"
  | "experience"
  | "conversion"
  | "retention"
  | "advocacy";

export interface CustomerLifecycleDimensions {
  identity: LifecycleKnowledge<IdentityLifecycleState>;
  onboarding: LifecycleKnowledge<OnboardingLifecycleState>;
  commercial: LifecycleKnowledge<CommercialLifecycleState>;
  experience: LifecycleKnowledge<ExperienceLifecycleState>;
  communication: LifecycleKnowledge<CommunicationLifecycleState>;
  derivedStage: LifecycleKnowledge<DerivedLifecycleStage>;
}

export interface CustomerLifecycleSummary {
  organizationId: string;
  customerId: string;
  displayName: string;
  primaryEmail?: string;
  dimensions: CustomerLifecycleDimensions;
  updatedAt: string;
}

export type CustomerDimensionFilter<T extends string> = "all" | T | "unknown" | "unavailable";

export interface CustomerWorkspaceFilters {
  identity: CustomerDimensionFilter<IdentityLifecycleState>;
  onboarding: CustomerDimensionFilter<OnboardingLifecycleState>;
  commercial: CustomerDimensionFilter<CommercialLifecycleState>;
  experience: CustomerDimensionFilter<ExperienceLifecycleState>;
  communication: CustomerDimensionFilter<CommunicationLifecycleState>;
}

export const defaultCustomerWorkspaceFilters: CustomerWorkspaceFilters = {
  identity: "all",
  onboarding: "all",
  commercial: "all",
  experience: "all",
  communication: "all",
};

export interface CustomerListRequest {
  organizationId: string;
  query?: string;
  filters?: Partial<CustomerWorkspaceFilters>;
  cursor?: string;
  limit?: number;
}

export interface CustomerListPage {
  items: CustomerLifecycleSummary[];
  nextCursor?: string;
  pageSize: number;
}

export interface CustomerProfileView {
  displayName: string;
  email?: string;
  phone?: string;
  company?: string;
  identityStatus: LifecycleKnowledge<IdentityLifecycleState>;
  linkedLeadId?: string;
}

export interface SubscriptionSummary {
  offerName: string;
  offerVersion: string;
  billingInterval?: "month" | "year";
  subscriptionStatus: CommercialLifecycleState;
  currentPeriodEnd?: string;
  trialEnd?: string;
}

export interface OnboardingSummary {
  flowName: string;
  flowVersion: string;
  status: OnboardingLifecycleState;
  completedSteps: number;
  totalSteps: number;
  lastProgressAt?: string;
}

export interface ExperienceMilestoneView {
  id: string;
  label: string;
  occurredAt: string;
  source: string;
}

export interface ExperienceSummary {
  status: ExperienceLifecycleState;
  firstUseAt?: string;
  lastUseAt?: string;
  milestones: ExperienceMilestoneView[];
}

export type EmailEligibilityReason =
  | "eligible"
  | "consent-unknown"
  | "withdrawn"
  | "provider-suppression"
  | "sender-not-ready"
  | "commercial-stop"
  | "organization-paused"
  | "unavailable";

export interface CommunicationEligibilityView {
  eligible: boolean | null;
  purpose: "service" | "promotional";
  reason: EmailEligibilityReason;
  explanation: string;
  evaluatedAt?: string;
}

export interface CommunicationHistoryItem {
  id: string;
  channel: "email";
  purpose: "service" | "promotional";
  summary: string;
  status: "scheduled" | "held" | "accepted" | "delivered" | "suppressed" | "failed" | "unknown";
  occurredAt: string;
  reason?: string;
}

export type AcquisitionRunStatus =
  | "scheduled"
  | "held"
  | "suppressed"
  | "cancelled"
  | "succeeded"
  | "failed"
  | "unknown";

export interface AcquisitionEnrollmentView {
  enrollmentId: string;
  automationId: string;
  automationLabel: string;
  pinnedVersion: string;
  status: AcquisitionRunStatus;
  reason: string;
  nextActionAt?: string;
  updatedAt: string;
}

export interface ExplicitlyUnavailableFeature {
  status: "unavailable";
  reason: string;
}

export interface CustomerWorkspaceDetail {
  organizationId: string;
  customerId: string;
  profile: CustomerProfileView;
  dimensions: CustomerLifecycleDimensions;
  subscription: LifecycleKnowledge<SubscriptionSummary>;
  onboarding: LifecycleKnowledge<OnboardingSummary>;
  experience: LifecycleKnowledge<ExperienceSummary>;
  communicationEligibility: LifecycleKnowledge<CommunicationEligibilityView>;
  communicationHistory: CommunicationHistoryItem[];
  acquisitionEnrollments: AcquisitionEnrollmentView[];
  surveys: ExplicitlyUnavailableFeature;
  referrals: ExplicitlyUnavailableFeature;
  updatedAt: string;
}

export type CustomerTimelineCategory =
  | "all"
  | "identity"
  | "onboarding"
  | "experience"
  | "commercial"
  | "communication"
  | "automation";

export interface CustomerTimelineEntry {
  id: string;
  organizationId: string;
  customerId: string;
  category: Exclude<CustomerTimelineCategory, "all">;
  label: string;
  detail: string;
  occurredAt: string;
  source: string;
  linkedStatus?: AcquisitionRunStatus | CommunicationHistoryItem["status"];
}

export interface CustomerTimelineRequest {
  organizationId: string;
  customerId: string;
  category?: CustomerTimelineCategory;
  cursor?: string;
  limit?: number;
}

export interface CustomerTimelinePage {
  items: CustomerTimelineEntry[];
  nextCursor?: string;
  pageSize: number;
}

export interface CustomerWorkspacePort {
  listCustomers(request: CustomerListRequest): Promise<CustomerListPage>;
  getCustomer(organizationId: string, customerId: string): Promise<CustomerWorkspaceDetail | null>;
  queryTimeline(request: CustomerTimelineRequest): Promise<CustomerTimelinePage>;
}

/**
 * Track A presentation boundary. C, F, D, E and Release 1 billing remain the
 * authoritative owners behind this port. Implementations must tenant-bind every
 * request server-side; a URL organizationId is never sufficient authority.
 */
export class CustomerWorkspaceUnavailableError extends Error {
  constructor(message = "Customer lifecycle data is not available from the authoritative services yet.") {
    super(message);
    this.name = "CustomerWorkspaceUnavailableError";
  }
}
