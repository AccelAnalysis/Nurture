import type {
  CustomerLifecycleSummary,
  CustomerTimelineEntry,
  CustomerWorkspaceDetail,
  LifecycleKnowledge,
} from "./contracts";

export const TRACK_A_DEMO_ORGANIZATION_ID = "nurture-demo";
export const TRACK_A_SECOND_DEMO_ORGANIZATION_ID = "nurture-demo-two";

function known<T>(value: T, source: string, updatedAt: string): LifecycleKnowledge<T> {
  return { status: "known", value, source, updatedAt };
}

const release2Unavailable = {
  status: "unavailable" as const,
  reason: "Surveys and referrals are not part of the Release 2 customer-lifecycle foundation.",
};

export const customerWorkspaceDetailsFixture: CustomerWorkspaceDetail[] = [
  {
    organizationId: TRACK_A_DEMO_ORGANIZATION_ID,
    customerId: "cust-maya-chen",
    profile: {
      displayName: "Maya Chen",
      email: "maya@example.test",
      company: "Harbor & Pine",
      identityStatus: known("verified", "Track C identity projection", "2026-09-02T13:05:00Z"),
      linkedLeadId: "lead-maya-01",
    },
    dimensions: {
      identity: known("verified", "Track C identity projection", "2026-09-02T13:05:00Z"),
      onboarding: known("completed", "Track C onboarding projection", "2026-09-02T13:40:00Z"),
      commercial: known("active", "Release 1 billing snapshot", "2026-09-03T16:10:00Z"),
      experience: known("milestone-reached", "Track F lifecycle projection", "2026-09-03T15:20:00Z"),
      communication: known("eligible", "Track D eligibility summary", "2026-09-03T16:15:00Z"),
      derivedStage: known("retention", "Track F derived administration view", "2026-09-03T16:15:00Z"),
    },
    subscription: known(
      {
        offerName: "Primary",
        offerVersion: "primary-v3",
        billingInterval: "month",
        subscriptionStatus: "active",
        currentPeriodEnd: "2026-10-03T16:10:00Z",
      },
      "Release 1 trusted billing snapshot",
      "2026-09-03T16:10:00Z",
    ),
    onboarding: known(
      {
        flowName: "Getting started",
        flowVersion: "onboarding-v2",
        status: "completed",
        completedSteps: 5,
        totalSteps: 5,
        lastProgressAt: "2026-09-02T13:40:00Z",
      },
      "Track C onboarding projection",
      "2026-09-02T13:40:00Z",
    ),
    experience: known(
      {
        status: "milestone-reached",
        firstUseAt: "2026-09-02T14:02:00Z",
        lastUseAt: "2026-09-03T15:20:00Z",
        milestones: [
          {
            id: "milestone-maya-1",
            label: "Momentum Check completed",
            occurredAt: "2026-09-03T15:20:00Z",
            source: "Track B verified milestone",
          },
        ],
      },
      "Track F lifecycle projection",
      "2026-09-03T15:20:00Z",
    ),
    communicationEligibility: known(
      {
        eligible: true,
        purpose: "promotional",
        reason: "eligible",
        explanation: "Current promotional email permission and provider readiness checks passed.",
        evaluatedAt: "2026-09-03T16:15:00Z",
      },
      "Track D eligibility summary",
      "2026-09-03T16:15:00Z",
    ),
    communicationHistory: [
      {
        id: "message-maya-welcome",
        channel: "email",
        purpose: "service",
        summary: "Registration welcome",
        status: "delivered",
        occurredAt: "2026-09-02T13:08:00Z",
      },
    ],
    acquisitionEnrollments: [
      {
        enrollmentId: "enroll-maya-activate",
        automationId: "R2-ACTIVATE",
        automationLabel: "Registration to first meaningful use",
        pinnedVersion: "lifecycle-v1",
        status: "cancelled",
        reason: "Cancelled after verified first meaningful use; no obsolete activation email was submitted.",
        updatedAt: "2026-09-02T14:02:00Z",
      },
    ],
    surveys: release2Unavailable,
    referrals: release2Unavailable,
    updatedAt: "2026-09-03T16:15:00Z",
  },
  {
    organizationId: TRACK_A_DEMO_ORGANIZATION_ID,
    customerId: "cust-noah-williams",
    profile: {
      displayName: "Noah Williams",
      email: "noah@example.test",
      identityStatus: known("registered", "Track C identity projection", "2026-09-04T09:00:00Z"),
    },
    dimensions: {
      identity: known("registered", "Track C identity projection", "2026-09-04T09:00:00Z"),
      onboarding: known("in-progress", "Track C onboarding projection", "2026-09-04T09:30:00Z"),
      commercial: known("none", "Release 1 billing snapshot", "2026-09-04T09:30:00Z"),
      experience: { status: "unknown", reason: "No trusted first-use evidence has been projected." },
      communication: known("suppressed", "Track D eligibility summary", "2026-09-04T10:10:00Z"),
      derivedStage: known("onboarding", "Track F derived administration view", "2026-09-04T10:10:00Z"),
    },
    subscription: known(
      { offerName: "No active offer", offerVersion: "none", subscriptionStatus: "none" },
      "Release 1 trusted billing snapshot",
      "2026-09-04T09:30:00Z",
    ),
    onboarding: known(
      {
        flowName: "Getting started",
        flowVersion: "onboarding-v2",
        status: "in-progress",
        completedSteps: 2,
        totalSteps: 5,
        lastProgressAt: "2026-09-04T09:30:00Z",
      },
      "Track C onboarding projection",
      "2026-09-04T09:30:00Z",
    ),
    experience: { status: "unknown", reason: "The lifecycle projection has no trusted first-use evidence yet." },
    communicationEligibility: known(
      {
        eligible: false,
        purpose: "promotional",
        reason: "withdrawn",
        explanation: "Promotional email permission was withdrawn before the delayed reminder became due.",
        evaluatedAt: "2026-09-04T10:10:00Z",
      },
      "Track D eligibility summary",
      "2026-09-04T10:10:00Z",
    ),
    communicationHistory: [
      {
        id: "message-noah-reminder",
        channel: "email",
        purpose: "promotional",
        summary: "Incomplete onboarding reminder",
        status: "suppressed",
        occurredAt: "2026-09-04T10:12:00Z",
        reason: "Current promotional consent was withdrawn before final dispatch admission.",
      },
    ],
    acquisitionEnrollments: [
      {
        enrollmentId: "enroll-noah-onboard",
        automationId: "R2-ONBOARD",
        automationLabel: "Incomplete onboarding reminder",
        pinnedVersion: "lifecycle-v1",
        status: "suppressed",
        reason: "Suppressed because current promotional permission was withdrawn during the delay.",
        updatedAt: "2026-09-04T10:12:00Z",
      },
    ],
    surveys: release2Unavailable,
    referrals: release2Unavailable,
    updatedAt: "2026-09-04T10:12:00Z",
  },
  {
    organizationId: TRACK_A_DEMO_ORGANIZATION_ID,
    customerId: "cust-ava-patel",
    profile: {
      displayName: "Ava Patel",
      email: "ava@example.test",
      identityStatus: known("verified", "Track C identity projection", "2026-09-04T11:00:00Z"),
    },
    dimensions: {
      identity: known("verified", "Track C identity projection", "2026-09-04T11:00:00Z"),
      onboarding: known("completed", "Track C onboarding projection", "2026-09-04T11:40:00Z"),
      commercial: known("active", "Release 1 billing snapshot", "2026-09-04T13:02:00Z"),
      experience: known("active", "Track F lifecycle projection", "2026-09-04T12:10:00Z"),
      communication: known("eligible", "Track D eligibility summary", "2026-09-04T13:05:00Z"),
      derivedStage: known("conversion", "Track F derived administration view", "2026-09-04T13:05:00Z"),
    },
    subscription: known(
      {
        offerName: "Premium",
        offerVersion: "premium-v2",
        billingInterval: "year",
        subscriptionStatus: "active",
        currentPeriodEnd: "2027-09-04T13:02:00Z",
      },
      "Release 1 trusted billing snapshot",
      "2026-09-04T13:02:00Z",
    ),
    onboarding: known(
      {
        flowName: "Getting started",
        flowVersion: "onboarding-v2",
        status: "completed",
        completedSteps: 5,
        totalSteps: 5,
        lastProgressAt: "2026-09-04T11:40:00Z",
      },
      "Track C onboarding projection",
      "2026-09-04T11:40:00Z",
    ),
    experience: known(
      {
        status: "active",
        firstUseAt: "2026-09-04T12:10:00Z",
        lastUseAt: "2026-09-04T12:45:00Z",
        milestones: [],
      },
      "Track F lifecycle projection",
      "2026-09-04T12:45:00Z",
    ),
    communicationEligibility: known(
      {
        eligible: true,
        purpose: "promotional",
        reason: "eligible",
        explanation: "Eligible now; purchase state still cancels checkout-recovery work.",
        evaluatedAt: "2026-09-04T13:05:00Z",
      },
      "Track D eligibility summary",
      "2026-09-04T13:05:00Z",
    ),
    communicationHistory: [],
    acquisitionEnrollments: [
      {
        enrollmentId: "enroll-ava-checkout",
        automationId: "R2-CHECKOUT",
        automationLabel: "Checkout recovery",
        pinnedVersion: "lifecycle-v1",
        status: "cancelled",
        reason: "Cancelled after the trusted purchase completed during the configured recovery delay.",
        updatedAt: "2026-09-04T13:02:00Z",
      },
    ],
    surveys: release2Unavailable,
    referrals: release2Unavailable,
    updatedAt: "2026-09-04T13:05:00Z",
  },
  {
    organizationId: TRACK_A_DEMO_ORGANIZATION_ID,
    customerId: "cust-liam-rivera",
    profile: {
      displayName: "Liam Rivera",
      email: "liam@example.test",
      identityStatus: known("lead", "Track C lead/customer projection", "2026-09-05T11:05:00Z"),
      linkedLeadId: "lead-liam-01",
    },
    dimensions: {
      identity: known("lead", "Track C lead/customer projection", "2026-09-05T11:05:00Z"),
      onboarding: { status: "unknown", reason: "Onboarding does not exist before a customer registration is linked." },
      commercial: { status: "unknown", reason: "No authoritative commercial relationship is available for this lead." },
      experience: { status: "unknown", reason: "No trusted Experience activity has been linked." },
      communication: known("eligible", "Track D eligibility summary", "2026-09-05T11:06:00Z"),
      derivedStage: known("acquisition", "Track F derived administration view", "2026-09-05T11:06:00Z"),
    },
    subscription: { status: "unknown", reason: "No authoritative subscription snapshot exists for this lead." },
    onboarding: { status: "unknown", reason: "No organization-scoped onboarding progress exists before registration." },
    experience: { status: "unknown", reason: "No verified Experience activity has been projected." },
    communicationEligibility: known(
      {
        eligible: true,
        purpose: "promotional",
        reason: "eligible",
        explanation: "The lead fixture includes explicit promotional email permission.",
        evaluatedAt: "2026-09-05T11:06:00Z",
      },
      "Track D eligibility summary",
      "2026-09-05T11:06:00Z",
    ),
    communicationHistory: [],
    acquisitionEnrollments: [
      {
        enrollmentId: "enroll-liam-lead",
        automationId: "R2-LEAD",
        automationLabel: "Lead-to-registration follow-up",
        pinnedVersion: "lifecycle-v1",
        status: "scheduled",
        reason: "Waiting for the configured delay; registration and permission will be rechecked before dispatch.",
        nextActionAt: "2026-09-06T11:05:00Z",
        updatedAt: "2026-09-05T11:06:00Z",
      },
    ],
    surveys: release2Unavailable,
    referrals: release2Unavailable,
    updatedAt: "2026-09-05T11:06:00Z",
  },
  {
    // Same fictional global identity/email as Maya, but a separate tenant relationship.
    organizationId: TRACK_A_SECOND_DEMO_ORGANIZATION_ID,
    customerId: "cust-maya-chen-org-two",
    profile: {
      displayName: "Maya Chen",
      email: "maya@example.test",
      identityStatus: known("verified", "Track C identity projection", "2026-09-04T08:00:00Z"),
    },
    dimensions: {
      identity: known("verified", "Track C identity projection", "2026-09-04T08:00:00Z"),
      onboarding: known("not-started", "Track C onboarding projection", "2026-09-04T08:00:00Z"),
      commercial: known("none", "Release 1 billing snapshot", "2026-09-04T08:00:00Z"),
      experience: known("not-started", "Track F lifecycle projection", "2026-09-04T08:00:00Z"),
      communication: { status: "unknown", reason: "This organization's consent record has not been established." },
      derivedStage: known("registration", "Track F derived administration view", "2026-09-04T08:00:00Z"),
    },
    subscription: known(
      { offerName: "No active offer", offerVersion: "none", subscriptionStatus: "none" },
      "Release 1 trusted billing snapshot",
      "2026-09-04T08:00:00Z",
    ),
    onboarding: known(
      {
        flowName: "Organization two onboarding",
        flowVersion: "onboarding-v1",
        status: "not-started",
        completedSteps: 0,
        totalSteps: 3,
      },
      "Track C onboarding projection",
      "2026-09-04T08:00:00Z",
    ),
    experience: known(
      { status: "not-started", milestones: [] },
      "Track F lifecycle projection",
      "2026-09-04T08:00:00Z",
    ),
    communicationEligibility: {
      status: "unknown",
      reason: "Consent is organization-scoped; no permission has been recorded for this organization.",
    },
    communicationHistory: [],
    acquisitionEnrollments: [],
    surveys: release2Unavailable,
    referrals: release2Unavailable,
    updatedAt: "2026-09-04T08:00:00Z",
  },
];

