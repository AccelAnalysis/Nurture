import { createHash, randomUUID } from "node:crypto";
import { sanitizeAuditMetadata, type AuditRecord } from "../../../shared/platform/audit.js";
import { getDefaultCommunicationTemplate } from "../../../shared/communications/defaults.js";
import {
  COMMUNICATION_SCHEMA_VERSION,
  communicationTemplateIds,
  type CommunicationTemplateId,
  type CommunicationTemplateView,
  type EmailSenderReadiness,
  type EmailSuppressionSnapshot,
  type EmailTemplateContent,
  type EmailTemplateDraft,
  type EmailTemplatePublishedVersion,
  type MessageDeliveryRecord,
  type MessageDeliveryStatus,
  type MessageIntent,
} from "../../../shared/communications/contracts.js";
import { validateEmailTemplateContent } from "../../../shared/communications/render.js";
import { db } from "../firebase.js";
import { shouldApplyProviderTransition } from "./delivery-state.js";
import {
  communicationEventTypeForStatus,
  createCommunicationEventOutboxRecord,
  type CommunicationEventOutboxRecord,
  type CommunicationLifecycleEventSource,
  type CommunicationLifecycleEventType,
} from "./outbox.js";

interface StoredCommunicationTemplate {
  schemaVersion: typeof COMMUNICATION_SCHEMA_VERSION;
  templateId: CommunicationTemplateId;
  purpose: "transactional" | "marketing";
  draft?: EmailTemplateDraft;
  published?: EmailTemplatePublishedVersion;
  updatedAt: string;
}

interface ProviderMessageMapping {
  provider: "sendgrid";
  providerMessageId: string;
  organizationId: string;
  messageId: string;
  recipientHash: string;
  createdAt: string;
}

interface ProviderEventMarker {
  provider: "sendgrid";
  providerEventId: string;
  providerMessageId: string;
  eventType: string;
  receivedAt: string;
  state: "applied" | "unmatched" | "rejected";
  reason?: string;
}

export interface MessageLifecycleOutcomeWrite {
  eventType: CommunicationLifecycleEventType;
  source: CommunicationLifecycleEventSource;
  occurredAt?: string;
  idempotencySuffix?: string;
  reason?: string;
}

function organizationRef(organizationId: string) {
  return db.collection("organizations").doc(organizationId);
}

function templateRef(organizationId: string, templateId: CommunicationTemplateId) {
  return organizationRef(organizationId).collection("communicationTemplates").doc(templateId);
}

function versionRef(organizationId: string, templateId: CommunicationTemplateId, version: number) {
  return templateRef(organizationId, templateId).collection("versions").doc(String(version));
}

function senderRef(organizationId: string) {
  return organizationRef(organizationId).collection("communicationSettings").doc("emailSender");
}

function messageRef(organizationId: string, messageId: string) {
  return organizationRef(organizationId).collection("communicationMessages").doc(messageId);
}

function effectRef(organizationId: string, effectId: string) {
  return organizationRef(organizationId).collection("communicationEffects").doc(opaqueKey(effectId));
}

function communicationOutboxCollection(organizationId: string) {
  return organizationRef(organizationId).collection("communicationEventOutbox");
}

function communicationOutboxRef(organizationId: string, outboxId: string) {
  return communicationOutboxCollection(organizationId).doc(outboxId);
}

function providerMessageRef(providerMessageId: string) {
  return db.collection("_communicationProviderMessages").doc(opaqueKey(canonicalSendGridMessageId(providerMessageId)));
}

function providerEventRef(providerEventId: string) {
  return db.collection("_communicationProviderEvents").doc(opaqueKey(providerEventId));
}

function providerSuppressionRef(recipientHash: string) {
  return db.collection("_communicationProviderSuppressions").doc(recipientHash);
}

function auditEventRef(organizationId: string) {
  return organizationRef(organizationId).collection("auditEvents").doc(randomUUID());
}

function opaqueKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase();
}

export function hashRecipientEmail(value: string) {
  return opaqueKey(normalizeEmailAddress(value));
}

export function canonicalSendGridMessageId(value: string) {
  return value.trim().split(".")[0] || value.trim();
}

