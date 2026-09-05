import { isOrganizationRole, organizationRoleHasCapability, type OrganizationCapability } from "../../../shared/platform/authorization.js";
import { sanitizeAuditMetadata, type AuditRecord } from "../../../shared/platform/audit.js";
import type { AnalyticsEventType } from "../../../shared/analytics/contracts.js";
import { validateLifecycleEventEnvelope } from "../../../shared/analytics/core.js";
export type { OrganizationCapability } from "../../../shared/platform/authorization.js";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type {
  CommercialOffer,
  SubscriptionSnapshot,
} from "../../../shared/billing/contracts.js";
import { db } from "../firebase.js";
import {
  permanentBillingEvent,
  type BillingCustomerMapping,
  type OfferRecord,
  type ProviderEventRecord,
  type StoredSubscription,
} from "./model.js";

function organizationRef(organizationId: string) {
  return db.collection("organizations").doc(organizationId);
}

export function offerRef(organizationId: string, offerId: string) {
  return organizationRef(organizationId).collection("offers").doc(offerId);
}

export function offerVersionRef(organizationId: string, offerId: string, version: number) {
  return offerRef(organizationId, offerId).collection("versions").doc(String(version));
}

export function subscriptionRef(organizationId: string, providerSubscriptionId: string) {
  return organizationRef(organizationId).collection("subscriptions").doc(providerSubscriptionId);
}

export function billingCustomerRef(organizationId: string, customerId: string) {
  return organizationRef(organizationId).collection("billingCustomers").doc(customerId);
}

export function providerEventRef(eventId: string) {
  return db.collection("_billingProviderEvents").doc(eventId);
}

function auditEventRef(organizationId: string, id = randomUUID()) {
  return organizationRef(organizationId).collection("auditEvents").doc(id);
}

function auditEventData(input: {
  id: string;
  organizationId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  context?: Record<string, string | number | boolean | null>;
  occurredAt: string;
}) {
  return {
    id: input.id,
    schemaVersion: 1,
    action: input.action,
    scope: { kind: "organization", organizationId: input.organizationId },
    actor: { kind: input.actorUserId === "stripe" ? "provider" : "user", id: input.actorUserId },
    target: { type: input.targetType, organizationId: input.organizationId, ...(input.targetId ? { id: input.targetId } : {}) },
    occurredAt: input.occurredAt,
    receivedAt: input.occurredAt,
    source: "cloud-function",
    ...(input.context ? { metadata: sanitizeAuditMetadata(input.context) } : {}),
  } satisfies AuditRecord;
}

export async function assertOrganizationCapability(organizationId: string, userId: string, capability: OrganizationCapability) {
  // Track E owns the durable membership/rules model. Track D keeps the lookup in
  // this single adapter so the persistence path can be swapped without leaking
  // role checks through feature code.
  const organization = await organizationRef(organizationId).get();
  if (!organization.exists || organization.data()?.status !== "active") throw new HttpsError("permission-denied", "The organization is unavailable.");
  const membership = await organizationRef(organizationId).collection("memberships").doc(userId).get();
  if (!membership.exists) throw new HttpsError("permission-denied", "No active organization membership was found.");
  const data = membership.data() ?? {};
  const role: unknown = data.role;
  const status: unknown = data.status;
  if (status !== "active" || !isOrganizationRole(role)) {
    throw new HttpsError("permission-denied", "The organization membership is not active.");
  }
  if (!organizationRoleHasCapability(role, capability)) {
    throw new HttpsError("permission-denied", `The ${capability} capability is required.`);
  }
}

export { resolveCustomerId } from "./customer-binding.js";

export async function getOfferRecord(organizationId: string, offerId: string) {
  const snapshot = await offerRef(organizationId, offerId).get();
  return snapshot.exists ? snapshot.data() as OfferRecord : null;
}

export async function listOfferRecords(organizationId: string) {
  const snapshot = await organizationRef(organizationId).collection("offers").get();
  return snapshot.docs.map((item) => item.data() as OfferRecord);
}

function priceMappedByProvider(offer: CommercialOffer, providerPriceId: string) {
  return offer.prices.some((price) => price.providerPriceId === providerPriceId);
}

