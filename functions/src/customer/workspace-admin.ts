import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { AnalyticsDataMode } from "../../../shared/analytics/contracts.js";
import type { CommunicationConsentFact, OrganizationCustomerRelationship } from "../../../shared/customer/contracts.js";
import type { CustomerLifecycleProjection } from "../../../shared/lifecycle/contracts.js";
import type { MessageDeliveryRecord } from "../../../shared/communications/contracts.js";
import { getCurrentSubscriptionForCustomer, getOfferRecord, assertOrganizationCapability } from "../billing/store.js";
import { getEmailSenderReadiness, hashRecipientEmail } from "../communications/store.js";
import { getEffectiveEmailSuppression } from "../communications/suppression.js";
import { db } from "../firebase.js";
import { lifecycleProjectionStore } from "../lifecycle/firestore-store.js";

function organizationRef(organizationId: string) { return db.collection("organizations").doc(organizationId); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request data must be an object.");
  return value as Record<string, unknown>;
}
function requiredString(input: Record<string, unknown>, key: string, max = 200) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new HttpsError("invalid-argument", `${key} is invalid.`);
  return value.trim();
}
function optionalString(value: unknown, max = 500) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > max) throw new HttpsError("invalid-argument", "String value is invalid.");
  return value;
}
function requestedLimit(value: unknown, fallback = 25) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 50) throw new HttpsError("invalid-argument", "limit must be between 1 and 50.");
  return value as number;
}
function actor(request: { auth?: { uid: string } }) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  return request.auth.uid;
}
function dataMode(value: unknown): AnalyticsDataMode {
  return value === "test" ? "test" : "live";
}
function known<T>(value: T, source: string, updatedAt: string) { return { status: "known" as const, value, source, updatedAt }; }
function unknown(reason: string) { return { status: "unknown" as const, reason }; }
function unavailable(reason: string) { return { status: "unavailable" as const, reason }; }
function profileName(customer: OrganizationCustomerRelationship) {
  return customer.profile.displayName?.trim()
    || [customer.profile.firstName, customer.profile.lastName].filter(Boolean).join(" ").trim()
    || customer.profile.email
    || customer.customerId;
}

function identityDimension(projection: CustomerLifecycleProjection | null) {
  if (!projection || projection.identity.state === "unknown") return unknown("Identity projection is not established yet.");
  return known(projection.identity.state, projection.identity.metadata.source ?? projection.identity.metadata.provenance, projection.identity.metadata.updatedAt);
}
function onboardingDimension(projection: CustomerLifecycleProjection | null) {
  if (!projection || projection.onboarding.state === "unknown") return unknown("Onboarding projection is not established yet.");
  const value = projection.onboarding.state === "not_started" ? "not-started" : projection.onboarding.state === "in_progress" ? "in-progress" : "completed";
  return known(value, projection.onboarding.metadata.source ?? projection.onboarding.metadata.provenance, projection.onboarding.metadata.updatedAt);
}
function commercialDimension(projection: CustomerLifecycleProjection | null) {
  if (!projection || projection.commercial.state === "unknown") return unknown("Commercial projection is awaiting an authoritative billing snapshot.");
  const state = projection.commercial.state;
  const value = state === "past_due" ? "past-due" : state === "inactive" ? "none" : state;
  return known(value as "none" | "trialing" | "active" | "past-due" | "cancelled", projection.commercial.metadata.source ?? projection.commercial.metadata.provenance, projection.commercial.metadata.updatedAt);
}
function experienceDimension(projection: CustomerLifecycleProjection | null) {
  if (!projection || projection.experience.state === "unknown") return unknown("Experience projection is not established yet.");
  const state = projection.experience.state;
  const value = state === "not_started" ? "not-started" : state === "started" ? "active" : state === "activated" ? "milestone-reached" : "inactive";
  return known(value, projection.experience.metadata.source ?? projection.experience.metadata.provenance, projection.experience.metadata.updatedAt);
}
function communicationDimension(projection: CustomerLifecycleProjection | null) {
  const marketing = projection?.communication.email.marketing;
  if (!marketing || marketing.state === "unknown") return unknown("Current marketing-email eligibility has not been projected yet.");
  const value = marketing.state === "eligible" ? "eligible" : "suppressed";
  return known(value, marketing.metadata.source ?? marketing.metadata.provenance, marketing.metadata.updatedAt);
}
function stageDimension(projection: CustomerLifecycleProjection | null) {
  if (!projection) return unknown("Derived lifecycle stage is unavailable until projection exists.");
  // Keep the seven-stage view explicitly administrative/non-authoritative.
  const identity = projection.identity.state;
  const onboarding = projection.onboarding.state;
  const experience = projection.experience.state;
  const commercial = projection.commercial.state;
  const stage = identity === "lead" ? "acquisition"
    : identity === "registered" || identity === "verified" ? (onboarding === "completed" ? (experience === "activated" ? (commercial === "active" ? "retention" : "conversion") : "experience") : "onboarding")
    : "acquisition";
  return known(stage as "acquisition" | "registration" | "onboarding" | "experience" | "conversion" | "retention" | "advocacy", "derived-admin-view", projection.updatedAt);
}
function dimensions(projection: CustomerLifecycleProjection | null) {
  return {
    identity: identityDimension(projection),
    onboarding: onboardingDimension(projection),
    commercial: commercialDimension(projection),
    experience: experienceDimension(projection),
    communication: communicationDimension(projection),
    derivedStage: stageDimension(projection),
  };
}

