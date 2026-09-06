import { createHmac, timingSafeEqual } from "node:crypto";
import { onRequest } from "firebase-functions/v2/https";
import { db } from "../firebase.js";
import { getCommunicationWebhookBaseUrl, twilioAuthToken } from "./config.js";
import { classifySmsComplianceKeyword, normalizeE164 } from "./branded-types.js";
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

function required(value: string | undefined, field: string) {
  if (!value?.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function organizationIdFromQuery(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : undefined;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function responseIdentity(organizationId: string) {
  const [organization, sender] = await Promise.all([
    db.collection("organizations").doc(organizationId).get(),
    db.collection("organizations").doc(organizationId).collection("communicationSettings").doc("emailSender").get(),
  ]);
  const name = typeof organization.data()?.name === "string" && organization.data()!.name.trim() ? organization.data()!.name.trim() : "This organization";
  const supportEmail = typeof sender.data()?.replyTo === "string" ? sender.data()!.replyTo : typeof sender.data()?.fromAddress === "string" ? sender.data()!.fromAddress : undefined;
  return { name, supportEmail };
}

function twiml(message?: string) {
  const body = message ? `<Message>${escapeXml(message)}</Message>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
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
    const complianceKeyword = classifySmsComplianceKeyword(body);
    const now = new Date().toISOString();
    const recipientHash = hashPhoneNumber(from);
    if (complianceKeyword === "STOP") {
      await setSmsCarrierPreference({ organizationId: route.organizationId, recipientHash, carrierOptOut: true, source: "STOP", updatedAt: now });
    } else if (complianceKeyword === "START") {
      // START restores only transport eligibility. It never manufactures marketing/service consent.
      await setSmsCarrierPreference({ organizationId: route.organizationId, recipientHash, carrierOptOut: false, source: "START", updatedAt: now });
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

    const identity = await responseIdentity(route.organizationId);
    let reply: string | undefined;
    if (complianceKeyword === "STOP") reply = `${identity.name}: You are unsubscribed from SMS. Reply START to resume transport where permitted.`;
    else if (complianceKeyword === "START") reply = `${identity.name}: SMS transport is enabled again. Your communication consent settings still apply.`;
    else if (complianceKeyword === "HELP") reply = `${identity.name}: Reply STOP to opt out.${identity.supportEmail ? ` Support: ${identity.supportEmail}.` : " Contact the organization for support."}`;
    response.status(200).type("text/xml").send(twiml(reply));
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
