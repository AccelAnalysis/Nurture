import { createHash, randomUUID } from "node:crypto";
import type { MailPurpose, MailboxAddress } from "../../../shared/mail/contracts.js";
import { NURTURE_MAIL_SCHEMA_VERSION } from "../../../shared/mail/contracts.js";
import { formatMailboxHeader, normalizeHeaderText, normalizeMailbox } from "./address.js";

export interface MailAttachmentInput {
  fileName: string;
  contentType: string;
  content: Uint8Array;
  contentId?: string;
  disposition?: "attachment" | "inline";
}

export interface CompileInternetMessageInput {
  organizationId: string;
  communicationMessageId?: string;
  purpose: MailPurpose;
  from: MailboxAddress;
  replyTo?: MailboxAddress;
  to: MailboxAddress;
  subject: string;
  text: string;
  html: string;
  date?: Date;
  messageIdHeader?: string;
  messageIdDomain?: string;
  listUnsubscribeUrl?: string;
  attachments?: readonly MailAttachmentInput[];
  additionalHeaders?: Readonly<Record<string, string>>;
}

export interface CompiledInternetMessage {
  schemaVersion: typeof NURTURE_MAIL_SCHEMA_VERSION;
  messageId: string;
  organizationId: string;
  communicationMessageId?: string;
  purpose: MailPurpose;
  from: MailboxAddress;
  replyTo?: MailboxAddress;
  to: MailboxAddress;
  subject: string;
  messageIdHeader: string;
  rfc822: Uint8Array;
  sha256: string;
  byteLength: number;
  createdAt: string;
}

const CRLF = "\r\n";

function base64Lines(bytes: Uint8Array) {
  const encoded = Buffer.from(bytes).toString("base64");
  const lines: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += 76) lines.push(encoded.slice(offset, offset + 76));
  return lines.join(CRLF);
}

function utf8Base64(value: string) {
  return base64Lines(Buffer.from(value, "utf8"));
}

function encodedWord(value: string) {
  const safe = normalizeHeaderText(value, "Header value");
  if (/^[\x20-\x7e]*$/.test(safe)) return safe;
  return `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`;
}

function safeHeaderName(value: string) {
  if (!/^[A-Za-z0-9-]+$/.test(value)) throw new Error(`Invalid header name: ${value}`);
  return value;
}

function makeBoundary(seed: string, kind: string) {
  const suffix = createHash("sha256").update(`${seed}:${kind}`).digest("hex").slice(0, 32);
  return `nurture-${kind}-${suffix}`;
}

function attachmentPart(attachment: MailAttachmentInput) {
  const fileName = normalizeHeaderText(attachment.fileName, "Attachment filename");
  const contentType = normalizeHeaderText(attachment.contentType, "Attachment content type");
  if (!/^[\w.+-]+\/[\w.+-]+(?:\s*;.*)?$/.test(contentType)) throw new Error("Attachment content type is invalid.");
  const disposition = attachment.disposition ?? "attachment";
  const lines = [
    `Content-Type: ${contentType}; name="${fileName.replace(/(["\\])/g, "\\$1")}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: ${disposition}; filename="${fileName.replace(/(["\\])/g, "\\$1")}"`,
  ];
  if (attachment.contentId) {
    const contentId = normalizeHeaderText(attachment.contentId, "Attachment content id");
    lines.push(`Content-ID: <${contentId.replace(/[<>]/g, "")}>`);
  }
  return `${lines.join(CRLF)}${CRLF}${CRLF}${base64Lines(attachment.content)}`;
}