export async function resolveOfferVersionForSubscription(input: {
  organizationId: string;
  offerId: string;
  providerPriceId: string;
  subscriptionCreated: number;
  metadataVersion?: string;
}) {
  const record = await getOfferRecord(input.organizationId, input.offerId);
  if (!record) return permanentBillingEvent("Subscription Offer does not exist in Nurture.");

  if (input.metadataVersion) {
    const version = Number(input.metadataVersion);
    if (!Number.isInteger(version) || version < 1) return permanentBillingEvent("Stripe subscription Offer version metadata is invalid.");
    const versionSnapshot = await offerVersionRef(input.organizationId, input.offerId, version).get();
    const versionOffer = versionSnapshot.exists ? versionSnapshot.data() as CommercialOffer : undefined;
    const candidate = versionOffer ?? (record.published?.version === version ? record.published : undefined);
    if (!candidate || !priceMappedByProvider(candidate, input.providerPriceId)) {
      return permanentBillingEvent("Stripe subscription Price does not match its recorded immutable Nurture Offer version.");
    }
    return candidate;
  }

  // Compatibility for subscriptions created before Offer-version metadata was
  // introduced: locate the immutable version that mapped the provider Price at
  // the time the subscription was created. Current published state is included
  // as a migration fallback if no version document was written yet.
  const versionSnapshots = await offerRef(input.organizationId, input.offerId).collection("versions").get();
  const candidates = versionSnapshots.docs.map((item) => item.data() as CommercialOffer);
  if (record.published && !candidates.some((item) => item.version === record.published?.version)) candidates.push(record.published);
  const createdMs = input.subscriptionCreated * 1000;
  const matching = candidates
    .filter((offer) => priceMappedByProvider(offer, input.providerPriceId))
    .filter((offer) => !offer.publishedAt || Date.parse(offer.publishedAt) <= createdMs)
    .sort((a, b) => b.version - a.version);
  if (!matching.length) return permanentBillingEvent("Stripe subscription Price is not mapped to an eligible immutable Nurture Offer version.");
  return matching[0];
}

export async function getBillingCustomerMapping(organizationId: string, customerId: string) {
  const snapshot = await billingCustomerRef(organizationId, customerId).get();
  return snapshot.exists ? snapshot.data() as BillingCustomerMapping : null;
}

export async function getCurrentSubscriptionForCustomer(organizationId: string, customerId: string) {
  const result = await organizationRef(organizationId)
    .collection("subscriptions")
    .where("customerId", "==", customerId)
    .limit(50)
    .get();
  if (result.empty) return null;
  return result.docs
    .map((item) => item.data() as StoredSubscription)
    .sort((a, b) => Date.parse(b.trustedAt) - Date.parse(a.trustedAt))[0] ?? null;
}

export async function writeAuditEvent(input: {
  organizationId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  context?: Record<string, string | number | boolean | null>;
}) {
  const id = randomUUID();
  const occurredAt = new Date().toISOString();
  await auditEventRef(input.organizationId, id).set(auditEventData({ ...input, id, occurredAt }));
}

export async function saveOfferDraftWithAudit(input: {
  organizationId: string;
  offer: CommercialOffer;
  actorUserId: string;
}) {
  const ref = offerRef(input.organizationId, input.offer.id);
  const auditId = randomUUID();
  const auditRef = auditEventRef(input.organizationId, auditId);
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() as OfferRecord : null;
    const record: OfferRecord = {
      draft: input.offer,
      ...(existing?.published ? { published: existing.published } : {}),
      updatedAt: now,
    };
    transaction.set(ref, record, { merge: false });
    transaction.create(auditRef, auditEventData({
      id: auditId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "billing.offer.draft_saved",
      targetType: "offer",
      targetId: input.offer.id,
      occurredAt: now,
      context: { version: input.offer.version, hasPublishedVersion: Boolean(existing?.published) },
    }));
  });
}

export async function publishOfferWithAudit(input: {
  organizationId: string;
  offerId: string;
  expectedDraftUpdatedAt?: string;
  actorUserId: string;
}) {
  const ref = offerRef(input.organizationId, input.offerId);
  const auditId = randomUUID();
  const auditRef = auditEventRef(input.organizationId, auditId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "Offer not found.");
    const record = snapshot.data() as OfferRecord;
    if (input.expectedDraftUpdatedAt && record.draft.updatedAt !== input.expectedDraftUpdatedAt) {
      throw new HttpsError("aborted", "The Offer draft changed during publication. Review the latest draft and publish again.");
    }
    if (record.draft.status === "published" && record.published?.updatedAt === record.draft.updatedAt) return record.published;
    const now = new Date().toISOString();
    const version = (record.published?.version ?? 0) + 1;
    const published: CommercialOffer = {
      ...record.draft,
      status: "published",
      version,
      publishedAt: now,
      updatedAt: now,
    };
    transaction.create(offerVersionRef(input.organizationId, input.offerId, version), published);
    transaction.set(ref, { draft: published, published, updatedAt: now } satisfies OfferRecord, { merge: false });
    transaction.create(auditRef, auditEventData({
      id: auditId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "billing.offer.published",
      targetType: "offer",
      targetId: input.offerId,
      occurredAt: now,
      context: { version },
    }));
    return published;
  });
}

