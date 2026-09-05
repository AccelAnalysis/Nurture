import { randomUUID } from "node:crypto";
import type { EmailIntegrationPort } from "../../../shared/platform/integrations.js";
import {
  COMMUNICATION_SCHEMA_VERSION,
  type CommunicationExecutionMode,
  type CommunicationPurpose,
  type CommunicationRecipientReference,
  type CommunicationTemplateId,
  type CommunicationTriggerReference,
  type CommunicationVariableValues,
  type EmailConsentSnapshot,
  type EmailEligibilityResult,
  type MessageDeliveryAttempt,
  type MessageDeliveryRecord,
  type MessageIntent,
} from "../../../shared/communications/contracts.js";
import { evaluateEmailEligibility } from "../../../shared/communications/eligibility.js";
import { renderEmailTemplate } from "../../../shared/communications/render.js";
import { db } from "../firebase.js";
import { getCommunicationTrustedOrigins } from "./config.js";
import { communicationTemplateReference, getSendGridEmailAdapter } from "./sendgrid-adapter.js";
import {
  createMessageIntent,
  getEmailSenderReadiness,
  getEmailSuppression,
  getPublishedCommunicationTemplate,
  hashRecipientEmail,
  registerProviderAcceptance,
  updateMessageRecord,
} from "./store.js";

export interface DispatchEmailCommand {
  organizationId: string;
  effectId: string;
  mode: CommunicationExecutionMode;
  purpose: CommunicationPurpose;
  recipient: CommunicationRecipientReference;
  templateId: CommunicationTemplateId;
  templateVersion: number;
  variables: CommunicationVariableValues;
  trigger?: CommunicationTriggerReference;
}

export interface DispatchEmailPrerequisites {
  /** Current address resolved by trusted C/D composition. It is used in memory, not persisted in MessageIntent. */
  recipientEmail?: string;
  /** Current C-owned purpose/channel fact, interpreted by D immediately before dispatch admission. */
  consent: EmailConsentSnapshot;
  testAllowlisted?: boolean;
  /** Test execution keeps the real lead/customer subject in history while applying the controlled-test recipient gate. */
  eligibilityRecipientKind?: "customer" | "lead" | "test";
  /** Trusted final-recheck mismatch that must be persisted as a suppression rather than returned only in memory. */
  forcedSuppressionReason?: string;
}

export interface DispatchEmailResult {
  record: MessageDeliveryRecord;
  eligibility?: EmailEligibilityResult;
  submitted: boolean;
}

function lastAttempt(record: MessageDeliveryRecord) {
  return record.attempts[record.attempts.length - 1];
}

function canAttemptExisting(record: MessageDeliveryRecord) {
  if (record.status === "planned") return true;
  const last = lastAttempt(record);
  // Track E owns retry count/backoff. D only admits an E-requested repeat when
  // the prior provider attempt was explicitly classified safe-to-retry.
  return record.status === "failed" && last?.outcome === "retryable-failure";
}

function providerVariables(values: CommunicationVariableValues) {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function messageRef(organizationId: string, messageId: string) {
  return db.collection("organizations").doc(organizationId).collection("communicationMessages").doc(messageId);
}

/**
 * Atomically moves exactly one eligible logical message effect into the provider
 * submission state. Concurrent duplicate invocations observe the claimed record
 * and return without crossing the provider boundary.
 */
async function claimProviderAttempt(organizationId: string, messageId: string) {
  const ref = messageRef(organizationId, messageId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("Communication message not found before provider claim.");
    const current = snapshot.data() as MessageDeliveryRecord;
    if (!canAttemptExisting(current)) return { claimed: false as const, record: current };
    const attemptNumber = current.attempts.length + 1;
    const attemptStartedAt = new Date().toISOString();
    const pendingAttempt: MessageDeliveryAttempt = {
      attempt: attemptNumber,
      startedAt: attemptStartedAt,
      outcome: "unknown",
    };
    const next: MessageDeliveryRecord = {
      ...current,
      status: "submitting",
      statusReason: `provider-attempt-${attemptNumber}-started`,
      attempts: [...current.attempts, pendingAttempt],
      updatedAt: attemptStartedAt,
    };
    transaction.set(ref, {
      status: next.status,
      statusReason: next.statusReason,
      attempts: next.attempts,
      updatedAt: next.updatedAt,
    }, { merge: true });
    return { claimed: true as const, record: next, attemptNumber, attemptStartedAt };
  });
}

