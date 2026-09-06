import { createHash, randomUUID } from "node:crypto";
import { db } from "../firebase.js";
import type {
  InboundCommunicationRoute,
  OrganizationA2pRegistration,
  OrganizationEmailDomain,
  OrganizationInboundEmail,
  OrganizationLinkDomain,
  OrganizationSmsSender,
  SmsCarrierPreference,
} from "./branded-types.js";
import { normalizeE164 } from "./branded-types.js";

function organizationRef(organizationId: string) {
  return db.collection("organizations").doc(organizationId);
}

function infrastructureRef(organizationId: string, id: "emailDomain" | "linkDomain" | "inboundEmail" | "smsSender" | "smsA2p") {
  return organizationRef(organizationId).collection("communicationInfrastructure").doc(id);
}

function emailSenderRef(organizationId: string) {
  return organizationRef(organizationId).collection("communicationSettings").doc("emailSender");
}

function inboundMessageRef(organizationId: string, providerMessageId: string) {
  return organizationRef(organizationId).collection("communicationInboundMessages").doc(opaqueKey(providerMessageId));
}

function smsPreferenceRef(organizationId: string, recipientHash: string) {
  return organizationRef(organizationId).collection("communicationSmsPreferences").doc(recipientHash);
}

function smsRouteRef(kind: "number" | "service", value: string) {
  return db.collection("_communicationSmsRoutes").doc(opaqueKey(`${kind}:${value}`));
}

function auditRef(organizationId: string) {
  return organizationRef(organizationId).collection("auditEvents").doc(randomUUID());
}

function opaqueKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPhoneNumber(value: string) {
  return opaqueKey(normalizeE164(value));
}

