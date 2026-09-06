import type { MailDnsRequirement, MailEgressAddress, MailSendingIdentity, MailTrafficClass } from "../../../shared/mail/contracts.js";
import { NURTURE_MAIL_SCHEMA_VERSION } from "../../../shared/mail/contracts.js";
import { normalizeMailbox } from "./address.js";

function normalizeDomain(value: string) {
  return normalizeMailbox(`postmaster@${value}`).domain;
}

function txtValue(value: string) {
  return value.trim().replace(/^"|"$/g, "");
}

export interface CreateSendingIdentityInput {
  id: string;
  organizationId: string;
  fromDomain: string;
  returnPathLabel?: string;
  dkimSelector: string;
  dkimPublicKeyBase64: string;
  dkimKeyReference: string;
  egressPoolId: string;
  egressAddresses: readonly MailEgressAddress[];
  bounceMxHostname: string;
  allowedTrafficClasses?: readonly MailTrafficClass[];
  dmarcPolicy?: string;
  now?: Date;
}

export function createSendingIdentity(input: CreateSendingIdentityInput): MailSendingIdentity {
  const now = (input.now ?? new Date()).toISOString();
  const fromDomain = normalizeDomain(input.fromDomain);
  const returnPathLabel = (input.returnPathLabel ?? "bounce").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(returnPathLabel)) throw new Error("Return-path label is invalid.");
  const selector = input.dkimSelector.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/.test(selector)) throw new Error("DKIM selector is invalid.");
  const dkimPublic = input.dkimPublicKeyBase64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(dkimPublic)) throw new Error("DKIM public key must be base64 encoded.");
  const mailFromDomain = `${returnPathLabel}.${fromDomain}`;
  const bounceMxHostname = normalizeDomain(input.bounceMxHostname);
  const v4 = input.egressAddresses.filter((entry) => entry.family === 4).map((entry) => `ip4:${entry.ip}`);
  const v6 = input.egressAddresses.filter((entry) => entry.family === 6).map((entry) => `ip6:${entry.ip}`);
  if (![...v4, ...v6].length) throw new Error("At least one egress address is required to build SPF readiness.");

  const requirements: MailDnsRequirement[] = [
    {
      kind: "dkim",
      recordType: "TXT",
      host: `${selector}._domainkey.${fromDomain}`,
      value: `v=DKIM1; k=rsa; p=${dkimPublic}`,
      status: "pending",
      required: true,
    },
    {
      kind: "return-path-mx",
      recordType: "MX",
      host: mailFromDomain,
      value: `10 ${bounceMxHostname}`,
      status: "pending",
      required: true,
    },
    {
      kind: "return-path-spf",
      recordType: "TXT",
      host: mailFromDomain,
      value: `v=spf1 ${[...v4, ...v6].join(" ")} -all`,
      status: "pending",
      required: true,
    },
    {
      kind: "dmarc",
      recordType: "TXT",
      host: `_dmarc.${fromDomain}`,
      value: input.dmarcPolicy?.trim() || "v=DMARC1; p=none",
      status: "pending",
      required: true,
    },
  ];

  return {
    schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
    id: input.id,
    organizationId: input.organizationId,
    fromDomain,
    mailFromDomain,
    dkimDomain: fromDomain,
    dkimSelector: selector,
    dkimKeyReference: input.dkimKeyReference,
    egressPoolId: input.egressPoolId,
    allowedTrafficClasses: [...(input.allowedTrafficClasses ?? ["transactional", "lifecycle", "marketing"])],
    status: "pending",
    dnsRequirements: requirements,
    createdAt: now,
    updatedAt: now,
  };
}

export interface MailDnsVerificationResolver {
  resolveTxt(host: string): Promise<string[]>;
  resolveMx(host: string): Promise<Array<{ priority: number; exchange: string }>>;
}

function mxComparable(value: { priority: number; exchange: string }) {
  return `${value.priority} ${value.exchange.toLowerCase().replace(/\.$/, "")}`;
}

export async function verifySendingIdentity(identity: MailSendingIdentity, resolver: MailDnsVerificationResolver, now = new Date()): Promise<MailSendingIdentity> {
  const dnsRequirements: MailDnsRequirement[] = [];
  for (const requirement of identity.dnsRequirements) {
    try {
      if (requirement.recordType === "TXT") {
        const observed = (await resolver.resolveTxt(requirement.host)).map(txtValue);
        const expected = txtValue(requirement.value);
        const valid = requirement.kind === "dmarc"
          ? observed.some((value) => value.toUpperCase().startsWith("V=DMARC1;"))
          : observed.includes(expected);
        dnsRequirements.push({ ...requirement, status: valid ? "verified" : "failed", observedValues: observed, checkedAt: now.toISOString() });
      } else if (requirement.recordType === "MX") {
        const observedMx = await resolver.resolveMx(requirement.host);
        const observed = observedMx.map(mxComparable);
        const expected = requirement.value.toLowerCase().replace(/\.$/, "");
        dnsRequirements.push({ ...requirement, status: observed.includes(expected) ? "verified" : "failed", observedValues: observed, checkedAt: now.toISOString() });
      } else {
        dnsRequirements.push({ ...requirement, status: "failed", checkedAt: now.toISOString(), observedValues: [] });
      }
    } catch {
      dnsRequirements.push({ ...requirement, status: "pending", checkedAt: now.toISOString() });
    }
  }
  const required = dnsRequirements.filter((entry) => entry.required);
  const ready = required.length > 0 && required.every((entry) => entry.status === "verified");
  return {
    ...identity,
    dnsRequirements,
    status: ready ? "ready" : "pending",
    ...(ready ? { verifiedAt: now.toISOString(), reason: undefined } : { verifiedAt: undefined, reason: "Required DNS records are not fully verified." }),
    updatedAt: now.toISOString(),
  };
}