export const customerWorkspaceSummariesFixture: CustomerLifecycleSummary[] = customerWorkspaceDetailsFixture.map((detail) => ({
  organizationId: detail.organizationId,
  customerId: detail.customerId,
  displayName: detail.profile.displayName,
  primaryEmail: detail.profile.email,
  dimensions: detail.dimensions,
  updatedAt: detail.updatedAt,
}));

export const customerTimelineFixture: CustomerTimelineEntry[] = [
  { id: "timeline-maya-register", organizationId: TRACK_A_DEMO_ORGANIZATION_ID, customerId: "cust-maya-chen", category: "identity", label: "Registration completed", detail: "Verified registration linked to the existing organization-scoped lead.", occurredAt: "2026-09-02T13:05:00Z", source: "Track C trusted domain event" },
  { id: "timeline-maya-onboarding", organizationId: TRACK_A_DEMO_ORGANIZATION_ID, customerId: "cust-maya-chen", category: "onboarding", label: "Onboarding completed", detail: "Getting started v2 completed 5 of 5 required steps.", occurredAt: "2026-09-02T13:40:00Z", source: "Track C onboarding projection" },
  { id: "timeline-maya-first-use", organizationId: TRACK_A_DEMO_ORGANIZATION_ID, customerId: "cust-maya-chen", category: "experience", label: "First meaningful use", detail: "The reference Experience recorded a validated first-use action.", occurredAt: "2026-09-02T14:02:00Z", source: "Track B validated domain evidence / Track F projection" },
  { id: "timeline-maya-welcome", organizationId: TRACK_A_DEMO_ORGANIZATION_ID, customerId: "cust-maya-chen", category: "communication", label: "Registration welcome delivered", detail: "Provider callback reconciled the welcome message as delivered.", occurredAt: "2026-09-02T14:04:00Z", source: "Track D communication summary", linkedStatus: "delivered" },
  { id: "timeline-maya-milestone", organizationId: TRACK_A_DEMO_ORGANIZATION_ID, customerId: "cust-maya-chen", category: "experience", label: "Momentum Check completed", detail: "Verified Experience milestone reached.", occurredAt: "2026-09-03T15:20:00Z", source: "Track F lifecycle timeline" },
  { id: "timeline-maya-purchase", organizationId: TRACK_A_DEMO_ORGANIZATION_ID, customerId: "cust-maya-chen", category: "commercial", label: "Subscription active", detail: "Trusted Release 1 billing snapshot reports Primary monthly as active.", occurredAt: "2026-09-03T16:10:00Z", source: "Release 1 trusted billing" },
  { id: "timeline-noah-optout", organizationId: TRACK_A_DEMO_ORGANIZATION_ID, customerId: "cust-noah-williams", category: "communication", label: "Promotional email permission withdrawn", detail: "Current consent changed before the delayed onboarding reminder was due.", occurredAt: "2026-09-04T10:10:00Z", source: "Track C consent / Track D eligibility" },
  { id: "timeline-noah-suppressed", organizationId: TRACK_A_DEMO_ORGANIZATION_ID, customerId: "cust-noah-williams", category: "automation", label: "Onboarding reminder suppressed", detail: "Final dispatch admission rejected promotional email after the consent withdrawal.", occurredAt: "2026-09-04T10:12:00Z", source: "Track E acquisition run explanation", linkedStatus: "suppressed" },
  { id: "timeline-ava-purchase", organizationId: TRACK_A_DEMO_ORGANIZATION_ID, customerId: "cust-ava-patel", category: "commercial", label: "Premium purchase completed", detail: "Trusted purchase completed during the configured checkout-recovery delay.", occurredAt: "2026-09-04T13:02:00Z", source: "Release 1 trusted billing" },
  { id: "timeline-ava-cancelled", organizationId: TRACK_A_DEMO_ORGANIZATION_ID, customerId: "cust-ava-patel", category: "automation", label: "Checkout recovery cancelled", detail: "The pending recovery step was cancelled after current commercial state showed the purchase.", occurredAt: "2026-09-04T13:02:30Z", source: "Track E acquisition run explanation", linkedStatus: "cancelled" },
  { id: "timeline-liam-lead", organizationId: TRACK_A_DEMO_ORGANIZATION_ID, customerId: "cust-liam-rivera", category: "identity", label: "Permitted lead captured", detail: "Organization-scoped lead captured with explicit promotional email permission in this fixture.", occurredAt: "2026-09-05T11:05:00Z", source: "Track C trusted lead capture" },
  { id: "timeline-liam-scheduled", organizationId: TRACK_A_DEMO_ORGANIZATION_ID, customerId: "cust-liam-rivera", category: "automation", label: "Lead follow-up scheduled", detail: "Registration and eligibility will be rechecked before any provider submission.", occurredAt: "2026-09-05T11:06:00Z", source: "Track E acquisition run explanation", linkedStatus: "scheduled" },
  { id: "timeline-org-two-maya", organizationId: TRACK_A_SECOND_DEMO_ORGANIZATION_ID, customerId: "cust-maya-chen-org-two", category: "identity", label: "Registration linked", detail: "A separate customer relationship exists for organization two.", occurredAt: "2026-09-04T08:00:00Z", source: "Track C trusted domain event" },
];
