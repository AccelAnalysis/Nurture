import { HttpsError } from "firebase-functions/v2/https";
import type { AuthoritativeCustomerDataMode } from "../../../shared/customer/contracts.js";
import type { LifecycleCustomerPreferences } from "../../../shared/release3/customer-control.js";
import { validQuietHours, validTimeZone } from "../../../shared/release3/customer-control.js";
import { db } from "../firebase.js";
import { getOrganizationCustomer, type VerifiedCustomerPrincipal } from "./store.js";

function preferenceRef(organizationId: string, customerId: string) {
  return db.collection("organizations").doc(organizationId).collection("customerLifecyclePreferences").doc(customerId);
}

function assertId(value: string, label: string) {
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value)) throw new HttpsError("invalid-argument", `${label} is invalid.`);
}

export async function getLifecycleCustomerPreferences(input: {
  organizationId: string;
  customerId: string;
  dataMode: AuthoritativeCustomerDataMode;
  principal: VerifiedCustomerPrincipal;
}): Promise<LifecycleCustomerPreferences> {
  assertId(input.organizationId, "Organization ID");
  assertId(input.customerId, "Customer ID");
  await getOrganizationCustomer(input.organizationId, input.customerId, input.dataMode, input.principal);
  const snapshot = await preferenceRef(input.organizationId, input.customerId).get();
  if (!snapshot.exists) {
    return {
      organizationId: input.organizationId,
      customerId: input.customerId,
      dataMode: input.dataMode,
      updatedAt: new Date(0).toISOString(),
      policyVersion: 1,
    };
  }
  const data = snapshot.data() as Partial<LifecycleCustomerPreferences>;
  if (data.organizationId !== input.organizationId || data.customerId !== input.customerId || data.dataMode !== input.dataMode) {
    throw new HttpsError("failed-precondition", "Lifecycle preferences are outside the requested customer scope.");
  }
  return {
    organizationId: input.organizationId,
    customerId: input.customerId,
    dataMode: input.dataMode,
    ...(typeof data.timezone === "string" ? { timezone: data.timezone } : {}),
    ...(data.quietHours && typeof data.quietHours === "object" ? { quietHours: data.quietHours } : {}),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date(0).toISOString(),
    policyVersion: Number.isInteger(data.policyVersion) ? Number(data.policyVersion) : 1,
  };
}

export async function setLifecycleCustomerPreferences(input: {
  organizationId: string;
  customerId: string;
  dataMode: AuthoritativeCustomerDataMode;
  timezone?: string;
  quietHours?: { startLocal: string; endLocal: string };
  idempotencyKey: string;
  principal: VerifiedCustomerPrincipal;
}): Promise<LifecycleCustomerPreferences> {
  assertId(input.organizationId, "Organization ID");
  assertId(input.customerId, "Customer ID");
  assertId(input.idempotencyKey, "Idempotency key");
  await getOrganizationCustomer(input.organizationId, input.customerId, input.dataMode, input.principal);
  if (input.timezone && !validTimeZone(input.timezone)) throw new HttpsError("invalid-argument", "Timezone is invalid.");
  if (!validQuietHours(input.quietHours)) throw new HttpsError("invalid-argument", "Quiet hours must use distinct HH:MM values.");

  const reference = preferenceRef(input.organizationId, input.customerId);
  const idempotencyRef = reference.collection("idempotency").doc(input.idempotencyKey);
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    const replay = await transaction.get(idempotencyRef);
    if (replay.exists) {
      const replayData = replay.data()?.result as LifecycleCustomerPreferences | undefined;
      if (replayData) return replayData;
    }
    const prior = existing.data() as Partial<LifecycleCustomerPreferences> | undefined;
    const next: LifecycleCustomerPreferences = {
      organizationId: input.organizationId,
      customerId: input.customerId,
      dataMode: input.dataMode,
      ...(input.timezone ? { timezone: input.timezone } : prior?.timezone ? { timezone: prior.timezone } : {}),
      ...(input.quietHours ? { quietHours: input.quietHours } : prior?.quietHours ? { quietHours: prior.quietHours } : {}),
      updatedAt: now,
      policyVersion: Math.max(1, Number(prior?.policyVersion ?? 0) + 1),
    };
    transaction.set(reference, next, { merge: false });
    transaction.create(idempotencyRef, { result: next, createdAt: now });
    return next;
  });
}
