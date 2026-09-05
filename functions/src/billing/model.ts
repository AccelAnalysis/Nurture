import type {
  BillingInterval,
  CommercialLifecycleEventType,
  CommercialOffer,
  OfferPrice,
  SubscriptionSnapshot,
  SubscriptionStatus,
} from "../../../shared/billing/contracts.js";

export interface OfferRecord {
  draft: CommercialOffer;
  published?: CommercialOffer;
  updatedAt: string;
}

export interface BillingCustomerMapping {
  organizationId: string;
  customerId: string;
  provider: "stripe";
  providerCustomerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredSubscription extends SubscriptionSnapshot {
  lastProviderEventCreated: number;
  updatedAt: string;
}

export interface ProviderEventRecord {
  provider: "stripe";
  eventId: string;
  eventType: string;
  providerCreated: number;
  outcome: "processed" | "ignored_duplicate" | "ignored_stale" | "rejected";
  organizationId?: string;
  providerSubscriptionId?: string;
  processedAt: string;
  reason?: string;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as UnknownRecord;
}

function stringValue(value: unknown, field: string, max = 240) {
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new Error(`${field} must contain 1-${max} characters.`);
  return trimmed;
}

function optionalString(value: unknown, field: string, max = 240) {
  if (value === undefined || value === null || value === "") return undefined;
  return stringValue(value, field, max);
}

function integerValue(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}.`);
  }
  return value as number;
}

function booleanValue(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean.`);
  return value;
}

function stringArray(value: unknown, field: string, options: { maxItems: number; maxLength: number; pattern?: RegExp }) {
  if (!Array.isArray(value) || value.length > options.maxItems) throw new Error(`${field} must be an array of at most ${options.maxItems} strings.`);
  const result = value.map((item, index) => {
    const parsed = stringValue(item, `${field}[${index}]`, options.maxLength);
    if (options.pattern && !options.pattern.test(parsed)) throw new Error(`${field}[${index}] has an invalid format.`);
    return parsed;
  });
  return [...new Set(result)];
}

function parsePrice(value: unknown, index: number): OfferPrice {
  const input = record(value, `prices[${index}]`);
  const interval = stringValue(input.interval, `prices[${index}].interval`, 8);
  if (interval !== "month" && interval !== "year") throw new Error(`prices[${index}].interval must be month or year.`);
  if (input.provider !== "stripe") throw new Error(`prices[${index}].provider must be stripe.`);
  const currency = stringValue(input.currency, `prices[${index}].currency`, 3).toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) throw new Error(`prices[${index}].currency must be a three-letter ISO currency code.`);
  const providerPriceId = optionalString(input.providerPriceId, `prices[${index}].providerPriceId`, 128);
  if (providerPriceId && !providerPriceId.startsWith("price_")) throw new Error(`prices[${index}].providerPriceId must be a Stripe Price ID.`);
  return {
    id: stringValue(input.id, `prices[${index}].id`, 100),
    interval: interval as BillingInterval,
    currency,
    unitAmountMinor: integerValue(input.unitAmountMinor, `prices[${index}].unitAmountMinor`, 0, 100_000_000),
    provider: "stripe",
    providerPriceId,
    active: booleanValue(input.active, `prices[${index}].active`),
  };
}

