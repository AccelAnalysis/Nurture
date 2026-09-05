import { describe, expect, it } from "vitest";
import type { CommercialOffer, SubscriptionSnapshot } from "../billing/contracts";
import { resolveExpansionOffer, toCommercialServicingSummary } from "./commercial-servicing";

const current: SubscriptionSnapshot = {
  id: "sub-local",
  organizationId: "org-a",
  customerId: "customer-a",
  offerId: "entry",
  offerVersion: 2,
  offerPriceId: "entry-monthly",
  provider: "stripe",
  providerCustomerId: "cus_test",
  providerSubscriptionId: "sub_test",
  providerPriceId: "price_old_entry",
  billingInterval: "month",
  currency: "usd",
  unitAmountMinor: 1900,
  status: "active",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: "2026-10-05T12:00:00.000Z",
  trustedAt: "2026-09-05T12:00:00.000Z",
  providerEventId: "evt_1",
};

const premium: CommercialOffer = {
  id: "premium",
  organizationId: "org-a",
  slug: "premium",
  name: "Premium",
  description: "Premium capabilities",
  status: "published",
  visibility: "authenticated",
  order: 3,
  recommended: true,
  marketingBenefits: ["Advanced analysis"],
  capabilityKeys: ["analysis.premium"],
  prices: [{ id: "premium-monthly", interval: "month", currency: "usd", unitAmountMinor: 4900, provider: "stripe", providerPriceId: "price_premium_v4", active: true }],
  version: 4,
  publishedAt: "2026-09-05T11:00:00.000Z",
};

describe("Release 3 commercial servicing", () => {
  it("resolves one current published offer for a missing requested capability", () => {
    const result = resolveExpansionOffer({ organizationId: "org-a", customerId: "customer-a", requestedCapability: "analysis.premium", currentEntitlements: ["analysis.basic"], currentSubscription: current, publishedOffers: [premium] });
    expect(result?.offerId).toBe("premium");
    expect(result?.offerVersion).toBe(4);
    expect(result?.providerPriceRef).toBe("price_premium_v4");
  });

  it("does not upsell a capability the customer already owns", () => {
    expect(resolveExpansionOffer({ organizationId: "org-a", customerId: "customer-a", requestedCapability: "analysis.premium", currentEntitlements: ["analysis.premium"], currentSubscription: current, publishedOffers: [premium] })).toBeNull();
  });

  it("suppresses expansion during cancellation", () => {
    expect(resolveExpansionOffer({ organizationId: "org-a", customerId: "customer-a", requestedCapability: "analysis.premium", currentEntitlements: [], currentSubscription: { ...current, cancelAtPeriodEnd: true }, publishedOffers: [premium] })).toBeNull();
  });

  it("keeps cancellation request separate from provider-confirmed access end", () => {
    const summary = toCommercialServicingSummary({ organizationId: "org-a", customerId: "customer-a", subscription: { ...current, cancelAtPeriodEnd: true }, entitlementKeys: ["analysis.basic"], cancellationRequestedAt: "2026-09-05T12:05:00.000Z" });
    expect(summary.cancellation.status).toBe("scheduled");
    expect(summary.cancellation.requestedAt).toBe("2026-09-05T12:05:00.000Z");
    expect(summary.cancellation.accessEndsAt).toBe(current.currentPeriodEnd);
  });

  it("derives failed and recovered payment health from trusted commercial inputs", () => {
    expect(toCommercialServicingSummary({ organizationId: "org-a", customerId: "customer-a", subscription: { ...current, status: "past_due" }, entitlementKeys: [] }).paymentHealth).toBe("failed");
    expect(toCommercialServicingSummary({ organizationId: "org-a", customerId: "customer-a", subscription: current, entitlementKeys: [], paymentRecoveredAt: "2026-09-05T13:00:00.000Z" }).paymentHealth).toBe("recovered");
  });
});
