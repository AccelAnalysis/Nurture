import { createHash } from "node:crypto";
import { onRequest } from "firebase-functions/v2/https";
import { getOrganizationInboundEmail, recordInboundCommunication } from "./branded-store.js";
import { normalizeDomain } from "./branded-types.js";
import { verifySendGridEventWebhookSignature } from "./webhook.js";

export function parseMultipartTextFields(rawBody: Buffer, contentType: string) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!boundaryMatch) throw new Error("Multipart boundary is missing.");
  const boundary = boundaryMatch[1] ?? boundaryMatch[2];
  if (!boundary) throw new Error("Multipart boundary is invalid.");
  const binary = rawBody.toString("latin1");
  const delimiter = `--${boundary}`;
  const fields: Record<string, string> = {};
  for (const rawPart of binary.split(delimiter)) {
    if (!rawPart || rawPart === "--\r\n" || rawPart === "--") continue;
    const part = rawPart.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const split = part.indexOf("\r\n\r\n");
    if (split < 0) continue;
    const headerText = part.slice(0, split);
    const disposition = headerText.split("\r\n").find((line) => /^content-disposition:/i.test(line));
    if (!disposition || /filename=/i.test(disposition)) continue;
    const nameMatch = /name="([^"]+)"/i.exec(disposition);
    const name = nameMatch?.[1];
    if (!name) continue;
    const bodyBinary = part.slice(split + 4).replace(/\r\n--$/, "").replace(/\r\n$/, "");
    fields[name] = Buffer.from(bodyBinary, "latin1").toString("utf8");
  }
  return fields;
}

function emailAddress(value: string | undefined) {
  if (!value) return undefined;
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(value);
  const plain = /([^\s<>,;]+@[^\s<>,;]+)/.exec(value);
  const candidate = (angle?.[1] ?? plain?.[1] ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(candidate) ? candidate : undefined;
}

function envelopeRecipient(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as { to?: unknown };
    const first = Array.isArray(parsed.to) ? parsed.to.find((item) => typeof item === "string") : undefined;
    return typeof first === "string" ? emailAddress(first) : undefined;
  } catch {
    return undefined;
  }
}

function safeBody(fields: Record<string, string>) {
  const text = fields.text?.trim();
  if (text) return text.slice(0, 100_000);
  const rawEmail = fields.email ?? "";
  const split = rawEmail.search(/\r?\n\r?\n/);
  return (split >= 0 ? rawEmail.slice(split).trim() : rawEmail.trim()).slice(0, 100_000);
}

export const sendGridInboundEmail = onRequest(async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).send("Method not allowed");
    return;
  }
  const organizationId = typeof request.query.organizationId === "string" ? request.query.organizationId.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(organizationId)) {
    response.status(400).send("Invalid organization route");
    return;
  }
  const inbound = await getOrganizationInboundEmail(organizationId);
  if (!inbound || inbound.status !== "ready" || !inbound.providerPublicKey) {
    response.status(404).send("Inbound email route is not ready");
    return;
  }
  const signature = request.header("x-twilio-email-event-webhook-signature") ?? "";
  const timestamp = request.header("x-twilio-email-event-webhook-timestamp") ?? "";
  if (!signature || !timestamp || !verifySendGridEventWebhookSignature({
    publicKeyBase64: inbound.providerPublicKey,
    signatureBase64: signature,
    timestamp,
    rawBody: request.rawBody,
  })) {
    response.status(403).send("Invalid webhook signature");
    return;
  }

  try {
    const contentType = request.header("content-type") ?? "";
    const fields = parseMultipartTextFields(request.rawBody, contentType);
    const from = emailAddress(fields.from);
    const to = envelopeRecipient(fields.envelope) ?? emailAddress(fields.to);
    if (!from || !to) throw new Error("Sender or recipient is missing.");
    const recipientDomain = normalizeDomain(to.split("@")[1] ?? "");
    if (recipientDomain !== inbound.hostname) {
      response.status(403).send("Inbound recipient is outside the configured organization hostname");
      return;
    }
    const providerMessageId = createHash("sha256").update(request.rawBody).digest("hex");
    await recordInboundCommunication({
      organizationId,
      channel: "email",
      senderIdentity: from,
      recipientIdentity: to,
      providerMessageId,
      body: safeBody(fields),
      receivedAt: new Date().toISOString(),
      provider: "sendgrid",
      ...(fields.subject?.trim() ? { subject: fields.subject.trim().slice(0, 998) } : {}),
    });
    response.status(200).send("OK");
  } catch {
    response.status(400).send("Invalid inbound email payload");
  }
});
