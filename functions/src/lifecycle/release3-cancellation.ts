import { createHash } from "node:crypto";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import type { AuthoritativeCustomerDataMode } from "../../../shared/customer/contracts.js";
import { getOrganizationCustomer, type VerifiedCustomerPrincipal } from "../customer/store.js";
import { db } from "../firebase.js";

function objectData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request data must be an object.");
  return value as Record<string, unknown>;
}
function requiredId(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(value)) throw new HttpsError("invalid-argument", `${label} is invalid.`);
  return value;
}
function dataMode(value: unknown): AuthoritativeCustomerDataMode {
  if (value === undefined || value === null || value === "") return "live";
  if (value === "live" || value === "test" || value === "development") return value;
  throw new HttpsError("invalid-argument", "dataMode is invalid.");
}
function principalFromRequest(request: CallableRequest<unknown>): VerifiedCustomerPrincipal {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
  const token = request.auth.token;
  return {
    identityId: request.auth.uid,
    email: typeof token.email === "string" ? token.email : null,
    emailVerified: token.email_verified === true,
    displayName: typeof token.name === "string" ? token.name : null,
    phone: typeof token.phone_number === "string" ? token.phone_number : null,
  };
}
function cancellationRef(organizationId: string, customerId: string) {
  return db.collection("organizations").doc(organizationId).collection("customerCancellationRequests").doc(customerId);
}
function lifecycleEventRef(organizationId: string, idempotencyKey: string) {
  const id = `r3-${createHash("sha256").update(`${organizationId}:${idempotencyKey}`).digest("hex")}`;
  return db.collection("organizations").doc(organizationId).collection("lifecycleEvents").doc(id);
}

/**
 * Records customer cancellation intent only. This callable never changes Stripe,
 * subscription status, current-period end, or entitlement state; provider/server
 * reconciliation remains authoritative for those commercial facts.
 */
export const r3RequestCancellation = onCall(async (request) => {
  const data = objectData(request.data);
  const organizationId = requiredId(data.organizationId, "organizationId");
  const customerId = requiredId(data.customerId, "customerId");
  const mode = dataMode(data.dataMode);
  const idempotencyKey = requiredId(data.idempotencyKey, "idempotencyKey");
  const principal = principalFromRequest(request);
  await getOrganizationCustomer(organizationId, customerId, mode, principal);

  const reference = cancellationRef(organizationId, customerId);
  const eventReference = lifecycleEventRef(organizationId, `subscription.cancellation_requested:${customerId}:${idempotencyKey}`);
  const now = new Date().toISOString();
  let requestId = "";

  await db.runTransaction(async (transaction) => {
    // Firestore transactions require all reads before writes. Both documents are
    // intentionally read first so cancellation + provenance event commit atomically.
    const [existing, eventSnapshot] = await Promise.all([
      transaction.get(reference),
      transaction.get(eventReference),
    ]);
    if (existing.exists && existing.data()?.idempotencyKey === idempotencyKey) {
      requestId = String(existing.data()?.requestId ?? "");
      return;
    }
    if (existing.exists && ["requested", "scheduled", "effective"].includes(existing.data()?.status)) {
      throw new HttpsError("already-exists", "A cancellation request is already active.");
    }

    requestId = `cancel_${createHash("sha256").update(`${organizationId}:${customerId}:${idempotencyKey}`).digest("hex").slice(0, 32)}`;
    transaction.set(reference, {
      organizationId,
      customerId,
      dataMode: mode,
      requestId,
      status: "requested",
      requestedAt: now,
      idempotencyKey,
      actorIdentityId: principal.identityId,
    }, { merge: false });

    if (!eventSnapshot.exists) transaction.create(eventReference, {
      eventId: eventReference.id,
      eventType: "subscription.cancellation_requested",
      schemaVersion: 1,
      organizationId,
      subjectId: customerId,
      subjectKind: "customer",
      customerId,
      identityId: principal.identityId,
      occurredAt: now,
      receivedAt: now,
      source: "domain_action",
      correlationId: requestId,
      idempotencyKey,
      dataMode: mode,
      payload: { requestId },
    });
  });

  return { requestId, status: "requested" as const };
});
