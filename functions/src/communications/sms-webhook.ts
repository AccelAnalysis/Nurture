import { createHmac, timingSafeEqual } from "node:crypto";
import { onRequest } from "firebase-functions/v2/https";
import { db } from "../firebase.js";
import { getCommunicationWebhookBaseUrl, twilioAuthToken } from "./config.js";
import { classifySmsComplianceKeyword, normalizeE164, type SmsComplianceKeyword } from "./branded-types.js";
import {
  hashPhoneNumber,
  recordInboundCommunication,
  resolveSmsInboundOrganization,
  setSmsCarrierPreference,
} from "./branded-store.js";

function formValues(request: { body?: unknown; rawBody: Buffer }) {
  const result: Record<string, string> = {};
  if (request.body && typeof request.body === "object" && !Array.isArray(request.body)) {
    for (const [key, value] of Object.entries(request.body as Record<string, unknown>)) {
      if (typeof value === "string") result[key] = value;
      else if (typeof value === "number" || typeof value === "boolean") result[key] = String(value);
    }
    if (Object.keys(result).length) return result;
  }
  for (const [key, value] of new URLSearchParams(request.rawBody.toString("utf8"))) result[key] = value;
  return result;
}

export function twilioSignaturePayload(url: string, params: Record<string, string>) {
  return `${url}${Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("")}`;
}

export function verifyTwilioWebhookSignature(input: { authToken: string; signature: string; url: string; params: Record<string, string> }) {
  if (!input.authToken || !input.signature) return false;
  const expected = createHmac("sha1", input.authToken).update(twilioSignaturePayload(input.url, input.params), "utf8").digest("base64");
  const actualBytes = Buffer.from(input.signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function twilioOptOutType(value: string | undefined): SmsComplianceKeyword | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized === "STOP" || normalized === "START" || normalized === "HELP" ? normalized : undefined;
}

function required(value: string | undefined, field: string) {
  if (!value?.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function organizationIdFromQuery(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : undefined;
}

function emptyTwiml() {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}

export const twilioInboundSms = onRequest({ secrets: [twilioAuthToken] }, async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).send("Method not allowed");
    return;
  }
  const params = formValues(request);
  const signature = request.header("x-twilio-signature") ?? "";
  const url = `${getCommunicationWebhookBaseUrl()}/twilioInboundSms`;
  if (!verifyTwilioWebhookSignature({ authToken: twilioAuthToken.value(), signature, url, params })) {
    response.status(403).send("Invalid webhook signature");
    return;
  }

  try {
    const messageSid = required(params.MessageSid ?? params.SmsMessageSid, "MessageSid");
    const from = normalizeE164(required(params.From, "From"));
    const to = normalizeE164(required(params.To, "To"));
    const body = (params.Body ?? "").slice(0, 10_000);
    const messagingServiceSid = params.MessagingServiceSid?.trim() || undefined;
    const route = await resolveSmsInboundOrganization({ to, ...(messagingServiceSid ? { messagingServiceSid } : {}) });
    if (!route) {
      response.status(404).send("SMS route not found");
      return;
    }

    // With Advanced Opt-Out, Twilio sets OptOutType after it has already matched
    // the keyword, updated its block list and sent the configured confirmation.
    // Without it, exact reserved-keyword classification mirrors Twilio's default
    // handling so Nurture can keep a local transport suppression when the inbound
    // webhook is delivered. Neither path sends a second compliance reply.
    const providerOptOutType = twilioOptOutType(params.OptOutType);
    const complianceKeyword = providerOptOutType ?? classifySmsComplianceKeyword(body);
    const now = new Date().toISOString();
    const recipientHash = hashPhoneNumber(from);
    if (complianceKeyword === "STOP") {
      await setSmsCarrierPreference({ organizationId: route.organizationId, recipientHash, carrierOptOut: true, source: providerOptOutType ? "provider" : "STOP", updatedAt: now });
    } else if (complianceKeyword === "START") {
      // START restores only transport eligibility. It never manufactures marketing/service consent.
      await setSmsCarrierPreference({ organizationId: route.organizationId, recipientHash, carrierOptOut: false, source: providerOptOutType ? "provider" : "START", updatedAt: now });
    }
    await recordInboundCommunication({
      organizationId: route.organizationId,
      channel: "sms",
      senderIdentity: from,
      recipientIdentity: to,
      providerMessageId: messageSid,
      body,
      receivedAt: now,
      provider: "twilio",
      complianceKeyword,
    });

    response.status(200).type("text/xml").send(emptyTwiml());
  } catch {
    response.status(400).send("Invalid SMS payload");
  }
});

export const twilioMessageStatus = onRequest({ secrets: [twilioAuthToken] }, async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).send("Method not allowed");
    return;
  }
  const organizationId = organizationIdFromQuery(request.query.organizationId);
  if (!organizationId) {
    response.status(400).send("Missing organization route");
    return;
  }
  const params = formValues(request);
  const signature = request.header("x-twilio-signature") ?? "";
  const url = `${getCommunicationWebhookBaseUrl()}/twilioMessageStatus?organizationId=${encodeURIComponent(organizationId)}`;
  if (!verifyTwilioWebhookSignature({ authToken: twilioAuthToken.value(), signature, url, params })) {
    response.status(403).send("Invalid webhook signature");
    return;
  }
  const messageSid = params.MessageSid?.trim() ?? params.SmsSid?.trim();
  if (!messageSid || !/^SM[0-9a-fA-F]{32}$/.test(messageSid)) {
    response.status(400).send("Invalid status payload");
    return;
  }

  // The organization is bound into the signed callback URL. Provider payload
  // fields are deliberately not used as tenant authority because Twilio may add
  // or omit status parameters over time.
  const destination = params.To?.trim();
  let recipientHash: string | undefined;
  if (destination) {
    try { recipientHash = hashPhoneNumber(destination); } catch { recipientHash = undefined; }
  }
  await db.collection("organizations").doc(organizationId).collection("communicationProviderStatus").doc(`twilio-${messageSid}`).set({
    provider: "twilio",
    providerMessageId: messageSid,
    status: typeof params.MessageStatus === "string" ? params.MessageStatus : typeof params.SmsStatus === "string" ? params.SmsStatus : "unknown",
    errorCode: params.ErrorCode || null,
    errorMessage: params.ErrorMessage || null,
    ...(recipientHash ? { recipientHash } : {}),
    observedAt: new Date().toISOString(),
  }, { merge: true });
  response.status(200).send("OK");
});