function auditRecord(input: {
  organizationId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, string | number | boolean | null>;
  at: string;
}): AuditRecord {
  return {
    id: randomUUID(),
    schemaVersion: 1,
    action: input.action,
    scope: { kind: "organization", organizationId: input.organizationId },
    actor: { kind: "user", id: input.actorUserId },
    target: { type: input.targetType, organizationId: input.organizationId, id: input.targetId },
    occurredAt: input.at,
    receivedAt: input.at,
    source: "cloud-function",
    ...(input.metadata ? { metadata: sanitizeAuditMetadata(input.metadata) } : {}),
  };
}

function defaultDraft(templateId: CommunicationTemplateId): EmailTemplateDraft {
  const template = getDefaultCommunicationTemplate(templateId);
  return {
    templateId,
    purpose: template.purpose,
    content: structuredClone(template.content),
    updatedAt: template.version,
    inheritedFromDefaultVersion: template.version,
  };
}

function writeOutbox(
  transaction: FirebaseFirestore.Transaction,
  record: MessageDeliveryRecord,
  outcome: MessageLifecycleOutcomeWrite,
) {
  const outbox = createCommunicationEventOutboxRecord({
    record,
    eventType: outcome.eventType,
    source: outcome.source,
    occurredAt: outcome.occurredAt ?? record.updatedAt,
    idempotencySuffix: outcome.idempotencySuffix,
    reason: outcome.reason,
  });
  if (outbox) transaction.set(communicationOutboxRef(record.intent.organizationId, outbox.outboxId), outbox);
}

async function templateVersions(organizationId: string, templateId: CommunicationTemplateId) {
  const snapshot = await templateRef(organizationId, templateId).collection("versions").orderBy("version", "desc").limit(20).get();
  return snapshot.docs.map((doc) => doc.data() as EmailTemplatePublishedVersion);
}

export async function getCommunicationTemplateView(organizationId: string, templateId: CommunicationTemplateId): Promise<CommunicationTemplateView> {
  const [snapshot, versions] = await Promise.all([templateRef(organizationId, templateId).get(), templateVersions(organizationId, templateId)]);
  const stored = snapshot.exists ? snapshot.data() as StoredCommunicationTemplate : null;
  const fallback = getDefaultCommunicationTemplate(templateId);
  return {
    templateId,
    purpose: fallback.purpose,
    defaultVersion: fallback.version,
    provenance: stored?.draft ? "organization-override" : "nurture-default",
    draft: stored?.draft ?? defaultDraft(templateId),
    published: stored?.published ?? null,
    versions,
  };
}

export async function listCommunicationTemplateViews(organizationId: string) {
  return Promise.all(communicationTemplateIds.map((templateId) => getCommunicationTemplateView(organizationId, templateId)));
}

export async function saveCommunicationTemplateDraft(input: {
  organizationId: string;
  templateId: CommunicationTemplateId;
  content: EmailTemplateContent;
  actorUserId: string;
}) {
  const definition = getDefaultCommunicationTemplate(input.templateId);
  const issues = validateEmailTemplateContent(input.content);
  if (issues.length) throw new Error(issues.map((issue) => issue.message).join(" "));
  const at = new Date().toISOString();
  const draft: EmailTemplateDraft = {
    templateId: input.templateId,
    purpose: definition.purpose,
    content: structuredClone(input.content),
    updatedAt: at,
    inheritedFromDefaultVersion: definition.version,
  };
  const ref = templateRef(input.organizationId, input.templateId);
  const audit = auditRecord({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "communications.template.draft_saved",
    targetType: "communication-template",
    targetId: input.templateId,
    at,
  });
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    const stored = current.exists ? current.data() as StoredCommunicationTemplate : null;
    transaction.set(ref, {
      schemaVersion: COMMUNICATION_SCHEMA_VERSION,
      templateId: input.templateId,
      purpose: definition.purpose,
      draft,
      ...(stored?.published ? { published: stored.published } : {}),
      updatedAt: at,
    } satisfies StoredCommunicationTemplate);
    transaction.set(auditEventRef(input.organizationId), audit);
  });
  return getCommunicationTemplateView(input.organizationId, input.templateId);
}

