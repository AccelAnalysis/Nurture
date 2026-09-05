import { HttpsError, onCall } from "firebase-functions/v2/https";
import { projectCommercialEntitlements, authorizeProjectedCapability, type ProjectedEntitlementSnapshot } from "../../shared/experience/entitlements.js";
import { REFERENCE_ASSESSMENT_CAPABILITIES } from "../../shared/experience/reference-capabilities.js";
import type { CommercialOffer } from "../../shared/billing/contracts.js";
import { resolveCustomerId } from "./billing/customer-binding.js";
import { getCurrentSubscriptionForCustomer, offerVersionRef, writeLifecycleEvent } from "./billing/store.js";
import { parseRequiredId } from "./billing/model.js";

const moduleId = "nurture.reference-assessment";
const capabilities = Object.values(REFERENCE_ASSESSMENT_CAPABILITIES).map((key) => ({ key }));
function verifiedIdentity(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in to continue.");
  if (auth.token.email_verified !== true) throw new HttpsError("permission-denied", "Verify your email to continue.");
  return auth.uid;
}
function dataRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request data must be an object.");
  return value as Record<string, unknown>;
}

/** Supports the trusted R1 default registry. Custom installed versions stay closed until server configuration is connected. */
async function trustedSnapshot(data: Record<string, unknown>, identityId: string) {
  const organizationId = parseRequiredId(data.organizationId, "organizationId");
  const customerId = await resolveCustomerId(organizationId, identityId);
  const experienceId = `${organizationId}:primary:${moduleId}`;
  if (data.moduleId !== moduleId || data.experienceId !== experienceId) throw new HttpsError("permission-denied", "This Experience is not an installed server-supported instance.");
  if (data.customerId !== undefined && data.customerId !== customerId) throw new HttpsError("permission-denied", "Customer scope mismatch.");
  const now = new Date().toISOString();
  const empty: ProjectedEntitlementSnapshot = { trust: "server-derived", fetchedAt: now, organizationId, customerId, entitlements: [] };
  const subscription = await getCurrentSubscriptionForCustomer(organizationId, customerId);
  if (!subscription) return { snapshot: empty, experienceId };
  // An active grant without a bounded provider period must not become perpetual.
  if (subscription.status === "active" && (!subscription.currentPeriodEnd || !Number.isFinite(Date.parse(subscription.currentPeriodEnd)))) return { snapshot: empty, experienceId };
  const version = await offerVersionRef(organizationId, subscription.offerId, subscription.offerVersion).get();
  if (!version.exists) return { snapshot: empty, experienceId };
  const offer = version.data() as CommercialOffer;
  const providerPriceMatches = offer.prices.some((price) => price.id === subscription.offerPriceId && price.providerPriceId === subscription.providerPriceId);
  if (!providerPriceMatches) return { snapshot: empty, experienceId };
  const result = projectCommercialEntitlements({ offer, subscription, experienceId, declaredCapabilities: capabilities, fetchedAt: now });
  return { snapshot: result.ok ? result.snapshot : empty, experienceId };
}

export const resolveExperienceCustomer = onCall(async (request) => {
  const identityId = verifiedIdentity(request.auth);
  const data = dataRecord(request.data);
  const organizationId = parseRequiredId(data.organizationId, "organizationId");
  return { status: "ready", customerId: await resolveCustomerId(organizationId, identityId) };
});

export const getExperienceEntitlements = onCall(async (request) => {
  const identityId = verifiedIdentity(request.auth);
  const { snapshot } = await trustedSnapshot(dataRecord(request.data), identityId);
  return { status: "ready", snapshot };
});

export const runExperienceOperation = onCall(async (request) => {
  const identityId = verifiedIdentity(request.auth);
  const data = dataRecord(request.data);
  if (data.operation !== "reference.deep-dive") throw new HttpsError("invalid-argument", "Unknown Experience operation.");
  const { snapshot, experienceId } = await trustedSnapshot(data, identityId);
  const decision = authorizeProjectedCapability({ snapshot, organizationId: snapshot.organizationId, customerId: snapshot.customerId, experienceId, capabilityKey: REFERENCE_ASSESSMENT_CAPABILITIES.deepDive });
  if (!decision.allowed) throw new HttpsError("permission-denied", "This protected operation requires a current premium entitlement.");
  const requestId = parseRequiredId(data.requestId, "requestId");
  await writeLifecycleEvent({ eventType: "experience.reference-assessment.deep_dive_completed", organizationId: snapshot.organizationId, customerId: snapshot.customerId, subjectId: snapshot.customerId, subjectKind: "customer", source: "domain_action", correlationId: requestId, idempotencyKey: `reference-deep-dive:${snapshot.customerId}:${requestId}`, payload: { experienceId, capabilityKey: REFERENCE_ASSESSMENT_CAPABILITIES.deepDive } });
  return { title: "Your next-step reflection", prompt: "Choose one action you can finish today. Define the evidence that will tell you it is complete, then decide when you will review it.", verifiedAt: snapshot.fetchedAt };
});
