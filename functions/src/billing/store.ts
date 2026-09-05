import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type {
  CommercialLifecycleEventType,
  CommercialOffer,
  SubscriptionSnapshot,
} from "../../../shared/billing/contracts.js";
import { db } from "../firebase.js";
import type {
  BillingCustomerMapping,
  OfferRecord,
  ProviderEventRecord,
  StoredSubscription,
} from "./model.js";

export type OrganizationCapability = "offers.view" | "offers.manage" | "offers.publish" | "billing.view" | "billing.manage";
type OrganizationRole = "owner" | "administrator" | "manager" | "member";

const capabilitiesByRole: Record<OrganizationRole, ReadonlySet<OrganizationCapability>> = {
  owner: new Set(["offers.view", "offers.manage", "offers.publish", "billing.view", "billing.manage"]),
  administrator: new Set(["offers.view", "offers.manage", "offers.publish", "billing.view", "billing.manage"]),
  manager: new Set(["offers.view", "offers.manage"]),
  member: new Set(),
};

function isOrganizationRole(value: unknown): value is OrganizationRole {
  return value === "owner" || value === "administrator" || value === "manager" || value === "member";
}

function organizationRef(organizationId: string) {
  return db.collection("organizations").doc(organizationId);
}

export function offerRef(organizationId: string, offerId: string) {
  return organizationRef(organizationId).collection("offers").doc(offerId);
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

export async function assertOrganizationCapability(organizationId: string, userId: string, capability: OrganizationCapability) {
  // Track E owns the durable membership/rules model. Track D keeps the lookup in
  // this single adapter so the persistence path can be swapped without leaking
  // role checks through feature code.
  const membership = await organizationRef(organizationId).collection("memberships").doc(userId).get();
  if (!membership.exists) throw new HttpsError("permission-denied", "No active organization membership was found.");
  const data = membership.data() ?? {};
  const role: unknown = data.role;
  const status: unknown = data.status;
  if (status !== "active" || !isOrganizationRole(role)) {
    throw new HttpsError("permission-denied", "The organization membership is not active.");
  }
  if (!capabilitiesByRole[role].has(capability)) {
    throw new HttpsError("permission-denied", `The ${capability} capability is required.`);
  }
}

export async function resolveCustomerId(organizationId: string, identityId: string) {
  // Track C owns Customer/Profile bootstrap. Billing never equates Firebase UID
  // with Customer ID; it resolves exactly one organization-scoped Customer.
  const result = await organizationRef(organizationId)
    .collection("customers")
    .where("identityId", "==", identityId)
    .limit(2)
    .get();
  if (result.size !== 1) {
    throw new HttpsError(
      "failed-precondition",
      result.empty
        ? "A stable organization Customer profile must exist before checkout."
        : "Multiple Customer profiles are linked to this identity; checkout is blocked until the scope is repaired.",
    );
  }
  return result.docs[0].id;
}

export async function getOfferRecord(organizationId: string, offerId: string) {
  const snapshot = await offerRef(organizationId, offerId).get();
  return snapshot.exists ? snapshot.data() as OfferRecord : null;
}

export async function listOfferRecords(organizationId: string) {
  const snapshot = await organizationRef(organizationId).collection("offers").get();
  return snapshot.docs.map((item) => item.data() as OfferRecord);
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
  await organizationRef(input.organizationId).collection("auditEvents").doc(id).set({
    id,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    ...(input.targetId ? { targetId: input.targetId } : {}),
    occurredAt,
    ...(input.context ? { context: input.context } : {}),
  });
}

export async function writeLifecycleEvent(input: {
  eventType: CommercialLifecycleEventType;
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
  const eventId = randomUUID();
  const receivedAt = new Date().toISOString();
  await organizationRef(input.organizationId).collection("lifecycleEvents").doc(eventId).set({
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
  priceId: string;
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