export async function publishCommunicationTemplate(input: {
  organizationId: string;
  templateId: CommunicationTemplateId;
  actorUserId: string;
}) {
  const ref = templateRef(input.organizationId, input.templateId);
  const definition = getDefaultCommunicationTemplate(input.templateId);
  const published = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    const stored = current.exists ? current.data() as StoredCommunicationTemplate : null;
    const draft = stored?.draft ?? defaultDraft(input.templateId);
    if (draft.purpose !== definition.purpose) throw new Error("Template purpose is immutable and does not match the approved catalog.");
    const issues = validateEmailTemplateContent(draft.content);
    if (issues.length) throw new Error(issues.map((issue) => issue.message).join(" "));
    if (stored?.published?.sourceDraftUpdatedAt === draft.updatedAt) return stored.published;
    const at = new Date().toISOString();
    const next: EmailTemplatePublishedVersion = {
      schemaVersion: COMMUNICATION_SCHEMA_VERSION,
      organizationId: input.organizationId,
      templateId: input.templateId,
      purpose: definition.purpose,
      version: (stored?.published?.version ?? 0) + 1,
      content: structuredClone(draft.content),
      sourceDraftUpdatedAt: draft.updatedAt,
      publishedAt: at,
      publishedBy: input.actorUserId,
    };
    const audit = auditRecord({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "communications.template.published",
      targetType: "communication-template",
      targetId: input.templateId,
      metadata: { version: next.version, purpose: next.purpose },
      at,
    });
    transaction.set(versionRef(input.organizationId, input.templateId, next.version), next);
    transaction.set(ref, {
      schemaVersion: COMMUNICATION_SCHEMA_VERSION,
      templateId: input.templateId,
      purpose: definition.purpose,
      draft,
      published: next,
      updatedAt: at,
    } satisfies StoredCommunicationTemplate);
    transaction.set(auditEventRef(input.organizationId), audit);
    return next;
  });
  return published;
}

export async function getPublishedCommunicationTemplate(organizationId: string, templateId: CommunicationTemplateId, version: number) {
  const snapshot = await versionRef(organizationId, templateId, version).get();
  if (snapshot.exists) return snapshot.data() as EmailTemplatePublishedVersion;
  const current = await templateRef(organizationId, templateId).get();
  const published = current.exists ? (current.data() as StoredCommunicationTemplate).published : undefined;
  return published?.version === version ? published : null;
}

export async function getEmailSenderReadiness(organizationId: string): Promise<EmailSenderReadiness> {
  const snapshot = await senderRef(organizationId).get();
  if (!snapshot.exists) {
    return { organizationId, provider: "sendgrid", status: "not-configured", reason: "No organization SendGrid sender mapping is configured." };
  }
  const data = snapshot.data() ?? {};
  const status = data.status;
  if (status !== "ready" && status !== "pending" && status !== "blocked") {
    return { organizationId, provider: "sendgrid", status: "not-configured", reason: "The stored sender mapping is invalid." };
  }
  const fromAddress = typeof data.fromAddress === "string" ? data.fromAddress : undefined;
  const fromName = typeof data.fromName === "string" ? data.fromName : undefined;
  const authenticatedDomain = typeof data.authenticatedDomain === "string" ? data.authenticatedDomain : undefined;
  const verifiedAt = typeof data.verifiedAt === "string" ? data.verifiedAt : undefined;
  const reason = typeof data.reason === "string" ? data.reason : undefined;
  if (status === "ready" && (!fromAddress || !fromName || !authenticatedDomain || !verifiedAt)) {
    return { organizationId, provider: "sendgrid", status: "blocked", reason: "The sender is marked ready but verified sender fields are incomplete." };
  }
  return { organizationId, provider: "sendgrid", status, fromAddress, fromName, authenticatedDomain, verifiedAt, reason };
}

export async function getEmailSuppression(recipientHash: string): Promise<EmailSuppressionSnapshot> {
  const snapshot = await providerSuppressionRef(recipientHash).get();
  if (!snapshot.exists) return { suppressed: false, scope: "none", observedAt: new Date().toISOString() };
  const data = snapshot.data() ?? {};
  return {
    suppressed: true,
    scope: data.scope === "organization" ? "organization" : "platform",
    reason: typeof data.reason === "string" ? data.reason : "Provider suppression is active.",
    observedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  };
}