async function currentMarketingEligibility(organizationId: string, customer: OrganizationCustomerRelationship, mode: AnalyticsDataMode) {
  const email = customer.profile.email?.trim().toLowerCase();
  const now = new Date().toISOString();
  if (!email) return unavailable("Customer has no current email recipient.");
  const [sender, suppression, consents] = await Promise.all([
    getEmailSenderReadiness(organizationId),
    getEffectiveEmailSuppression({ organizationId, recipientHash: hashRecipientEmail(email), purpose: "marketing" }),
    organizationRef(organizationId).collection("communicationConsents")
      .where("subjectKind", "==", "customer")
      .where("subjectId", "==", customer.customerId)
      .where("dataMode", "==", mode)
      .limit(20)
      .get(),
  ]);
  const consent = consents.docs
    .map((item) => item.data() as CommunicationConsentFact)
    .filter((item) => item.channel === "email" && item.purpose === "marketing")
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0];
  let view;
  if (sender.status !== "ready") view = { eligible: false, purpose: "promotional" as const, reason: "sender-not-ready" as const, explanation: sender.reason ?? "Email sender is not ready.", evaluatedAt: now };
  else if (suppression.suppressed) view = { eligible: false, purpose: "promotional" as const, reason: "provider-suppression" as const, explanation: suppression.reason ?? "Provider suppression is active.", evaluatedAt: now };
  else if (!consent) view = { eligible: null, purpose: "promotional" as const, reason: "consent-unknown" as const, explanation: "Marketing consent is unknown.", evaluatedAt: now };
  else if (consent.decision !== "granted") view = { eligible: false, purpose: "promotional" as const, reason: "withdrawn" as const, explanation: `Marketing consent is ${consent.decision}.`, evaluatedAt: now };
  else view = { eligible: true, purpose: "promotional" as const, reason: "eligible" as const, explanation: "Current recipient, consent, sender readiness, and suppression checks are eligible.", evaluatedAt: now };
  return known(view, "email-eligibility-evaluator", now);
}

async function latestOnboarding(organizationId: string, customerId: string, mode: AnalyticsDataMode) {
  const snapshot = await organizationRef(organizationId).collection("onboardingProgress")
    .where("scope.customerId", "==", customerId)
    .where("scope.dataMode", "==", mode)
    .limit(20)
    .get();
  return snapshot.docs.map((item) => item.data()).sort((left, right) => String(right.lastActivityAt ?? "").localeCompare(String(left.lastActivityAt ?? "")))[0] ?? null;
}

function messageStatus(status: MessageDeliveryRecord["status"]) {
  if (status === "planned") return "scheduled" as const;
  if (status === "accepted" || status === "deferred") return "accepted" as const;
  if (status === "bounced" || status === "dropped" || status === "complained" || status === "unsubscribed" || status === "cancelled") return "failed" as const;
  return status;
}
function acquisitionStatus(status: string) {
  if (status === "provider-accepted" || status === "completed") return "succeeded" as const;
  if (status === "unknown-outcome") return "unknown" as const;
  if (["scheduled", "held", "suppressed", "cancelled", "failed"].includes(status)) return status as "scheduled" | "held" | "suppressed" | "cancelled" | "failed";
  if (status === "leased" || status === "retrying" || status === "active") return "scheduled" as const;
  return "unknown" as const;
}

async function readProjection(organizationId: string, customerId: string, mode: AnalyticsDataMode) {
  return lifecycleProjectionStore.getProjection({ organizationId, customerId, dataMode: mode });
}

