import { HttpsError, onCall } from "firebase-functions/v2/https";
import { stripeSecretKey } from "./config.js";
import {
  parseAttemptId,
  parseRequiredId,
  safeReturnPath,
} from "./model.js";
import {
  getBillingCustomerMapping,
  getCurrentSubscriptionForCustomer,
  getOfferRecord,
  recordCheckoutSession,
  resolveCustomerId,
  writeLifecycleEvent,
} from "./store.js";
import {
  createStripeBillingPortal,
  createStripeCheckout,
  getOrCreateStripeCustomer,
} from "./stripe-adapter.js";

function dataRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request data must be an object.");
  return value as Record<string, unknown>;
}

function requireUser(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in to continue.");
  return auth;
}

function asPrecondition(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "The billing operation could not be completed.");
}

export const createBillingCheckoutSession = onCall({ secrets: [stripeSecretKey] }, async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = parseRequiredId(data.organizationId, "organizationId");
    const offerId = parseRequiredId(data.offerId, "offerId");
    const priceId = parseRequiredId(data.priceId, "priceId");
    const attemptId = parseAttemptId(data.attemptId);
    const returnPath = safeReturnPath(data.returnPath);
    const auth = requireUser(request.auth);
    const customerId = await resolveCustomerId(organizationId, auth.uid);

    const record = await getOfferRecord(organizationId, offerId);
    const offer = record?.published;
    if (!offer || offer.status !== "published" || offer.visibility === "hidden") {
      throw new HttpsError("not-found", "The selected Offer is not available for checkout.");
    }
    const price = offer.prices.find((item) => item.id === priceId && item.active);
    if (!price) throw new HttpsError("failed-precondition", "The selected Offer price is not active.");
    if (price.unitAmountMinor === 0) throw new HttpsError("failed-precondition", "Free access does not require Stripe Checkout.");
    if (!price.providerPriceId) throw new HttpsError("failed-precondition", "The selected Offer is missing its Stripe test-mode Price mapping.");

    const email = typeof auth.token.email === "string" ? auth.token.email : undefined;
    const mapping = await getOrCreateStripeCustomer({ organizationId, customerId, email });
    const result = await createStripeCheckout({
      organizationId,
      customerId,
      providerCustomerId: mapping.providerCustomerId,
      offer,
      localPrice: price,
      attemptId,
      returnPath,
    });

    await recordCheckoutSession({
      organizationId,
      customerId,
      offerId,
      priceId,
      attemptId,
      providerSessionId: result.checkoutSessionId,
    });
    await writeLifecycleEvent({
      eventType: "checkout.started",
      organizationId,
      subjectKind: "customer",
      subjectId: customerId,
      customerId,
      offerId,
      source: "domain_action",
      correlationId: attemptId,
      idempotencyKey: `checkout.started:${attemptId}`,
      payload: {
        provider: "stripe",
        billingInterval: price.interval,
        currency: price.currency,
        unitAmountMinor: price.unitAmountMinor,
      },
    });
    return result;
  } catch (error) {
    asPrecondition(error);
  }
});

export const getCurrentSubscription = onCall(async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = parseRequiredId(data.organizationId, "organizationId");
    const auth = requireUser(request.auth);
    const customerId = await resolveCustomerId(organizationId, auth.uid);
    const subscription = await getCurrentSubscriptionForCustomer(organizationId, customerId);
    if (!subscription) return { subscription: null };
    const { lastProviderEventCreated: _internalProviderCreated, updatedAt: _internalUpdatedAt, ...snapshot } = subscription;
    return { subscription: snapshot };
  } catch (error) {
    asPrecondition(error);
  }
});

export const createBillingPortalSession = onCall({ secrets: [stripeSecretKey] }, async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = parseRequiredId(data.organizationId, "organizationId");
    const auth = requireUser(request.auth);
    const customerId = await resolveCustomerId(organizationId, auth.uid);
    const mapping = await getBillingCustomerMapping(organizationId, customerId);
    if (!mapping) throw new HttpsError("failed-precondition", "No Stripe Customer mapping exists for this Customer yet.");
    return await createStripeBillingPortal(mapping.providerCustomerId);
  } catch (error) {
    asPrecondition(error);
  }
});
