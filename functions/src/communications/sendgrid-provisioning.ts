import { resolveMx } from "node:dns/promises";
import { getCommunicationWebhookBaseUrl, sendGridApiKey } from "./config.js";
import {
  composeSubdomain,
  normalizeDomain,
  normalizeDomainLabel,
  type DnsRecordRequirement,
  type OrganizationEmailDomain,
  type OrganizationInboundEmail,
  type OrganizationLinkDomain,
} from "./branded-types.js";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function sendGridRequest(path: string, init: RequestInit) {
  const key = sendGridApiKey.value();
  if (!key.startsWith("SG.")) throw new Error("SENDGRID_API_KEY is not configured.");
  const response = await fetch(`https://api.sendgrid.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 500) }; }
  }
  if (!response.ok) {
    const record = object(data);
    const errors = Array.isArray(record.errors) ? record.errors : [];
    const providerMessage = errors.map((item) => object(item).message).find((item) => typeof item === "string");
    throw new Error(typeof providerMessage === "string" ? `SendGrid: ${providerMessage}` : `SendGrid request failed (${response.status}).`);
  }
  return object(data);
}

function dnsRecords(value: unknown): DnsRecordRequirement[] {
  const result: DnsRecordRequirement[] = [];
  const seen = new Set<string>();
  const visit = (current: unknown) => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    const record = current as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type.toUpperCase() : "";
    const host = typeof record.host === "string" ? record.host : "";
    const value = typeof record.data === "string" ? record.data : typeof record.value === "string" ? record.value : "";
    if ((type === "CNAME" || type === "TXT" || type === "MX") && host && value) {
      const key = `${type}:${host}:${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ type, host, value, valid: record.valid === true } as DnsRecordRequirement);
      }
    }
    for (const child of Object.values(record)) if (child && typeof child === "object") visit(child);
  };
  visit(value);
  return result;
}

function requireEmailAtDomain(address: string, domain: string) {
  const normalized = address.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(normalized) || normalized.split("@")[1] !== domain) throw new Error(`From address must use ${domain}.`);
  return normalized;
}

function optionalEmail(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(normalized) || normalized.length > 320) throw new Error("Reply-To email is invalid.");
  return normalized;
}

export async function provisionSendGridEmailDomain(input: {
  organizationId: string;
  rootDomain: string;
  subdomain: string;
  fromAddress: string;
  fromName: string;
  replyTo?: string;
}): Promise<OrganizationEmailDomain> {
  const rootDomain = normalizeDomain(input.rootDomain);
  const subdomain = normalizeDomainLabel(input.subdomain);
  const domain = composeSubdomain(rootDomain, subdomain);
  const fromAddress = requireEmailAtDomain(input.fromAddress, domain);
  const fromName = input.fromName.trim();
  if (!fromName || fromName.length > 128) throw new Error("From name is required and must be 128 characters or fewer.");
  const replyTo = optionalEmail(input.replyTo);
  const response = await sendGridRequest("/v3/whitelabel/domains", {
    method: "POST",
    body: JSON.stringify({ domain: rootDomain, subdomain, automatic_security: true, default: false }),
  });
  const id = response.id;
  if (typeof id !== "number" && typeof id !== "string") throw new Error("SendGrid did not return a domain authentication identifier.");
  const at = new Date().toISOString();
  return {
    organizationId: input.organizationId,
    provider: "sendgrid",
    rootDomain,
    subdomain,
    domain,
    fromAddress,
    fromName,
    ...(replyTo ? { replyTo } : {}),
    authenticatedDomain: domain,
    providerDomainId: String(id),
    status: response.valid === true ? "ready" : "pending",
    dnsRecords: dnsRecords(response.dns),
    ...(response.valid === true ? { verifiedAt: at } : {}),
    updatedAt: at,
  };
}

export async function validateSendGridEmailDomain(current: OrganizationEmailDomain): Promise<OrganizationEmailDomain> {
  if (!current.providerDomainId) throw new Error("Organization domain has no SendGrid authentication identifier.");
  const response = await sendGridRequest(`/v3/whitelabel/domains/${encodeURIComponent(current.providerDomainId)}/validate`, { method: "POST" });
  const valid = response.valid === true;
  const at = new Date().toISOString();
  const validationRecords = dnsRecords(response.validation_results);
  return {
    ...current,
    status: valid ? "ready" : "pending",
    dnsRecords: validationRecords.length ? validationRecords : current.dnsRecords.map((record) => ({ ...record, valid: valid || record.valid })),
    ...(valid ? { verifiedAt: at, reason: undefined } : { reason: "DNS authentication records are not verified yet." }),
    updatedAt: at,
  };
}