function auditRecord(input: { organizationId: string; actorUserId: string; action: string; targetId: string; at: string; metadata?: Record<string, string | number | boolean | null> }) {
  return {
    id: randomUUID(),
    schemaVersion: 1,
    action: input.action,
    scope: { kind: "organization", organizationId: input.organizationId },
    actor: { kind: "user", id: input.actorUserId },
    target: { type: "communication-infrastructure", organizationId: input.organizationId, id: input.targetId },
    occurredAt: input.at,
    receivedAt: input.at,
    source: "cloud-function",
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export async function getBrandedCommunicationInfrastructure(organizationId: string) {
  const refs = ["emailDomain", "linkDomain", "inboundEmail", "smsSender", "smsA2p"] as const;
  const snapshots = await Promise.all(refs.map((id) => infrastructureRef(organizationId, id).get()));
  const value = (index: number) => snapshots[index]?.exists ? snapshots[index]?.data() ?? null : null;
  return {
    emailDomain: value(0) as OrganizationEmailDomain | null,
    linkDomain: value(1) as OrganizationLinkDomain | null,
    inboundEmail: value(2) as OrganizationInboundEmail | null,
    smsSender: value(3) as OrganizationSmsSender | null,
    smsA2p: value(4) as OrganizationA2pRegistration | null,
  };
}

export async function getOrganizationEmailDomain(organizationId: string) {
  const snapshot = await infrastructureRef(organizationId, "emailDomain").get();
  return snapshot.exists ? snapshot.data() as OrganizationEmailDomain : null;
}

export async function saveOrganizationEmailDomain(input: OrganizationEmailDomain, actorUserId: string) {
  const at = new Date().toISOString();
  const next = { ...input, updatedAt: at } satisfies OrganizationEmailDomain;
  const audit = auditRecord({
    organizationId: input.organizationId,
    actorUserId,
    action: input.status === "ready" ? "communications.email_domain.verified" : "communications.email_domain.configured",
    targetId: input.domain,
    at,
    metadata: { status: input.status, provider: input.provider },
  });
  await db.runTransaction(async (transaction) => {
    transaction.set(infrastructureRef(input.organizationId, "emailDomain"), next, { merge: false });
    if (next.status === "ready" && next.authenticatedDomain && next.verifiedAt) {
      transaction.set(emailSenderRef(input.organizationId), {
        provider: "sendgrid",
        status: "ready",
        fromAddress: next.fromAddress,
        fromName: next.fromName,
        ...(next.replyTo ? { replyTo: next.replyTo } : {}),
        authenticatedDomain: next.authenticatedDomain,
        verifiedAt: next.verifiedAt,
      }, { merge: false });
    } else {
      transaction.set(emailSenderRef(input.organizationId), {
        provider: "sendgrid",
        status: next.status === "blocked" ? "blocked" : "pending",
        fromAddress: next.fromAddress,
        fromName: next.fromName,
        ...(next.replyTo ? { replyTo: next.replyTo } : {}),
        ...(next.authenticatedDomain ? { authenticatedDomain: next.authenticatedDomain } : {}),
        reason: next.reason ?? "Organization sending domain is awaiting verification.",
      }, { merge: false });
    }
    transaction.set(auditRef(input.organizationId), audit);
  });
  return next;
}

export async function saveOrganizationLinkDomain(input: OrganizationLinkDomain, actorUserId: string) {
  const at = new Date().toISOString();
  const next = { ...input, updatedAt: at } satisfies OrganizationLinkDomain;
  await db.runTransaction(async (transaction) => {
    transaction.set(infrastructureRef(input.organizationId, "linkDomain"), next, { merge: false });
    transaction.set(auditRef(input.organizationId), auditRecord({
      organizationId: input.organizationId,
      actorUserId,
      action: input.status === "ready" ? "communications.link_domain.verified" : "communications.link_domain.configured",
      targetId: input.domain,
      at,
      metadata: { status: input.status, provider: input.provider },
    }));
  });
  return next;
}

export async function saveOrganizationInboundEmail(input: OrganizationInboundEmail, actorUserId: string) {
  const at = new Date().toISOString();
  const next = { ...input, updatedAt: at } satisfies OrganizationInboundEmail;
  await db.runTransaction(async (transaction) => {
    transaction.set(infrastructureRef(input.organizationId, "inboundEmail"), next, { merge: false });
    transaction.set(auditRef(input.organizationId), auditRecord({
      organizationId: input.organizationId,
      actorUserId,
      action: "communications.inbound_email.configured",
      targetId: input.hostname,
      at,
      metadata: { status: input.status, provider: input.provider },
    }));
  });
  return next;
}

export async function getOrganizationInboundEmail(organizationId: string) {
  const snapshot = await infrastructureRef(organizationId, "inboundEmail").get();
  return snapshot.exists ? snapshot.data() as OrganizationInboundEmail : null;
}

export async function saveOrganizationSmsSender(input: OrganizationSmsSender, actorUserId: string) {
  const at = new Date().toISOString();
  const next = { ...input, updatedAt: at } satisfies OrganizationSmsSender;
  const target = infrastructureRef(input.organizationId, "smsSender");
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(target);
    const previous = existing.exists ? existing.data() as OrganizationSmsSender : null;
    if (previous?.phoneNumber && (previous.phoneNumber !== next.phoneNumber || next.status === "blocked")) {
      transaction.delete(smsRouteRef("number", normalizeE164(previous.phoneNumber)));
    }
    if (previous?.messagingServiceSid && (previous.messagingServiceSid !== next.messagingServiceSid || next.status === "blocked")) {
      transaction.delete(smsRouteRef("service", previous.messagingServiceSid));
    }
    transaction.set(target, next, { merge: false });

    // Inbound STOP/START/HELP must remain routable while US outbound messaging is
    // pending A2P approval. Outbound delivery still independently requires ready.
    if (next.phoneNumber && next.status !== "blocked") {
      transaction.set(smsRouteRef("number", normalizeE164(next.phoneNumber)), {
        provider: "twilio",
        organizationId: input.organizationId,
        senderIdentity: normalizeE164(next.phoneNumber),
        messagingServiceSid: next.messagingServiceSid ?? null,
        outboundReady: next.status === "ready",
        updatedAt: at,
      }, { merge: false });
    }
    if (next.messagingServiceSid && next.status !== "blocked") {
      transaction.set(smsRouteRef("service", next.messagingServiceSid), {
        provider: "twilio",
        organizationId: input.organizationId,
        senderIdentity: next.phoneNumber ?? next.alphaSenderId ?? next.messagingServiceSid,
        messagingServiceSid: next.messagingServiceSid,
        outboundReady: next.status === "ready",
        updatedAt: at,
      }, { merge: false });
    }
    transaction.set(auditRef(input.organizationId), auditRecord({
      organizationId: input.organizationId,
      actorUserId,
      action: "communications.sms_sender.configured",
      targetId: next.phoneNumber ?? next.alphaSenderId ?? next.messagingServiceSid ?? "sms",
      at,
      metadata: { status: next.status, senderKind: next.senderKind, provider: next.provider },
    }));
  });
  return next;
}