export function parseCommercialOffer(value: unknown, expectedOrganizationId?: string): CommercialOffer {
  const input = record(value, "offer");
  const organizationId = stringValue(input.organizationId, "offer.organizationId", 128);
  if (expectedOrganizationId && organizationId !== expectedOrganizationId) throw new Error("Offer organization scope does not match the authorized organization.");
  const status = stringValue(input.status, "offer.status", 16);
  if (!new Set(["draft", "published", "disabled", "archived"]).has(status)) throw new Error("offer.status is invalid.");
  const visibility = stringValue(input.visibility, "offer.visibility", 16);
  if (!new Set(["public", "authenticated", "hidden"]).has(visibility)) throw new Error("offer.visibility is invalid.");
  if (!Array.isArray(input.prices) || input.prices.length < 1 || input.prices.length > 4) throw new Error("offer.prices must contain 1-4 prices.");
  const prices = input.prices.map(parsePrice);
  const activeIntervals = prices.filter((price) => price.active).map((price) => price.interval);
  if (new Set(activeIntervals).size !== activeIntervals.length) throw new Error("Only one active price is allowed for each billing interval.");
  const activeCurrencies = new Set(prices.filter((price) => price.active).map((price) => price.currency));
  if (activeCurrencies.size > 1) throw new Error("Release 1 monthly and annual prices for an offer must use the same currency.");

  const trialDays = input.trialDays === undefined || input.trialDays === null
    ? undefined
    : integerValue(input.trialDays, "offer.trialDays", 0, 365);

  return {
    id: stringValue(input.id, "offer.id", 100),
    organizationId,
    slug: stringValue(input.slug, "offer.slug", 100),
    name: stringValue(input.name, "offer.name", 120),
    description: stringValue(input.description, "offer.description", 1200),
    status: status as CommercialOffer["status"],
    visibility: visibility as CommercialOffer["visibility"],
    order: integerValue(input.order, "offer.order", 0, 10_000),
    recommended: booleanValue(input.recommended, "offer.recommended"),
    trialDays,
    marketingBenefits: stringArray(input.marketingBenefits, "offer.marketingBenefits", { maxItems: 20, maxLength: 180 }),
    capabilityKeys: stringArray(input.capabilityKeys, "offer.capabilityKeys", { maxItems: 100, maxLength: 128, pattern: /^[a-z0-9][a-z0-9._:-]*$/ }),
    prices,
    version: integerValue(input.version, "offer.version", 0, 100_000),
    publishedAt: optionalString(input.publishedAt, "offer.publishedAt", 64),
    updatedAt: optionalString(input.updatedAt, "offer.updatedAt", 64),
  };
}

export function validateOfferForPublish(offer: CommercialOffer) {
  if (offer.status === "archived") throw new Error("An archived offer cannot be published.");
  const active = offer.prices.filter((price) => price.active);
  if (!active.length) throw new Error("At least one active price is required before publishing.");
  for (const price of active) {
    if (price.unitAmountMinor > 0 && !price.providerPriceId) {
      throw new Error(`${price.interval} paid pricing requires a Stripe test-mode Price mapping before publish.`);
    }
  }
}

export function parseRequiredId(value: unknown, field: string) {
  return stringValue(value, field, 128);
}

export function parseAttemptId(value: unknown) {
  const id = stringValue(value, "attemptId", 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("attemptId must be a UUID.");
  }
  return id;
}

export function safeReturnPath(value: unknown) {
  if (value === undefined || value === null || value === "") return "/app/billing";
  const path = stringValue(value, "returnPath", 1024);
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new Error("returnPath must be an application-relative path.");
  return path;
}

export function stripeStatus(status: string): SubscriptionStatus {
  if (status === "incomplete" || status === "incomplete_expired" || status === "trialing" || status === "active" || status === "past_due" || status === "canceled" || status === "unpaid" || status === "paused") {
    return status;
  }
  throw new Error(`Unsupported Stripe subscription status: ${status}`);
}

export function stripeInterval(interval: string): BillingInterval {
  if (interval === "month" || interval === "year") return interval;
  throw new Error(`Release 1 supports monthly or annual subscriptions, not ${interval}.`);
}

export function unixSecondsToIso(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : undefined;
}

export function isStaleProviderEvent(lastProviderEventCreated: number | undefined, incomingProviderEventCreated: number) {
  return typeof lastProviderEventCreated === "number" && incomingProviderEventCreated < lastProviderEventCreated;
}

export function subscriptionLifecycleEvent(
  previous: StoredSubscription | null,
  next: SubscriptionSnapshot,
  providerEventType: string,
): Extract<CommercialLifecycleEventType, "subscription.started" | "subscription.updated" | "subscription.cancelled"> {
  if (!previous) return "subscription.started";
  if (providerEventType === "customer.subscription.deleted" || next.status === "canceled") return "subscription.cancelled";
  return "subscription.updated";
}
