import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { onRequest } from "firebase-functions/v2/https";
import type { MessageDeliveryStatus } from "../../../shared/communications/contracts.js";
import { sendGridEventWebhookPublicKey } from "./config.js";
import { applyVerifiedProviderEvent, hashRecipientEmail } from "./store.js";

interface SendGridEvent {
  event?: unknown;
  email?: unknown;
  timestamp?: unknown;
  sg_event_id?: unknown;
  sg_message_id?: unknown;
}

export interface MappedSendGridEvent {
  nextStatus?: MessageDeliveryStatus;
  statusReason?: string;
  suppressGlobally: boolean;
}

export function verifySendGridEventWebhookSignature(input: {
  publicKeyBase64: string;
  signatureBase64: string;
  timestamp: string;
  rawBody: Buffer;
}) {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(input.publicKeyBase64, "base64"),
      format: "der",
      type: "spki",
    });
    const signed = Buffer.concat([Buffer.from(input.timestamp, "utf8"), input.rawBody]);
    return verifySignature("sha256", signed, publicKey, Buffer.from(input.signatureBase64, "base64"));
  } catch {
    return false;
  }
}

export function mapSendGridEvent(eventType: string): MappedSendGridEvent {
  switch (eventType) {
    case "delivered": return { nextStatus: "delivered", statusReason: "sendgrid-delivered", suppressGlobally: false };
    case "deferred": return { nextStatus: "deferred", statusReason: "sendgrid-deferred", suppressGlobally: false };
    case "bounce": return { nextStatus: "bounced", statusReason: "sendgrid-bounce", suppressGlobally: true };
    case "dropped": return { nextStatus: "dropped", statusReason: "sendgrid-dropped", suppressGlobally: false };
    case "spamreport": return { nextStatus: "complained", statusReason: "sendgrid-spam-complaint", suppressGlobally: true };
    case "unsubscribe":
    case "group_unsubscribe": return { nextStatus: "unsubscribed", statusReason: "sendgrid-unsubscribe", suppressGlobally: true };
    default: return { suppressGlobally: false };
  }
}

function providerEventId(event: SendGridEvent, providerMessageId: string, index: number) {
  if (typeof event.sg_event_id === "string" && event.sg_event_id.trim()) return event.sg_event_id.trim();
  const stable = `${providerMessageId}:${String(event.event)}:${String(event.timestamp)}:${index}`;
  return createHash("sha256").update(stable).digest("hex");
}

function occurredAt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1_000).toISOString();
  if (typeof value === "string" && /^\d+$/.test(value)) return new Date(Number(value) * 1_000).toISOString();
  return new Date().toISOString();
}

export const sendGridEventWebhook = onRequest(async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).send("Method not allowed");
    return;
  }
  const publicKey = sendGridEventWebhookPublicKey.value().trim();
  const signature = request.header("x-twilio-email-event-webhook-signature") ?? "";
  const timestamp = request.header("x-twilio-email-event-webhook-timestamp") ?? "";
  if (!publicKey || !signature || !timestamp || !verifySendGridEventWebhookSignature({
    publicKeyBase64: publicKey,
    signatureBase64: signature,
    timestamp,
    rawBody: request.rawBody,
  })) {
    response.status(403).send("Invalid webhook signature");
    return;
  }

  let events: SendGridEvent[];
  try {
    const parsed = JSON.parse(request.rawBody.toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length > 1_000) throw new Error("Invalid event batch.");
    events = parsed as SendGridEvent[];
  } catch {
    response.status(400).send("Invalid event payload");
    return;
  }

  let applied = 0;
  let unmatched = 0;
  let rejected = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (typeof event.event !== "string" || typeof event.sg_message_id !== "string" || !event.sg_message_id.trim()) {
      rejected += 1;
      continue;
    }
    const mapping = mapSendGridEvent(event.event);
    const result = await applyVerifiedProviderEvent({
      providerEventId: providerEventId(event, event.sg_message_id, index),
      providerMessageId: event.sg_message_id,
      eventType: event.event,
      occurredAt: occurredAt(event.timestamp),
      ...(typeof event.email === "string" && event.email.trim() ? { recipientHash: hashRecipientEmail(event.email) } : {}),
      ...(mapping.nextStatus ? { nextStatus: mapping.nextStatus } : {}),
      ...(mapping.statusReason ? { statusReason: mapping.statusReason } : {}),
      suppressGlobally: mapping.suppressGlobally,
    });
    if (result.state === "applied" || result.state === "duplicate") applied += 1;
    else if (result.state === "unmatched") unmatched += 1;
    else rejected += 1;
  }
  response.status(200).json({ accepted: true, applied, unmatched, rejected });
});
