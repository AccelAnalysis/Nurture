import { domainToASCII } from "node:url";

function rejectHeaderInjection(value: string, label: string) {
  if (/\r|\n/.test(value)) throw new Error(`${label} contains an invalid line break.`);
}

export interface NormalizedMailbox {
  address: string;
  localPart: string;
  domain: string;
}

export function normalizeMailbox(address: string): NormalizedMailbox {
  rejectHeaderInjection(address, "Mailbox");
  const value = address.trim();
  const separator = value.lastIndexOf("@");
  if (separator <= 0 || separator === value.length - 1) throw new Error("Mailbox address is invalid.");
  const localPart = value.slice(0, separator);
  const rawDomain = value.slice(separator + 1).replace(/\.$/, "").toLowerCase();
  const domain = domainToASCII(rawDomain);
  if (!domain || domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)) {
    throw new Error("Mailbox domain is invalid.");
  }
  const dotAtom = /^[A-Za-z0-9!#$%&\'*+/=?^_`{|}~.-]+$/;
  if (localPart.length > 64 || value.length > 320 || !dotAtom.test(localPart) || localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..")) {
    throw new Error("Mailbox local part is unsupported or invalid. SMTPUTF8 is not enabled in this worker generation.");
  }
  return { address: `${localPart}@${domain}`, localPart, domain };
}

export function normalizeHeaderText(value: string, label: string) {
  rejectHeaderInjection(value, label);
  return value.trim();
}

export function formatMailboxHeader(address: string, name?: string) {
  const normalized = normalizeMailbox(address).address;
  if (!name?.trim()) return normalized;
  const rawName = normalizeHeaderText(name, "Mailbox display name");
  if (!/^[\x20-\x7e]*$/.test(rawName)) return `=?UTF-8?B?${Buffer.from(rawName, "utf8").toString("base64")}?= <${normalized}>`;
  const safeName = rawName.replace(/(["\\])/g, "\\$1");
  return `"${safeName}" <${normalized}>`;
}