export async function dispatchEmail(
  command: DispatchEmailCommand,
  prerequisites: DispatchEmailPrerequisites,
  provider: EmailIntegrationPort = getSendGridEmailAdapter(),
): Promise<DispatchEmailResult> {
  const now = new Date().toISOString();
  const recipientHash = prerequisites.recipientEmail ? hashRecipientEmail(prerequisites.recipientEmail) : hashRecipientEmail(`unresolved:${command.recipient.kind}:${command.recipient.id}`);
  const intent: MessageIntent = {
    schemaVersion: COMMUNICATION_SCHEMA_VERSION,
    messageId: randomUUID(),
    organizationId: command.organizationId,
    mode: command.mode,
    purpose: command.purpose,
    recipient: command.recipient,
    recipientHash,
    templateId: command.templateId,
    templateVersion: command.templateVersion,
    variables: structuredClone(command.variables),
    ...(command.trigger ? { trigger: structuredClone(command.trigger) } : {}),
    effectId: command.effectId,
    createdAt: now,
  };

  const persisted = await createMessageIntent(intent);
  let record = persisted.record;
  if (!persisted.created && !canAttemptExisting(record)) return { record, submitted: false };

  if (prerequisites.forcedSuppressionReason) {
    record = await updateMessageRecord(command.organizationId, record.intent.messageId, {
      status: "suppressed",
      statusReason: prerequisites.forcedSuppressionReason,
    }, {
      eventType: "communication.suppressed",
      source: "trusted_server",
      reason: prerequisites.forcedSuppressionReason,
    });
    return { record, submitted: false };
  }

  const [template, sender, suppression] = await Promise.all([
    getPublishedCommunicationTemplate(command.organizationId, command.templateId, command.templateVersion),
    getEmailSenderReadiness(command.organizationId),
    getEmailSuppression(recipientHash),
  ]);
  if (!template) {
    record = await updateMessageRecord(command.organizationId, record.intent.messageId, { status: "held", statusReason: "published-template-version-not-found" });
    return { record, submitted: false };
  }

  const eligibility = evaluateEmailEligibility({
    mode: command.mode,
    purpose: command.purpose,
    templatePurpose: template.purpose,
    recipientKind: prerequisites.eligibilityRecipientKind ?? command.recipient.kind,
    recipientAvailable: Boolean(prerequisites.recipientEmail),
    sender,
    consent: prerequisites.consent,
    suppression,
    testAllowlisted: prerequisites.testAllowlisted,
  });
  if (eligibility.outcome !== "eligible") {
    const statusReason = `${eligibility.reason}: ${eligibility.explanation}`;
    record = await updateMessageRecord(command.organizationId, record.intent.messageId, {
      status: eligibility.outcome === "hold" ? "held" : "suppressed",
      statusReason,
    }, eligibility.outcome === "suppress" ? {
      eventType: "communication.suppressed",
      source: "trusted_server",
      reason: statusReason,
    } : undefined);
    return { record, eligibility, submitted: false };
  }

  try {
    renderEmailTemplate({
      content: template.content,
      variables: command.variables,
      trustedOrigins: getCommunicationTrustedOrigins(),
      mode: command.mode === "test" ? "live" : command.mode,
    });
  } catch (error) {
    record = await updateMessageRecord(command.organizationId, record.intent.messageId, {
      status: "held",
      statusReason: error instanceof Error ? `template-render-blocked: ${error.message}` : "template-render-blocked",
    });
    return { record, eligibility, submitted: false };
  }

  const claim = await claimProviderAttempt(command.organizationId, record.intent.messageId);
  if (!claim.claimed) return { record: claim.record, eligibility, submitted: false };
  record = claim.record;
  const { attemptNumber, attemptStartedAt } = claim;

  const result = await provider.send({
    organizationId: command.organizationId,
    to: prerequisites.recipientEmail!,
    purpose: command.purpose,
    templateId: communicationTemplateReference(command.templateId, command.templateVersion),
    variables: providerVariables(command.variables),
  }, {
    organizationId: command.organizationId,
    correlationId: record.intent.messageId,
    idempotencyKey: command.effectId,
    timeoutMs: 10_000,
  });

  const completedAt = new Date().toISOString();
  if (result.ok) {
    const completedAttempt: MessageDeliveryAttempt = {
      attempt: attemptNumber,
      startedAt: attemptStartedAt,
      completedAt,
      outcome: "accepted",
      providerRequestId: result.value.messageId,
    };
    await registerProviderAcceptance({
      organizationId: command.organizationId,
      messageId: record.intent.messageId,
      providerMessageId: result.value.messageId,
      recipientHash,
      acceptedAt: result.value.acceptedAt,
      attempts: [...record.attempts.slice(0, -1), completedAttempt],
    });
    record = await updateMessageRecord(command.organizationId, record.intent.messageId, {});
    return { record, eligibility, submitted: true };
  }

  const ambiguous = result.error.safeDetails?.outcome === "unknown";
  const completedAttempt: MessageDeliveryAttempt = {
    attempt: attemptNumber,
    startedAt: attemptStartedAt,
    completedAt,
    outcome: ambiguous ? "unknown" : result.error.retryable ? "retryable-failure" : "terminal-failure",
    ...(result.meta.providerRequestId ? { providerRequestId: result.meta.providerRequestId } : {}),
    ...(result.error.retryAfterMs ? { retryAfterMs: result.error.retryAfterMs } : {}),
    reason: `${result.error.code}: ${result.error.message}`,
  };
  const statusReason = ambiguous ? "provider-outcome-unknown; no blind retry" : `${result.error.code}: ${result.error.message}`;
  record = await updateMessageRecord(command.organizationId, record.intent.messageId, {
    status: ambiguous ? "unknown" : "failed",
    statusReason,
    attempts: [...record.attempts.slice(0, -1), completedAttempt],
  }, {
    eventType: ambiguous ? "communication.outcome_unknown" : "communication.failed",
    source: "trusted_server",
    idempotencySuffix: `attempt-${attemptNumber}`,
    reason: statusReason,
  });
  return { record, eligibility, submitted: true };
}
