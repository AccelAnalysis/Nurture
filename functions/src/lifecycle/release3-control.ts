import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertOrganizationCapability } from "../billing/store.js";
import { db } from "../firebase.js";

function objectData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request data must be an object.");
  return value as Record<string, unknown>;
}
function requiredId(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(value)) throw new HttpsError("invalid-argument", `${label} is invalid.`);
  return value;
}

/**
 * Release 3 may pause/unpause evaluation and opt in to in-app presentation, but it
 * cannot enable outbound lifecycle email. Email intents remain held until a later
 * release has explicit campaign approval and provider composition.
 */
export const r3SetLifecycleRuntimeControl = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
  const data = objectData(request.data);
  const organizationId = requiredId(data.organizationId, "organizationId");
  await assertOrganizationCapability(organizationId, request.auth.uid, "lifecycle.manage");
  if (typeof data.paused !== "boolean") throw new HttpsError("invalid-argument", "paused must be boolean.");
  if (data.emailEnabled === true) throw new HttpsError("failed-precondition", "Outbound lifecycle email is not approved for Release 3.");
  if (data.inAppEnabled !== undefined && typeof data.inAppEnabled !== "boolean") throw new HttpsError("invalid-argument", "inAppEnabled must be boolean.");

  const reference = db.collection("organizations").doc(organizationId).collection("release3RuntimeControl").doc("global");
  const prior = await reference.get();
  const now = new Date().toISOString();
  const next = {
    paused: data.paused,
    emailEnabled: false,
    inAppEnabled: data.inAppEnabled === true,
    policyVersion: Number(prior.data()?.policyVersion ?? 0) + 1,
    updatedAt: now,
    updatedBy: request.auth.uid,
  };
  await reference.set(next, { merge: false });
  return next;
});
