import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "../firebase.js";
import { assertOrganizationCapability } from "../billing/store.js";
import { twilioAccountSid, twilioAuthToken } from "./config.js";
import { getOrganizationSmsSender, saveOrganizationSmsSender } from "./branded-store.js";
import { normalizeCountryCode } from "./branded-types.js";
import { provisionTwilioSmsNumber } from "./twilio-provisioning.js";

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request data must be an object.");
  return value as Record<string, unknown>;
}

function organizationId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new HttpsError("invalid-argument", "organizationId is invalid.");
  return value;
}

function shortText(value: unknown, field: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new HttpsError("invalid-argument", `${field} is invalid.`);
  return value.trim();
}

async function organizationDisplayName(id: string) {
  const snapshot = await db.collection("organizations").doc(id).get();
  const name = snapshot.data()?.name;
  return typeof name === "string" && name.trim() ? name.trim() : id;
}

/**
 * Billable provisioning boundary. This replaces the earlier directly-exported
 * callable name at the Functions root. Existing provisioned resources are
 * returned idempotently; a new Twilio number cannot be purchased without the
 * caller explicitly acknowledging the purchase side effect.
 */
export const provisionOrganizationSmsNumberConfirmed = onCall({ secrets: [twilioAccountSid, twilioAuthToken] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to continue.");
  const data = record(request.data);
  const orgId = organizationId(data.organizationId);
  await assertOrganizationCapability(orgId, request.auth.uid, "communications.manage");

  const existing = await getOrganizationSmsSender(orgId);
  if (existing?.phoneNumber && existing.messagingServiceSid && existing.status !== "blocked") {
    return { sender: existing, reused: true, purchased: false };
  }
  if (data.confirmPurchase !== true) {
    throw new HttpsError("failed-precondition", "Explicit confirmPurchase=true is required before Nurture can purchase a billable SMS phone number.");
  }

  const countryCode = normalizeCountryCode(shortText(data.countryCode, "countryCode", 2));
  const areaCode = data.areaCode === undefined || data.areaCode === null || data.areaCode === ""
    ? undefined
    : shortText(data.areaCode, "areaCode", 6);
  const sender = await provisionTwilioSmsNumber({
    organizationId: orgId,
    organizationName: await organizationDisplayName(orgId),
    countryCode,
    ...(areaCode ? { areaCode } : {}),
  });
  return { sender: await saveOrganizationSmsSender(sender, request.auth.uid), reused: false, purchased: true };
});