export const listCustomerWorkspace = onCall(async (request) => {
  const data = object(request.data);
  const organizationId = requiredString(data, "organizationId");
  const identityId = actor(request);
  await assertOrganizationCapability(organizationId, identityId, "customers.view");
  const mode = dataMode(data.dataMode);
  const pageSize = requestedLimit(data.limit);
  const queryText = optionalString(data.query)?.trim().toLowerCase() ?? "";
  const filters = data.filters && typeof data.filters === "object" && !Array.isArray(data.filters) ? data.filters as Record<string, unknown> : {};
  const cursor = optionalString(data.cursor);
  const snapshot = await organizationRef(organizationId).collection("customers").where("status", "==", "active").limit(250).get();
  const customers = snapshot.docs
    .map((item) => item.data() as OrganizationCustomerRelationship)
    .filter((item) => item.organizationId === organizationId && (item.dataMode ?? "live") === mode);
  const projections = await Promise.all(customers.map((customer) => readProjection(organizationId, customer.customerId, mode)));
  const rows = customers.map((customer, index) => {
    const projection = projections[index];
    return {
      organizationId,
      customerId: customer.customerId,
      displayName: profileName(customer),
      ...(customer.profile.email ? { primaryEmail: customer.profile.email } : {}),
      dimensions: dimensions(projection),
      updatedAt: projection?.updatedAt ?? customer.updatedAt,
    };
  }).filter((item) => !queryText || [item.customerId, item.displayName, item.primaryEmail ?? ""].some((value) => value.toLowerCase().includes(queryText)))
    .filter((item) => {
      for (const key of ["identity", "onboarding", "commercial", "experience", "communication"] as const) {
        const filter = filters[key];
        if (!filter || filter === "all") continue;
        const fact = item.dimensions[key];
        if (filter === "unknown" || filter === "unavailable") { if (fact.status !== filter) return false; }
        else if (fact.status !== "known" || fact.value !== filter) return false;
      }
      return true;
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.customerId.localeCompare(right.customerId));
  const start = cursor ? Math.max(0, rows.findIndex((item) => item.customerId === cursor) + 1) : 0;
  const items = rows.slice(start, start + pageSize);
  return {
    items,
    pageSize,
    ...(start + items.length < rows.length && items.length ? { nextCursor: items[items.length - 1].customerId } : {}),
  };
});

export const getCustomerWorkspaceDetail = onCall(async (request) => {
  const data = object(request.data);
  const organizationId = requiredString(data, "organizationId");
  const customerId = requiredString(data, "customerId");
  const identityId = actor(request);
  await assertOrganizationCapability(organizationId, identityId, "customers.view");
  const mode = dataMode(data.dataMode);
  const customerSnapshot = await organizationRef(organizationId).collection("customers").doc(customerId).get();
  if (!customerSnapshot.exists) return null;
  const customer = customerSnapshot.data() as OrganizationCustomerRelationship;
  if (customer.organizationId !== organizationId || (customer.dataMode ?? "live") !== mode) throw new HttpsError("permission-denied", "Customer scope is unavailable.");

  const [projection, subscription, onboarding, eligibility, messages, jobs] = await Promise.all([
    readProjection(organizationId, customerId, mode),
    getCurrentSubscriptionForCustomer(organizationId, customerId),
    latestOnboarding(organizationId, customerId, mode),
    currentMarketingEligibility(organizationId, customer, mode),
    organizationRef(organizationId).collection("communicationMessages").where("recipientKey", "==", `customer:${customerId}`).orderBy("intent.createdAt", "desc").limit(25).get(),
    organizationRef(organizationId).collection("acquisitionJobs").where("subjectId", "==", customerId).limit(50).get(),
  ]);
  const offer = subscription ? await getOfferRecord(organizationId, subscription.offerId) : null;
  const dims = dimensions(projection);
  const updatedAt = [customer.updatedAt, projection?.updatedAt, subscription?.updatedAt, onboarding?.lastActivityAt]
    .filter((value): value is string => typeof value === "string")
    .sort().at(-1) ?? customer.updatedAt;
  return {
    organizationId,
    customerId,
    profile: {
      displayName: profileName(customer),
      ...(customer.profile.email ? { email: customer.profile.email } : {}),
      ...(customer.profile.phone ? { phone: customer.profile.phone } : {}),
      ...(customer.profile.company ? { company: customer.profile.company } : {}),
      identityStatus: dims.identity,
      ...(customer.linkedLeadId ? { linkedLeadId: customer.linkedLeadId } : {}),
    },
    dimensions: dims,
    subscription: subscription ? known({
      offerName: offer?.published?.name ?? offer?.draft?.name ?? subscription.offerId,
      offerVersion: subscription.offerVersion,
      ...(subscription.billingInterval === "month" || subscription.billingInterval === "year" ? { billingInterval: subscription.billingInterval } : {}),
      subscriptionStatus: subscription.status === "past_due" ? "past-due" : subscription.status === "canceled" ? "cancelled" : subscription.status === "trialing" ? "trialing" : subscription.status === "active" ? "active" : "none",
      ...(subscription.currentPeriodEnd ? { currentPeriodEnd: subscription.currentPeriodEnd } : {}),
      ...(subscription.trialEnd ? { trialEnd: subscription.trialEnd } : {}),
    }, "billing-reconciler", subscription.updatedAt) : known({ offerName: "No active offer", offerVersion: "none", subscriptionStatus: "none" as const }, "billing-reconciler", updatedAt),
    onboarding: onboarding ? known({
      flowName: typeof onboarding.flowId === "string" ? onboarding.flowId : "Onboarding",
      flowVersion: typeof onboarding.flowVersion === "string" ? onboarding.flowVersion : "unknown",
      status: onboarding.status === "complete" ? "completed" : onboarding.status === "in-progress" ? "in-progress" : "not-started",
      completedSteps: Array.isArray(onboarding.completedSteps) ? onboarding.completedSteps.length : 0,
      totalSteps: Array.isArray(onboarding.steps) ? onboarding.steps.length : Array.isArray(onboarding.completedSteps) ? onboarding.completedSteps.length : 0,
      ...(typeof onboarding.lastActivityAt === "string" ? { lastProgressAt: onboarding.lastActivityAt } : {}),
    }, "customer-onboarding", typeof onboarding.lastActivityAt === "string" ? onboarding.lastActivityAt : updatedAt) : unknown("No onboarding progress is recorded for this customer."),
    experience: projection ? known({
      status: dims.experience.status === "known" ? dims.experience.value : "not-started",
      ...(projection.experience.firstUseAt ? { firstUseAt: projection.experience.firstUseAt } : {}),
      ...(projection.experience.lastUseAt ? { lastUseAt: projection.experience.lastUseAt } : {}),
      milestones: projection.experience.milestones.map((milestone) => ({ id: milestone.milestoneId, label: milestone.label ?? milestone.milestoneKey, occurredAt: milestone.occurredAt, source: milestone.eventId })),
    }, "lifecycle-projection", projection.experience.metadata.updatedAt) : unknown("Experience projection is not available yet."),
    communicationEligibility: eligibility,
    communicationHistory: messages.docs.map((item) => {
      const record = item.data() as MessageDeliveryRecord;
      return {
        id: record.intent.messageId,
        channel: "email" as const,
        purpose: record.intent.purpose === "transactional" ? "service" as const : "promotional" as const,
        summary: `${record.intent.templateId} v${record.intent.templateVersion}`,
        status: messageStatus(record.status),
        occurredAt: record.deliveredAt ?? record.acceptedAt ?? record.updatedAt ?? record.intent.createdAt,
        ...(record.statusReason ? { reason: record.statusReason } : {}),
      };
    }),
    acquisitionEnrollments: jobs.docs
      .map((item) => item.data())
      .filter((item) => item.dataMode === mode)
      .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")))
      .map((item) => ({
        enrollmentId: String(item.enrollmentId ?? "unknown"),
        automationId: String(item.automationId ?? "unknown"),
        automationLabel: String(item.automationId ?? "Automation"),
        pinnedVersion: String(item.automationVersionId ?? "unknown"),
        status: acquisitionStatus(String(item.status ?? "unknown")),
        reason: `${String(item.lastExplanation?.reason ?? "state-unknown")}: ${String(item.lastExplanation?.detail ?? "")}`.trim(),
        ...(!["provider-accepted", "suppressed", "cancelled", "failed", "unknown-outcome"].includes(String(item.status)) && typeof item.dueAt === "string" ? { nextActionAt: item.dueAt } : {}),
        updatedAt: String(item.updatedAt ?? updatedAt),
      })),
    surveys: { status: "unavailable" as const, reason: "Survey administration is outside the Release 2 customer-lifecycle backend activation." },
    referrals: { status: "unavailable" as const, reason: "Referral administration is outside the Release 2 customer-lifecycle backend activation." },
    updatedAt,
  };
});
