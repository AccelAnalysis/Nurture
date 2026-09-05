import type { CommercialOffer, SubscriptionSnapshot } from "../billing/contracts";
import type { CommercialServicingSummary, ExpansionOfferCandidate, PaymentHealth } from "./contracts";

export interface CommercialServicingInput {
  organizationId: string;
  customerId: string;
  subscription?: SubscriptionSnapshot | null;
  entitlementKeys: string[];
  cancellationRequestedAt?: string;
  cancellationEffectiveAt?: string;
  accessEndsAt?: string;
  paymentFailureObserved?: boolean;
  paymentRecoveredAt?: string;
}

export function paymentHealthFromSubscription(input: CommercialServicingInput): PaymentHealth {
  if (input.paymentRecoveredAt) return "recovered";
  if (input.paymentFailureObserved || input.subscription?.status === "past_due" || input.subscription?.status === "unpaid") return "failed";
  if (input.subscription?.status === "active" || input.subscription?.status === "trialing") return "healthy";
  return "unknown";
}

export function toCommercialServicingSummary(input: CommercialServicingInput): CommercialServicingSummary {
  const subscription = input.subscription ?? null;
  const cancelled = subscription?.status === "canceled";
  const cancellationStatus = cancelled
    ? "completed"
    : input.cancellationEffectiveAt
      ? "effective"
      : input.cancellationRequestedAt
        ? subscription?.cancelAtPeriodEnd ? "scheduled" : "requested"
        : subscription?.cancelAtPeriodEnd
          ? "scheduled"
          : "none";
  return {
    ...(subscription ? { subscriptionId: subscription.id, offerId: subscription.offerId, offerVersion: subscription.offerVersion } : {}),
    subscriptionState: subscription?.status ?? "none",
    entitlementKeys: [...new Set(input.entitlementKeys)].sort(),
    ...(subscription?.currentPeriodEnd ? { nextRenewalAt: subscription.currentPeriodEnd } : {}),
    ...(subscription ? { renewalAmountMinor: subscription.unitAmountMinor, currency: subscription.currency } : {}),
    paymentHealth: paymentHealthFromSubscription(input),
    cancellation: {
      status: cancellationStatus,
      ...(input.cancellationRequestedAt ? { requestedAt: input.cancellationRequestedAt } : {}),
      ...(input.cancellationEffectiveAt ? { effectiveAt: input.cancellationEffectiveAt } : {}),
      ...(input.accessEndsAt ?? subscription?.currentPeriodEnd ? { accessEndsAt: input.accessEndsAt ?? subscription?.currentPeriodEnd } : {}),
      ...(cancelled ? { completedAt: subscription.trustedAt } : {}),
      ...(subscription ? { provenance: { source: "provider", sourceId: subscription.providerEventId, occurredAt: subscription.trustedAt, schemaVersion: 1 } } : {}),
    },
    ...(subscription ? { provenance: { source: "provider", sourceId: subscription.providerEventId, occurredAt: subscription.trustedAt, schemaVersion: 1 } } : {}),
  };
}

function activePrice(offer: CommercialOffer) {
  return offer.prices.find((price) => price.active && Boolean(price.providerPriceId)) ?? offer.prices.find((price) => price.active);
}

export function resolveExpansionOffer(input: {
  organizationId: string;
  customerId: string;
  requestedCapability: string;
  currentEntitlements: string[];
  currentSubscription?: SubscriptionSnapshot | null;
  publishedOffers: CommercialOffer[];
}): ExpansionOfferCandidate | null {
  if (input.currentEntitlements.includes(input.requestedCapability)) return null;
  if (input.currentSubscription?.status === "canceled" || input.currentSubscription?.cancelAtPeriodEnd) return null;

  const candidates = input.publishedOffers
    .filter((offer) => offer.organizationId === input.organizationId)
    .filter((offer) => offer.status === "published" && offer.visibility !== "hidden")
    .filter((offer) => offer.capabilityKeys.includes(input.requestedCapability))
    .filter((offer) => offer.id !== input.currentSubscription?.offerId)
    .map((offer) => ({ offer, price: activePrice(offer) }))
    .filter((candidate): candidate is { offer: CommercialOffer; price: NonNullable<ReturnType<typeof activePrice>> } => Boolean(candidate.price))
    .sort((left, right) => left.offer.order - right.offer.order || left.price.unitAmountMinor - right.price.unitAmountMinor);

  const selected = candidates[0];
  if (!selected) return null;
  return {
    organizationId: input.organizationId,
    customerId: input.customerId,
    offerId: selected.offer.id,
    offerVersion: selected.offer.version,
    requestedCapability: input.requestedCapability,
    displayName: selected.offer.name,
    amountMinor: selected.price.unitAmountMinor,
    currency: selected.price.currency,
    billingInterval: selected.price.interval,
    ...(selected.price.providerPriceId ? { providerPriceRef: selected.price.providerPriceId } : {}),
    termsSummary: `${selected.price.unitAmountMinor} ${selected.price.currency} minor units billed ${selected.price.interval === "year" ? "annually" : "monthly"}.`,
    reason: `Published offer includes capability ${input.requestedCapability}.`,
  };
}

export interface LifecycleMessageRequest {
  organizationId: string;
  customerId: string;
  channel: "email" | "in-app";
  purpose: "transactional" | "promotional";
  templateId: string;
  templateVersion: number;
  runId: string;
  effectId: string;
  variables: Record<string, string | number | boolean | null>;
}

export interface LifecycleMessagePort {
  dispatch(request: LifecycleMessageRequest): Promise<{ status: "sent" | "delivered-to-host" | "suppressed" | "failed"; providerRequestId?: string; reason?: string }>;
}
