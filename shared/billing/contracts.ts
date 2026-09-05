export type BillingInterval = "month" | "year";
export type OfferStatus = "draft" | "published" | "disabled" | "archived";
export type OfferVisibility = "public" | "authenticated" | "hidden";
export type PaymentProvider = "stripe";

export interface OfferPrice {
  id: string;
  interval: BillingInterval;
  currency: string;
  unitAmountMinor: number;
  provider: PaymentProvider;
  providerPriceId?: string;
  active: boolean;
}

export interface CommercialOffer {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string;
  status: OfferStatus;
  visibility: OfferVisibility;
  order: number;
  recommended: boolean;
  trialDays?: number;
  marketingBenefits: string[];
  /**
   * Stable Experience capability keys requested by this Offer. Track B owns the
   * entitlement resolver that turns trusted commercial state into actual grants.
   * Marketing copy must never be interpreted as a capability.
   */
  capabilityKeys: string[];
  prices: OfferPrice[];
  version: number;
  publishedAt?: string;
  updatedAt?: string;
}

export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

/**
 * Track D's commercial handoff to the entitlement owner. This snapshot is
 * written from trusted provider reconciliation, never from a checkout return
 * URL or browser-supplied status. The exact immutable Offer version and local
 * price are retained so later Offer publication cannot change existing access
 * semantics or prevent cancellation/payment-state reconciliation.
 */
export interface SubscriptionSnapshot {
  id: string;
  organizationId: string;
  customerId: string;
  offerId: string;
  offerVersion: number;
  offerPriceId: string;
  provider: PaymentProvider;
  providerCustomerId: string;
  providerSubscriptionId: string;
  providerPriceId: string;
  billingInterval: BillingInterval;
  currency: string;
  unitAmountMinor: number;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  trialEnd?: string;
  trustedAt: string;
  providerEventId: string;
}

export interface CheckoutSessionRequest {
  organizationId: string;
  offerId: string;
  priceId: string;
  /** Client-generated UUID used only as an idempotency attempt key. */
  attemptId: string;
  returnPath?: string;
}

export interface CheckoutSessionResult {
  checkoutSessionId: string;
  redirectUrl: string;
}

export interface BillingPortalResult {
  redirectUrl: string;
}

export interface AnnualPricingSummary {
  annualAtMonthlyRateMinor: number;
  annualSavingsMinor: number;
  annualSavingsPercent: number | null;
  equivalentMonthlyMinor: number;
  advertisesSavings: boolean;
}

export type CommercialLifecycleEventType =
  | "offer.viewed"
  | "checkout.started"
  | "checkout.completed"
  | "subscription.started"
  | "subscription.updated"
  | "subscription.cancelled";
