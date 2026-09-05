export type CommercialSubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

/** Structural subset of Track D's CommercialOffer. */
export interface CommercialOfferEntitlementInput {
  id: string;
  organizationId: string;
  status: "draft" | "published" | "disabled" | "archived";
  capabilityKeys: readonly string[];
}

/** Structural subset of Track D's provider-neutral SubscriptionSnapshot. */
export interface SubscriptionEntitlementInput {
  organizationId: string;
  customerId: string;
  offerId: string;
  providerSubscriptionId: string;
  status: CommercialSubscriptionStatus;
  trustedAt: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: string;
  trialEnd?: string;
}

export interface ExperienceCapabilityCatalogEntry {
  key: string;
  kind?: "grant" | "allowance";
  remaining?: number;
  resetAt?: string;
}

export interface ProjectedExperienceEntitlement {
  id: string;
  organizationId: string;
  customerId: string;
  experienceId: string;
  capabilityKey: string;
  status: "active";
  kind: "grant" | "allowance";
  source: "subscription";
  verifiedAt: string;
  expiresAt?: string;
  remaining?: number;
  resetAt?: string;
}

export interface ProjectedEntitlementSnapshot {
  trust: "server-derived";
  fetchedAt: string;
  organizationId: string;
  customerId: string;
  entitlements: ProjectedExperienceEntitlement[];
}

export type CommercialEntitlementProjection =
  | {
      ok: true;
      snapshot: ProjectedEntitlementSnapshot;
      unmappedCapabilityKeys: string[];
    }
  | {
      ok: false;
      reason:
        | "offer-not-published"
        | "scope-mismatch"
        | "offer-mismatch"
        | "invalid-trusted-time";
      explanation: string;
    };

const GRANTING_SUBSCRIPTION_STATES = new Set<CommercialSubscriptionStatus>(["active", "trialing"]);

function validTimestamp(value: string | undefined) {
  return value !== undefined && !Number.isNaN(Date.parse(value));
}

/**
 * Track B's provider-neutral projection from Track D commercial truth into
 * Experience entitlements. Run this only over trusted, server-reconciled Offer
 * and SubscriptionSnapshot records. It is pure so a Cloud Function/server
 * handler can use it without importing React or browser code.
 */
export function projectCommercialEntitlements(input: {
  offer: CommercialOfferEntitlementInput;
  subscription: SubscriptionEntitlementInput;
  experienceId: string;
  declaredCapabilities: readonly ExperienceCapabilityCatalogEntry[];
  fetchedAt?: string;
}): CommercialEntitlementProjection {
  const { offer, subscription, experienceId, declaredCapabilities } = input;
  if (offer.status !== "published") {
    return { ok: false, reason: "offer-not-published", explanation: "Only a published Offer can supply Experience capability inputs." };
  }
  if (offer.organizationId !== subscription.organizationId) {
    return { ok: false, reason: "scope-mismatch", explanation: "The Offer and subscription belong to different organizations." };
  }
  if (offer.id !== subscription.offerId) {
    return { ok: false, reason: "offer-mismatch", explanation: "The subscription does not reference the supplied Offer." };
  }
  if (!validTimestamp(subscription.trustedAt)) {
    return { ok: false, reason: "invalid-trusted-time", explanation: "The subscription is missing a valid trusted reconciliation timestamp." };
  }

  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const catalog = new Map(declaredCapabilities.map((capability) => [capability.key, capability] as const));
  const unmappedCapabilityKeys = offer.capabilityKeys.filter((key) => !catalog.has(key));

  if (!GRANTING_SUBSCRIPTION_STATES.has(subscription.status)) {
    return {
      ok: true,
      snapshot: {
        trust: "server-derived",
        fetchedAt,
        organizationId: subscription.organizationId,
        customerId: subscription.customerId,
        entitlements: [],
      },
      unmappedCapabilityKeys,
    };
  }

  const expiresAt = subscription.status === "trialing"
    ? (validTimestamp(subscription.trialEnd) ? subscription.trialEnd : subscription.currentPeriodEnd)
    : subscription.currentPeriodEnd;

  const entitlements = offer.capabilityKeys.flatMap((capabilityKey) => {
    const capability = catalog.get(capabilityKey);
    if (!capability) return [];
    const kind = capability.kind ?? "grant";
    return [{
      id: `subscription:${subscription.providerSubscriptionId}:${capabilityKey}`,
      organizationId: subscription.organizationId,
      customerId: subscription.customerId,
      experienceId,
      capabilityKey,
      status: "active" as const,
      kind,
      source: "subscription" as const,
      verifiedAt: subscription.trustedAt,
      ...(validTimestamp(expiresAt) ? { expiresAt } : {}),
      ...(kind === "allowance" && typeof capability.remaining === "number" ? { remaining: capability.remaining } : {}),
      ...(kind === "allowance" && validTimestamp(capability.resetAt) ? { resetAt: capability.resetAt } : {}),
    }];
  });

  return {
    ok: true,
    snapshot: {
      trust: "server-derived",
      fetchedAt,
      organizationId: subscription.organizationId,
      customerId: subscription.customerId,
      entitlements,
    },
    unmappedCapabilityKeys,
  };
}

export type ProtectedCapabilityDecision =
  | { allowed: true; entitlement: ProjectedExperienceEntitlement }
  | {
      allowed: false;
      reason: "scope-mismatch" | "entitlement-not-granted" | "entitlement-expired" | "quota-exhausted";
    };

/**
 * Server-side authorization helper for a protected Experience operation. A
 * browser `canUse` decision must never be substituted for this check.
 */
export function authorizeProjectedCapability(input: {
  snapshot: ProjectedEntitlementSnapshot;
  organizationId: string;
  customerId: string;
  experienceId: string;
  capabilityKey: string;
  now?: string;
}): ProtectedCapabilityDecision {
  const { snapshot } = input;
  if (
    snapshot.trust !== "server-derived" ||
    snapshot.organizationId !== input.organizationId ||
    snapshot.customerId !== input.customerId
  ) {
    return { allowed: false, reason: "scope-mismatch" };
  }

  const entitlement = snapshot.entitlements.find((candidate) =>
    candidate.organizationId === input.organizationId &&
    candidate.customerId === input.customerId &&
    candidate.experienceId === input.experienceId &&
    candidate.capabilityKey === input.capabilityKey &&
    candidate.status === "active",
  );
  if (!entitlement) return { allowed: false, reason: "entitlement-not-granted" };

  const now = Date.parse(input.now ?? new Date().toISOString());
  if (entitlement.expiresAt && Date.parse(entitlement.expiresAt) <= now) {
    return { allowed: false, reason: "entitlement-expired" };
  }
  if (entitlement.kind === "allowance" && (entitlement.remaining ?? 0) <= 0) {
    return { allowed: false, reason: "quota-exhausted" };
  }
  return { allowed: true, entitlement };
}
