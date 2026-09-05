import Stripe from "stripe";
import type {
  CommercialOffer,
  OfferPrice,
  SubscriptionSnapshot,
} from "../../../shared/billing/contracts.js";
import { billingTrialsEnabled, getApplicationBaseUrl, getStripeClient } from "./config.js";
import {
  getBillingCustomerMapping,
  saveBillingCustomerMapping,
} from "./store.js";
import {
  stripeInterval,
  stripeStatus,
  unixSecondsToIso,
} from "./model.js";

function customerIdFromSubscription(subscription: Stripe.Subscription) {
  if (typeof subscription.customer === "string") return subscription.customer;
  return subscription.customer.id;
}

export async function validateStripePriceMapping(localPrice: OfferPrice) {
  if (!localPrice.providerPriceId) {
    if (localPrice.unitAmountMinor === 0) return null;
    throw new Error("Paid pricing requires a Stripe Price mapping.");
  }

  const stripe = getStripeClient();
  const price = await stripe.prices.retrieve(localPrice.providerPriceId);
  if (price.livemode) throw new Error("Release 1 rejects live-mode Stripe Prices.");
  if (!price.active) throw new Error(`Stripe Price ${price.id} is inactive.`);
  if (!price.recurring) throw new Error(`Stripe Price ${price.id} is not recurring.`);
  if (price.unit_amount === null) throw new Error(`Stripe Price ${price.id} does not have a fixed unit amount.`);
  if (price.unit_amount !== localPrice.unitAmountMinor) throw new Error(`Stripe Price ${price.id} amount does not match the Nurture Offer.`);
  if (price.currency.toLowerCase() !== localPrice.currency.toLowerCase()) throw new Error(`Stripe Price ${price.id} currency does not match the Nurture Offer.`);
  if (price.recurring.interval !== localPrice.interval) throw new Error(`Stripe Price ${price.id} interval does not match the Nurture Offer.`);
  return price;
}

export async function getOrCreateStripeCustomer(input: {
  organizationId: string;
  customerId: string;
  email?: string;
}) {
  const existing = await getBillingCustomerMapping(input.organizationId, input.customerId);
  if (existing) return existing;

  const stripe = getStripeClient();
  const now = new Date().toISOString();
  const customer = await stripe.customers.create({
    ...(input.email ? { email: input.email } : {}),
    metadata: {
      nurtureOrganizationId: input.organizationId,
      nurtureCustomerId: input.customerId,
    },
  }, {
    idempotencyKey: `nurture-customer:${input.organizationId}:${input.customerId}`,
  });
  if (customer.livemode) throw new Error("Release 1 rejected an unexpected live-mode Stripe Customer.");

  const mapping = {
    organizationId: input.organizationId,
    customerId: input.customerId,
    provider: "stripe" as const,
    providerCustomerId: customer.id,
    createdAt: now,
    updatedAt: now,
  };
  await saveBillingCustomerMapping(mapping);
  return mapping;
}

export async function createStripeCheckout(input: {
  organizationId: string;
  customerId: string;
  providerCustomerId: string;
  offer: CommercialOffer;
  localPrice: OfferPrice;
  attemptId: string;
  returnPath: string;
}) {
  if (!input.localPrice.providerPriceId) throw new Error("A Stripe Price mapping is required for checkout.");
  await validateStripePriceMapping(input.localPrice);

  const stripe = getStripeClient();
  const baseUrl = getApplicationBaseUrl();
  const separator = input.returnPath.includes("?") ? "&" : "?";
  const metadata = {
    nurtureOrganizationId: input.organizationId,
    nurtureCustomerId: input.customerId,
    nurtureOfferId: input.offer.id,
    nurtureOfferPriceId: input.localPrice.id,
  };
  const useTrial = billingTrialsEnabled.value() && Boolean(input.offer.trialDays && input.offer.trialDays > 0);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.providerCustomerId,
    line_items: [{ price: input.localPrice.providerPriceId, quantity: 1 }],
    success_url: `${baseUrl}${input.returnPath}${separator}checkout=returned`,
    cancel_url: `${baseUrl}/app/offers?checkout=cancelled`,
    client_reference_id: input.customerId,
    metadata,
    subscription_data: {
      metadata,
      ...(useTrial ? { trial_period_days: input.offer.trialDays } : {}),
    },
  }, {
    idempotencyKey: `nurture-checkout:${input.organizationId}:${input.customerId}:${input.attemptId}`,
  });

  if (!session.url) throw new Error("Stripe did not return a hosted Checkout URL.");
  return { checkoutSessionId: session.id, redirectUrl: session.url };
}

export async function createStripeBillingPortal(providerCustomerId: string, returnPath = "/app/billing") {
  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: providerCustomerId,
    return_url: `${getApplicationBaseUrl()}${returnPath}`,
  });
  return { redirectUrl: session.url };
}

export function subscriptionSnapshotFromStripe(input: {
  subscription: Stripe.Subscription;
  offer: CommercialOffer;
  organizationId: string;
  customerId: string;
  providerEventId: string;
}): SubscriptionSnapshot {
  const { subscription, offer } = input;
  if (subscription.livemode) throw new Error("Release 1 rejects live-mode subscription events.");
  if (subscription.items.data.length !== 1) throw new Error("Release 1 expects exactly one subscription item per Nurture Offer.");
  const item = subscription.items.data[0];
  const providerPrice = item.price;
  if (!providerPrice.recurring) throw new Error("Subscription item is not recurring.");
  if (providerPrice.unit_amount === null) throw new Error("Subscription item does not have a fixed unit amount.");

  const localPrice = offer.prices.find((price) => price.providerPriceId === providerPrice.id && price.active);
  if (!localPrice) throw new Error("Stripe subscription Price is not mapped to the published Nurture Offer.");
  if (localPrice.unitAmountMinor !== providerPrice.unit_amount || localPrice.currency !== providerPrice.currency.toLowerCase()) {
    throw new Error("Stripe subscription commercial terms do not match the published Nurture Offer.");
  }
  if (localPrice.interval !== providerPrice.recurring.interval) throw new Error("Stripe subscription interval does not match the published Nurture Offer.");

  const metadata = subscription.metadata;
  if (metadata.nurtureOrganizationId !== input.organizationId || metadata.nurtureCustomerId !== input.customerId || metadata.nurtureOfferId !== offer.id || metadata.nurtureOfferPriceId !== localPrice.id) {
    throw new Error("Stripe subscription metadata does not match the resolved Nurture scope.");
  }

  return {
    id: subscription.id,
    organizationId: input.organizationId,
    customerId: input.customerId,
    offerId: offer.id,
    provider: "stripe",
    providerCustomerId: customerIdFromSubscription(subscription),
    providerSubscriptionId: subscription.id,
    providerPriceId: providerPrice.id,
    billingInterval: stripeInterval(providerPrice.recurring.interval),
    currency: providerPrice.currency.toLowerCase(),
    unitAmountMinor: providerPrice.unit_amount,
    status: stripeStatus(subscription.status),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodStart: unixSecondsToIso(item.current_period_start),
    currentPeriodEnd: unixSecondsToIso(item.current_period_end),
    trialEnd: unixSecondsToIso(subscription.trial_end),
    trustedAt: new Date().toISOString(),
    providerEventId: input.providerEventId,
  };
}
