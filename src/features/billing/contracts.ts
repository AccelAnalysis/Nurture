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
 * Track D's only commercial handoff to the entitlement owner.
 * This snapshot is written from trusted provider reconciliation, never from a
 * checkout return URL or browser-supplied status.
 */
export interface SubscriptionSnapshot {
  id: string;
  organizationId: string;
  customerId: string;
  offerId: string;
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
