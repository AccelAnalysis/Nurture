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
}

export interface DispatchEmailResult {
  record: MessageDeliveryRecord;
  eligibility?: EmailEligibilityResult;
  submitted: boolean;
}

const MAX_PROVIDER_ATTEMPTS = 3;

function lastAttempt(record: MessageDeliveryRecord) {
  return record.attempts[record.attempts.length - 1];
}

function canAttemptExisting(record: MessageDeliveryRecord) {
  if (record.status === "planned") return true;
  const last = lastAttempt(record);
  return record.status === "failed" && last?.outcome === "retryable-failure" && record.attempts.length < MAX_PROVIDER_ATTEMPTS;
}

function providerVariables(values: CommunicationVariableValues) {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
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
  if (!persisted.created && record.status === "submitting") {
    record = await updateMessageRecord(command.organizationId, record.intent.messageId, {
      status: "unknown",
      statusReason: "prior-attempt-was-submitting; operator/provider reconciliation required before retry",
    });
    return { record, submitted: false };
  }
  if (!persisted.created && !canAttemptExisting(record)) return { record, submitted: false };

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
    recipientKind: command.recipient.kind,
    recipientAvailable: Boolean(prerequisites.recipientEmail),
    sender,
    consent: prerequisites.consent,
    suppression,
    testAllowlisted: prerequisites.testAllowlisted,
  });
  if (eligibility.outcome !== "eligible") {
    record = await updateMessageRecord(command.organizationId, record.intent.messageId, {
      status: eligibility.outcome === "hold" ? "held" : "suppressed",
      statusReason: `${eligibility.reason}: ${eligibility.explanation}`,
    });
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

  const attemptNumber = record.attempts.length + 1;
  const attemptStartedAt = new Date().toISOString();
  const pendingAttempt: MessageDeliveryAttempt = { attempt: attemptNumber, startedAt: attemptStartedAt, outcome: "unknown" };
  record = await updateMessageRecord(command.organizationId, record.intent.messageId, {
    status: "submitting",
    statusReason: `provider-attempt-${attemptNumber}-started`,
    attempts: [...record.attempts, pendingAttempt],
  });

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
  record = await updateMessageRecord(command.organizationId, record.intent.messageId, {
    status: ambiguous ? "unknown" : "failed",
    statusReason: ambiguous ? "provider-outcome-unknown; no blind retry" : `${result.error.code}: ${result.error.message}`,
    attempts: [...record.attempts.slice(0, -1), completedAttempt],
  });
  return { record, eligibility, submitted: true };
}