export async function seedOfferWithAudit(input: {
  organizationId: string;
  template: CommercialOffer;
  actorUserId: string;
}) {
  const ref = offerRef(input.organizationId, input.template.id);
  const auditId = randomUUID();
  const auditRef = auditEventRef(input.organizationId, auditId);
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    if ((await transaction.get(ref)).exists) return false;
    const base = { ...input.template, organizationId: input.organizationId, updatedAt: now };
    const published = input.template.status === "published"
      ? { ...base, status: "published" as const, publishedAt: now }
      : undefined;
    const draft = published ?? { ...base, status: "draft" as const };
    transaction.create(ref, { draft, ...(published ? { published } : {}), updatedAt: now } satisfies OfferRecord);
    if (published) transaction.create(offerVersionRef(input.organizationId, input.template.id, published.version), published);
    transaction.create(auditRef, auditEventData({
      id: auditId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "billing.offer.default_seeded",
      targetType: "offer",
      targetId: input.template.id,
      occurredAt: now,
      context: { version: draft.version, published: Boolean(published) },
    }));
    return true;
  });
}

export async function writeLifecycleEvent(input: {
  eventType: AnalyticsEventType;
  organizationId: string;
  subjectKind: "customer" | "offer" | "subscription";
  subjectId: string;
  customerId?: string;
  offerId?: string;
  occurredAt?: string;
  source: "browser" | "domain_action" | "provider_webhook" | "trusted_server" | "administrator";
  correlationId: string;
  idempotencyKey: string;
  payload?: Record<string, string | number | boolean | null>;
}) {
  const digest = createHash("sha256").update(`${input.organizationId}:${input.idempotencyKey}`).digest("hex");
  const eventId = `idem-${digest}`;
  const receivedAt = new Date().toISOString();
  const ref = organizationRef(input.organizationId).collection("lifecycleEvents").doc(eventId);
  await db.runTransaction(async (transaction) => {
    if ((await transaction.get(ref)).exists) return;
    const event = validateLifecycleEventEnvelope({
      eventId,
      eventType: input.eventType,
      schemaVersion: 1,
      organizationId: input.organizationId,
      subjectId: input.subjectId,
      subjectKind: input.subjectKind,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.offerId ? { offerId: input.offerId } : {}),
      occurredAt: input.occurredAt ?? receivedAt,
      receivedAt,
      source: input.source,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      dataMode: "test",
      payload: input.payload ?? {},
    });
    transaction.create(ref, JSON.parse(JSON.stringify(event)));
  });
}

export async function markProviderEvent(record: ProviderEventRecord) {
  await providerEventRef(record.eventId).set(record, { merge: false });
}

export async function providerEventWasSeen(eventId: string) {
  return (await providerEventRef(eventId).get()).exists;
}

export async function saveOfferRecord(organizationId: string, offerId: string, record: OfferRecord) {
  await offerRef(organizationId, offerId).set(record, { merge: false });
}

export async function saveBillingCustomerMapping(mapping: BillingCustomerMapping) {
  await billingCustomerRef(mapping.organizationId, mapping.customerId).set(mapping, { merge: true });
}

export async function saveSubscription(snapshot: StoredSubscription) {
  await subscriptionRef(snapshot.organizationId, snapshot.providerSubscriptionId).set(snapshot, { merge: false });
}

export async function recordCheckoutSession(input: {
  organizationId: string;
  customerId: string;
  offerId: string;
  offerVersion: number;
  priceId: string;
  providerPriceId: string;
  attemptId: string;
  providerSessionId: string;
}) {
  await organizationRef(input.organizationId).collection("billingCheckoutSessions").doc(input.providerSessionId).set({
    ...input,
    provider: "stripe",
    createdAt: FieldValue.serverTimestamp(),
  });
}

export function publicOffer(record: OfferRecord): CommercialOffer | null {
  const published = record.published;
  if (!published || published.status !== "published" || published.visibility !== "public") return null;
  return published;
}
