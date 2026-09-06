import type { MailSmtpReason } from "../../../shared/mail/contracts.js";

export interface ParsedDeliveryStatusNotification {
  finalRecipient?: string;
  originalRecipient?: string;
  action?: "failed" | "delayed" | "delivered" | "relayed" | "expanded";
  status?: string;
  diagnosticCode?: string;
  remoteMta?: string;
  lastAttemptDate?: string;
  reason: MailSmtpReason;
}

function field(raw: string, name: string) {
  const match = raw.match(new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t].+)*)$`, "im"));
  return match?.[1]?.replace(/\r?\n[ \t]+/g, " ").trim();
}

function stripAddressField(value: string | undefined) {
  if (!value) return undefined;
  const separator = value.indexOf(";");
  return (separator >= 0 ? value.slice(separator + 1) : value).trim();
}

function classify(status: string | undefined, action: string | undefined, diagnostic: string | undefined): MailSmtpReason {
  const text = `${status ?? ""} ${diagnostic ?? ""}`.toLowerCase();
  if (action === "delayed" || status?.startsWith("4.")) {
    if (status?.startsWith("4.7.") || /spam|policy|rate|reputation|throttl/.test(text)) return "reputation-temporary";
    if (status === "4.2.2" || /quota|mailbox.*full/.test(text)) return "mailbox-temporary";
    return "destination-temporary";
  }
  if (status?.startsWith("5.1.")) return "recipient-permanent";
  if (status === "5.2.2") return "mailbox-permanent";
  if (status?.startsWith("5.7.")) return /spf|dkim|dmarc|auth/.test(text) ? "authentication-permanent" : "policy-permanent";
  if (action === "failed" || status?.startsWith("5.")) return "unknown-permanent";
  return action === "delivered" || action === "relayed" ? "accepted" : "unknown-temporary";
}

export function parseDeliveryStatusNotification(raw: string): ParsedDeliveryStatusNotification {
  const actionRaw = field(raw, "Action")?.toLowerCase();
  const action = actionRaw && ["failed", "delayed", "delivered", "relayed", "expanded"].includes(actionRaw)
    ? actionRaw as ParsedDeliveryStatusNotification["action"]
    : undefined;
  const status = field(raw, "Status");
  const diagnosticCode = field(raw, "Diagnostic-Code");
  return {
    ...(stripAddressField(field(raw, "Final-Recipient")) ? { finalRecipient: stripAddressField(field(raw, "Final-Recipient")) } : {}),
    ...(stripAddressField(field(raw, "Original-Recipient")) ? { originalRecipient: stripAddressField(field(raw, "Original-Recipient")) } : {}),
    ...(action ? { action } : {}),
    ...(status ? { status } : {}),
    ...(diagnosticCode ? { diagnosticCode } : {}),
    ...(field(raw, "Remote-MTA") ? { remoteMta: field(raw, "Remote-MTA") } : {}),
    ...(field(raw, "Last-Attempt-Date") ? { lastAttemptDate: field(raw, "Last-Attempt-Date") } : {}),
    reason: classify(status, action, diagnosticCode),
  };
}