function alternativeBody(text: string, html: string, boundary: string) {
  return [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    utf8Base64(text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    utf8Base64(html),
    `--${boundary}--`,
  ].join(CRLF);
}

export function compileInternetMessage(input: CompileInternetMessageInput): CompiledInternetMessage {
  const now = input.date ?? new Date();
  const createdAt = now.toISOString();
  const fromAddress = normalizeMailbox(input.from.address).address;
  const toAddress = normalizeMailbox(input.to.address).address;
  const replyTo = input.replyTo ? normalizeMailbox(input.replyTo.address).address : undefined;
  const subject = normalizeHeaderText(input.subject, "Subject");
  const messageIdDomain = input.messageIdDomain ? normalizeMailbox(`noreply@${input.messageIdDomain}`).domain : "mail.nurture.invalid";
  const rawId = input.messageIdHeader ?? `<${randomUUID()}@${messageIdDomain}>`;
  const messageIdHeader = normalizeHeaderText(rawId, "Message-ID");
  if (!/^<[^<>\s@]+@[^<>\s@]+>$/.test(messageIdHeader)) throw new Error("Message-ID is invalid.");

  const seed = createHash("sha256").update(`${input.organizationId}:${messageIdHeader}`).digest("hex");
  const altBoundary = makeBoundary(seed, "alt");
  const attachments = input.attachments ?? [];
  const mixedBoundary = attachments.length ? makeBoundary(seed, "mixed") : undefined;

  const headers: string[] = [
    `Date: ${now.toUTCString()}`,
    `From: ${formatMailboxHeader(fromAddress, input.from.name)}`,
    `To: ${formatMailboxHeader(toAddress, input.to.name)}`,
    `Subject: ${encodedWord(subject)}`,
    `Message-ID: ${messageIdHeader}`,
    "MIME-Version: 1.0",
  ];
  if (replyTo) headers.splice(3, 0, `Reply-To: ${formatMailboxHeader(replyTo, input.replyTo?.name)}`);

  if (input.listUnsubscribeUrl) {
    const unsubscribe = normalizeHeaderText(input.listUnsubscribeUrl, "List-Unsubscribe URL");
    if (!/^https:\/\//i.test(unsubscribe)) throw new Error("One-click unsubscribe URL must use HTTPS.");
    headers.push(`List-Unsubscribe: <${unsubscribe}>`);
    headers.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  } else if (input.purpose === "marketing") {
    throw new Error("Marketing mail requires a one-click List-Unsubscribe URL.");
  }

  for (const [name, value] of Object.entries(input.additionalHeaders ?? {})) {
    const normalizedName = safeHeaderName(name);
    const lower = normalizedName.toLowerCase();
    if (["from", "to", "reply-to", "subject", "message-id", "date", "mime-version", "content-type", "dkim-signature"].includes(lower)) {
      throw new Error(`Protected header cannot be overridden: ${normalizedName}`);
    }
    headers.push(`${normalizedName}: ${normalizeHeaderText(value, normalizedName)}`);
  }

  let body: string;
  if (!mixedBoundary) {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    body = alternativeBody(input.text, input.html, altBoundary);
  } else {
    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    const parts = [
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      alternativeBody(input.text, input.html, altBoundary),
    ];
    for (const attachment of attachments) {
      parts.push(`--${mixedBoundary}`);
      parts.push(attachmentPart(attachment));
    }
    parts.push(`--${mixedBoundary}--`);
    body = parts.join(CRLF);
  }

  const raw = `${headers.join(CRLF)}${CRLF}${CRLF}${body}${CRLF}`;
  const rfc822 = Buffer.from(raw, "utf8");
  return {
    schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
    messageId: randomUUID(),
    organizationId: input.organizationId,
    ...(input.communicationMessageId ? { communicationMessageId: input.communicationMessageId } : {}),
    purpose: input.purpose,
    from: { address: fromAddress, ...(input.from.name ? { name: input.from.name } : {}) },
    ...(replyTo ? { replyTo: { address: replyTo, ...(input.replyTo?.name ? { name: input.replyTo.name } : {}) } } : {}),
    to: { address: toAddress, ...(input.to.name ? { name: input.to.name } : {}) },
    subject,
    messageIdHeader,
    rfc822,
    sha256: createHash("sha256").update(rfc822).digest("hex"),
    byteLength: rfc822.byteLength,
    createdAt,
  };
}
