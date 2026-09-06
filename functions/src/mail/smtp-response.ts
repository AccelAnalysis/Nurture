import type { MailSmtpObservation, MailSmtpReason } from "../../../shared/mail/contracts.js";

function enhancedStatus(raw: string) {
  return raw.match(/\b([245]\.[0-7]\.[0-9]{1,3})\b/)?.[1];
}

function reasonFor(code: number, enhanced: string | undefined, raw: string): MailSmtpReason {
  const lower = raw.toLowerCase();
  if (code >= 200 && code < 300) return "accepted";
  if (code >= 400 && code < 500) {
    if (enhanced?.startsWith("4.7.") || /rate|spam|reputation|policy|temporar(?:y|ily) blocked|throttl/.test(lower)) return "reputation-temporary";
    if (enhanced === "4.2.2" || /mailbox.*full|over quota|quota exceeded/.test(lower)) return "mailbox-temporary";
    return "destination-temporary";
  }
  if (code === 552 || enhanced === "5.3.4" || /message.*too large|size limit|exceeds.*size/.test(lower)) return "message-too-large";
  if (enhanced?.startsWith("5.1.") || /user unknown|recipient.*not found|no such user|unknown recipient/.test(lower)) return "recipient-permanent";
  if (enhanced === "5.2.2" || /mailbox.*full|over quota/.test(lower)) return "mailbox-permanent";
  if (enhanced?.startsWith("5.7.") || /spam|policy|blocked|prohibited/.test(lower)) {
    if (/spf|dkim|dmarc|authenticat/.test(lower)) return "authentication-permanent";
    return "policy-permanent";
  }
  return code >= 500 ? "unknown-permanent" : "unknown-temporary";
}

export function parseSmtpResponse(rawResponse: string): MailSmtpObservation {
  const raw = rawResponse.replace(/\r?\n/g, "\n").trim();
  const lines = raw.split("\n").filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  const match = last.match(/^(\d{3})(?:[ -]|$)/) ?? lines.map((line) => line.match(/^(\d{3})(?:[ -]|$)/)).find(Boolean);
  if (!match) throw new Error("SMTP response does not contain a three-digit status code.");
  const code = Number(match[1]);
  const enhanced = enhancedStatus(raw);
  const reason = reasonFor(code, enhanced, raw);
  return {
    code,
    ...(enhanced ? { enhancedStatusCode: enhanced } : {}),
    rawResponse: raw.slice(0, 2_000),
    reason,
    retryable: code >= 400 && code < 500,
    accepted: code >= 200 && code < 300,
  };
}

export function acceptanceUncertainObservation(rawResponse = "Connection lost after DATA; remote acceptance cannot be proven."): MailSmtpObservation {
  return {
    code: 0,
    rawResponse: rawResponse.slice(0, 2_000),
    reason: "acceptance-uncertain",
    retryable: false,
    accepted: false,
  };
}