export async function createMessageIntent(intent: MessageIntent): Promise<{ created: boolean; record: MessageDeliveryRecord }> {
  const effect = effectRef(intent.organizationId, intent.effectId);
  const result = await db.runTransaction(async (transaction) => {
    const existingEffect = await transaction.get(effect);
    if (existingEffect.exists) {
      const messageId = existingEffect.data()?.messageId;
      if (typeof messageId !== "string") throw new Error("Communication effect record is corrupt.");
      return { created: false, messageId };
    }
    const record: MessageDeliveryRecord = {
      intent,
      status: "planned",
      attempts: [],
      updatedAt: intent.createdAt,
    };
    transaction.set(messageRef(intent.organizationId, intent.messageId), { ...record, recipientKey: `${intent.recipient.kind}:${intent.recipient.id}` });
    transaction.set(effect, { effectIdHash: opaqueKey(intent.effectId), messageId: intent.messageId, createdAt: intent.createdAt });
    return { created: true, messageId: intent.messageId };
  });
  const snapshot = await messageRef(intent.organizationId, result.messageId).get();
  if (!snapshot.exists) throw new Error("Communication message record was not persisted.");
  return { created: result.created, record: snapshot.data() as MessageDeliveryRecord };
}

export async function updateMessageRecord(
  organizationId: string,
  messageId: string,
  patch: Partial<MessageDeliveryRecord>,
  outcome?: MessageLifecycleOutcomeWrite,
) {
  const updatedAt = new Date().toISOString();
  const ref = messageRef(organizationId, messageId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Communication message not found.");
    const current = snapshot.data() as MessageDeliveryRecord;
    const next = { ...current, ...patch, updatedAt } as MessageDeliveryRecord;
    transaction.set(ref, { ...patch, updatedAt }, { merge: true });
    if (outcome) writeOutbox(transaction, next, { ...outcome, occurredAt: outcome.occurredAt ?? updatedAt });
  });
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Communication message not found after update.");
  return snapshot.data() as MessageDeliveryRecord;
}

export async function registerProviderAcceptance(input: {
  organizationId: string;
  messageId: string;
  providerMessageId: string;
  recipientHash: string;
  acceptedAt: string;
  attempts: MessageDeliveryRecord["attempts"];
}) {
  const canonical = canonicalSendGridMessageId(input.providerMessageId);
  const mapping: ProviderMessageMapping = {
    provider: "sendgrid",
    providerMessageId: canonical,
    organizationId: input.organizationId,
    messageId: input.messageId,
    recipientHash: input.recipientHash,
    createdAt: input.acceptedAt,
  };
  const ref = messageRef(input.organizationId, input.messageId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Communication message not found before provider acceptance was recorded.");
    const current = snapshot.data() as MessageDeliveryRecord;
    const next: MessageDeliveryRecord = {
      ...current,
      status: "accepted",
      statusReason: "provider-accepted",
      attempts: input.attempts,
      provider: "sendgrid",
      providerMessageId: canonical,
      acceptedAt: input.acceptedAt,
      updatedAt: input.acceptedAt,
    };
    transaction.set(providerMessageRef(canonical), mapping);
    transaction.set(ref, {
      status: next.status,
      statusReason: next.statusReason,
      attempts: next.attempts,
      provider: next.provider,
      providerMessageId: next.providerMessageId,
      acceptedAt: next.acceptedAt,
      updatedAt: next.updatedAt,
    }, { merge: true });
    writeOutbox(transaction, next, {
      eventType: "communication.provider_accepted",
      source: "trusted_server",
      occurredAt: input.acceptedAt,
      reason: "provider-accepted",
    });
  });
}

export async function findProviderMessageMapping(providerMessageId: string) {
  const snapshot = await providerMessageRef(providerMessageId).get();
  return snapshot.exists ? snapshot.data() as ProviderMessageMapping : null;
}