export async function getOrganizationSmsSender(organizationId: string) {
  const snapshot = await infrastructureRef(organizationId, "smsSender").get();
  return snapshot.exists ? snapshot.data() as OrganizationSmsSender : null;
}

export async function saveOrganizationA2pRegistration(input: OrganizationA2pRegistration, actorUserId: string) {
  const at = new Date().toISOString();
  const next = { ...input, updatedAt: at } satisfies OrganizationA2pRegistration;
  await db.runTransaction(async (transaction) => {
    transaction.set(infrastructureRef(input.organizationId, "smsA2p"), next, { merge: false });
    transaction.set(auditRef(input.organizationId), auditRecord({
      organizationId: input.organizationId,
      actorUserId,
      action: "communications.sms_a2p.updated",
      targetId: input.brandName,
      at,
      metadata: { status: input.status, provider: input.provider, countryCode: input.countryCode },
    }));
  });
  return next;
}

export async function getOrganizationA2pRegistration(organizationId: string) {
  const snapshot = await infrastructureRef(organizationId, "smsA2p").get();
  return snapshot.exists ? snapshot.data() as OrganizationA2pRegistration : null;
}

export async function resolveSmsInboundOrganization(input: { to: string; messagingServiceSid?: string }) {
  const normalizedTo = normalizeE164(input.to);
  const number = await smsRouteRef("number", normalizedTo).get();
  if (number.exists) return number.data() as { organizationId: string; senderIdentity: string; messagingServiceSid?: string | null; outboundReady?: boolean };
  if (input.messagingServiceSid) {
    const service = await smsRouteRef("service", input.messagingServiceSid).get();
    if (service.exists) return service.data() as { organizationId: string; senderIdentity: string; messagingServiceSid?: string | null; outboundReady?: boolean };
  }
  return null;
}

export async function recordInboundCommunication(route: InboundCommunicationRoute & { provider: "sendgrid" | "twilio"; complianceKeyword?: string; subject?: string }) {
  const ref = inboundMessageRef(route.organizationId, `${route.provider}:${route.providerMessageId}`);
  const snapshot = await ref.get();
  if (snapshot.exists) return { created: false, message: snapshot.data() };
  const record = {
    ...route,
    provider: route.provider,
    ...(route.complianceKeyword ? { complianceKeyword: route.complianceKeyword } : {}),
    ...(route.subject ? { subject: route.subject } : {}),
  };
  await ref.create(record);
  return { created: true, message: record };
}

export async function getSmsCarrierPreference(organizationId: string, recipientHash: string): Promise<SmsCarrierPreference | null> {
  const snapshot = await smsPreferenceRef(organizationId, recipientHash).get();
  return snapshot.exists ? snapshot.data() as SmsCarrierPreference : null;
}

export async function setSmsCarrierPreference(input: SmsCarrierPreference) {
  await smsPreferenceRef(input.organizationId, input.recipientHash).set(input, { merge: false });
  return input;
}