export async function provisionSendGridLinkDomain(input: { organizationId: string; rootDomain: string; subdomain: string }): Promise<OrganizationLinkDomain> {
  const rootDomain = normalizeDomain(input.rootDomain);
  const subdomain = normalizeDomainLabel(input.subdomain);
  const domain = composeSubdomain(rootDomain, subdomain);
  const response = await sendGridRequest("/v3/whitelabel/links", {
    method: "POST",
    body: JSON.stringify({ domain: rootDomain, subdomain, default: false }),
  });
  const id = response.id;
  if (typeof id !== "number" && typeof id !== "string") throw new Error("SendGrid did not return a link-branding identifier.");
  const at = new Date().toISOString();
  return {
    organizationId: input.organizationId,
    provider: "sendgrid",
    rootDomain,
    subdomain,
    domain,
    providerLinkBrandId: String(id),
    status: response.valid === true ? "ready" : "pending",
    dnsRecords: dnsRecords(response.dns),
    ...(response.valid === true ? { verifiedAt: at } : {}),
    updatedAt: at,
  };
}

export async function validateSendGridLinkDomain(current: OrganizationLinkDomain): Promise<OrganizationLinkDomain> {
  if (!current.providerLinkBrandId) throw new Error("Organization link domain has no SendGrid identifier.");
  const response = await sendGridRequest(`/v3/whitelabel/links/${encodeURIComponent(current.providerLinkBrandId)}/validate`, { method: "POST" });
  const valid = response.valid === true;
  const at = new Date().toISOString();
  const validationRecords = dnsRecords(response.validation_results);
  return {
    ...current,
    status: valid ? "ready" : "pending",
    dnsRecords: validationRecords.length ? validationRecords : current.dnsRecords.map((record) => ({ ...record, valid: valid || record.valid })),
    ...(valid ? { verifiedAt: at, reason: undefined } : { reason: "Branded-link DNS records are not verified yet." }),
    updatedAt: at,
  };
}

export async function provisionSendGridInboundEmail(input: { organizationId: string; hostname: string }): Promise<OrganizationInboundEmail> {
  const hostname = normalizeDomain(input.hostname);
  const webhookUrl = `${getCommunicationWebhookBaseUrl()}/sendGridInboundEmail?organizationId=${encodeURIComponent(input.organizationId)}`;
  const policyResponse = await sendGridRequest("/v3/user/webhooks/security/policies", {
    method: "POST",
    body: JSON.stringify({ name: `Nurture inbound email ${input.organizationId}`, signature: { enabled: true } }),
  });
  const policy = object(policyResponse.policy);
  const policyId = typeof policy.id === "string" ? policy.id : "";
  const signature = object(policy.signature);
  const publicKey = typeof signature.public_key === "string" ? signature.public_key : "";
  if (!policyId || !publicKey) throw new Error("SendGrid did not return a signed Inbound Parse security policy.");

  await sendGridRequest("/v3/user/webhooks/parse/settings", {
    method: "POST",
    body: JSON.stringify({ hostname, url: webhookUrl, spam_check: true, send_raw: true }),
  });
  await sendGridRequest(`/v3/user/webhooks/parse/settings/${encodeURIComponent(hostname)}`, {
    method: "PATCH",
    body: JSON.stringify({ url: webhookUrl, spam_check: true, send_raw: true, security_policy: policyId }),
  });
  const at = new Date().toISOString();
  return {
    organizationId: input.organizationId,
    provider: "sendgrid",
    hostname,
    webhookUrl,
    providerSecurityPolicyId: policyId,
    providerPublicKey: publicKey,
    status: "pending",
    dnsRecords: [{ type: "MX", host: hostname, value: "mx.sendgrid.net", valid: false }],
    reason: "Add the MX record and validate it before enabling inbound email.",
    updatedAt: at,
  };
}

export async function validateSendGridInboundEmail(current: OrganizationInboundEmail): Promise<OrganizationInboundEmail> {
  let valid = false;
  try {
    const answers = await resolveMx(current.hostname);
    valid = answers.some((answer) => answer.exchange.toLowerCase().replace(/\.$/, "") === "mx.sendgrid.net");
  } catch {
    valid = false;
  }
  const at = new Date().toISOString();
  return {
    ...current,
    status: valid ? "ready" : "pending",
    dnsRecords: current.dnsRecords.map((record) => record.type === "MX" ? { ...record, valid } : record),
    ...(valid ? { verifiedAt: at, reason: undefined } : { reason: "Inbound MX record is not verified yet." }),
    updatedAt: at,
  };
}