export async function applyVerifiedProviderEvent(input: {
  providerEventId: string;
  providerMessageId: string;
  eventType: string;
  occurredAt: string;
  recipientHash?: string;
  nextStatus?: MessageDeliveryStatus;
  statusReason?: string;
  suppressGlobally?: boolean;
}) {
  const canonical = canonicalSendGridMessageId(input.providerMessageId);
  const mapping = await findProviderMessageMapping(canonical);
  const receivedAt = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const markerRef = providerEventRef(input.providerEventId);
    const markerSnapshot = await transaction.get(markerRef);
    const priorMarker = markerSnapshot.exists ? markerSnapshot.data() as ProviderEventMarker : null;
    if (priorMarker?.state === "applied" || priorMarker?.state === "rejected") return { state: "duplicate" as const };

    const baseMarker: ProviderEventMarker = {
      provider: "sendgrid",
      providerEventId: input.providerEventId,
      providerMessageId: canonical,
      eventType: input.eventType,
      receivedAt,
      state: "unmatched",
    };
    if (!mapping) {
      transaction.set(markerRef, baseMarker);
      return { state: "unmatched" as const };
    }
    if (input.recipientHash && input.recipientHash !== mapping.recipientHash) {
      transaction.set(markerRef, { ...baseMarker, state: "rejected", reason: "recipient-mismatch" });
      return { state: "rejected" as const };
    }

    const targetRef = messageRef(mapping.organizationId, mapping.messageId);
    const target = await transaction.get(targetRef);
    if (!target.exists) {
      transaction.set(markerRef, baseMarker);
      return { state: "unmatched" as const };
    }
    const current = target.data() as MessageDeliveryRecord;
    const shouldTransition = Boolean(input.nextStatus && shouldApplyProviderTransition(current.status, input.nextStatus));
    if (input.nextStatus && shouldTransition) {
      const next: MessageDeliveryRecord = {
        ...current,
        status: input.nextStatus,
        statusReason: input.statusReason ?? `sendgrid-${input.eventType}`,
        ...(input.nextStatus === "delivered" ? { deliveredAt: input.occurredAt } : {}),
        updatedAt: receivedAt,
      };
      transaction.set(targetRef, {
        status: next.status,
        statusReason: next.statusReason,
        ...(input.nextStatus === "delivered" ? { deliveredAt: input.occurredAt } : {}),
        updatedAt: receivedAt,
      }, { merge: true });
      const lifecycleEventType = communicationEventTypeForStatus(input.nextStatus);
      if (lifecycleEventType) {
        writeOutbox(transaction, next, {
          eventType: lifecycleEventType,
          source: "provider_webhook",
          occurredAt: input.occurredAt,
          idempotencySuffix: input.providerEventId,
          reason: input.statusReason ?? `sendgrid-${input.eventType}`,
        });
      }
    }
    if (input.suppressGlobally) {
      transaction.set(providerSuppressionRef(mapping.recipientHash), {
        scope: "platform",
        provider: "sendgrid",
        reason: input.statusReason ?? input.eventType,
        updatedAt: receivedAt,
      }, { merge: true });
    }
    transaction.set(markerRef, { ...baseMarker, state: "applied" });
    return { state: "applied" as const, organizationId: mapping.organizationId, messageId: mapping.messageId, previousStatus: current.status, transitioned: shouldTransition };
  });
}

export async function listPendingCommunicationEventOutbox(organizationId: string, limit = 50) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const snapshot = await communicationOutboxCollection(organizationId).where("state", "==", "pending").limit(safeLimit).get();
  return snapshot.docs.map((doc) => doc.data() as CommunicationEventOutboxRecord);
}

export async function markCommunicationEventOutboxAppended(input: {
  organizationId: string;
  outboxId: string;
  eventId: string;
  appendedAt: string;
}) {
  await communicationOutboxRef(input.organizationId, input.outboxId).set({
    state: "appended",
    appendedEventId: input.eventId,
    appendedAt: input.appendedAt,
    failureReason: null,
  }, { merge: true });
}

export async function markCommunicationEventOutboxFailed(input: {
  organizationId: string;
  outboxId: string;
  reason: string;
}) {
  await communicationOutboxRef(input.organizationId, input.outboxId).set({
    state: "failed",
    failureReason: input.reason.slice(0, 500),
  }, { merge: true });
}

export async function listCommunicationHistory(input: {
  organizationId: string;
  recipientKind?: "customer" | "lead" | "test";
  recipientId?: string;
  limit: number;
}) {
  const collection = organizationRef(input.organizationId).collection("communicationMessages");
  const safeLimit = Math.max(1, Math.min(input.limit, 100));
  const query = input.recipientKind && input.recipientId
    ? collection.where("recipientKey", "==", `${input.recipientKind}:${input.recipientId}`).orderBy("intent.createdAt", "desc").limit(safeLimit)
    : collection.orderBy("intent.createdAt", "desc").limit(safeLimit);
  const snapshot = await query.get();
  return snapshot.docs.map((doc) => doc.data() as MessageDeliveryRecord);
}
