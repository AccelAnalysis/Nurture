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
  /** Stable Experience capability keys requested by this Offer. */
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

/** Trusted provider reconciliation snapshot. */
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
export interface CheckoutSessionResult { checkoutSessionId: string; redirectUrl: string; }
export interface BillingPortalResult { redirectUrl: string; }
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
  | "payment.collected"
  | "payment.refunded"
  | "payment.failed"
  | "payment.recovered"
  | "subscription.started"
  | "subscription.updated"
  | "subscription.renewed"
  | "subscription.cancelled";
