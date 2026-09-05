import { httpsCallable } from "firebase/functions";
import { firebaseConfigured, functions } from "../../firebase";
import type {
  BillingPortalResult,
  CheckoutSessionRequest,
  CheckoutSessionResult,
  CommercialOffer,
  SubscriptionSnapshot,
} from "./contracts";

function requireFunctions() {
  if (!firebaseConfigured || !functions) {
    throw new Error("Billing requires the configured Nurture Firebase project.");
  }
  return functions;
}

export async function listPublishedOffers(organizationId: string) {
  const callable = httpsCallable<{ organizationId: string }, { offers: CommercialOffer[] }>(
    requireFunctions(),
    "listPublishedOffers",
  );
  const result = await callable({ organizationId });
  return result.data.offers;
}

export async function listOrganizationOffers(organizationId: string) {
  const callable = httpsCallable<{ organizationId: string }, { offers: CommercialOffer[] }>(
    requireFunctions(),
    "listOrganizationOffers",
  );
  const result = await callable({ organizationId });
  return result.data.offers;
}

export async function getCurrentSubscription(organizationId: string) {
  const callable = httpsCallable<
    { organizationId: string },
    { subscription: SubscriptionSnapshot | null }
  >(requireFunctions(), "getCurrentSubscription");
  const result = await callable({ organizationId });
  return result.data.subscription;
}

export async function createCheckoutSession(request: CheckoutSessionRequest) {
  const callable = httpsCallable<CheckoutSessionRequest, CheckoutSessionResult>(
    requireFunctions(),
    "createBillingCheckoutSession",
  );
  const result = await callable(request);
  return result.data;
}

export async function openBillingPortal(organizationId: string) {
  const callable = httpsCallable<{ organizationId: string }, BillingPortalResult>(
    requireFunctions(),
    "createBillingPortalSession",
  );
  const result = await callable({ organizationId });
  return result.data;
}

export async function seedReleaseOneOffers(organizationId: string) {
  const callable = httpsCallable<{ organizationId: string }, { created: number }>(
    requireFunctions(),
    "seedReleaseOneOffers",
  );
  const result = await callable({ organizationId });
  return result.data;
}

export async function saveOfferDraft(offer: CommercialOffer) {
  const callable = httpsCallable<{ offer: CommercialOffer }, { offer: CommercialOffer }>(
    requireFunctions(),
    "saveOfferDraft",
  );
  const result = await callable({ offer });
  return result.data.offer;
}

export async function publishOffer(organizationId: string, offerId: string) {
  const callable = httpsCallable<
    { organizationId: string; offerId: string },
    { offer: CommercialOffer }
  >(requireFunctions(), "publishOffer");
  const result = await callable({ organizationId, offerId });
  return result.data.offer;
}

export async function recordOfferViewed(organizationId: string, offerId: string) {
  const callable = httpsCallable<{ organizationId: string; offerId: string }, { accepted: true }>(
    requireFunctions(),
    "recordOfferViewed",
  );
  const result = await callable({ organizationId, offerId });
  return result.data;
}
