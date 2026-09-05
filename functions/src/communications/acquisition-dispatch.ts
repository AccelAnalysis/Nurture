import type {
  AcquisitionEmailDispatchPort,
  AcquisitionEmailEligibilityInput,
  AcquisitionEmailEligibilityResult,
  AcquisitionEmailSubmitInput,
  AcquisitionEmailSubmitResult,
} from "../../../shared/acquisition/contracts.js";
import type { EmailIntegrationPort } from "../../../shared/platform/integrations.js";
import {
  communicationTemplateIds,
  type CommunicationPurpose,
  type CommunicationTemplateId,
  type CommunicationVariableValues,
  type EmailConsentSnapshot,
  type EmailEligibilityResult,
  type EmailSuppressionSnapshot,
  type MessageDeliveryRecord,
} from "../../../shared/communications/contracts.js";
import { evaluateEmailEligibility } from "../../../shared/communications/eligibility.js";
import { getControlledTestAllowlist } from "./config.js";
import { dispatchEmail } from "./service.js";
import {
  getEmailSenderReadiness,
  getEmailSuppression,
  getPublishedCommunicationTemplate,
  hashRecipientEmail,
  normalizeEmailAddress,
} from "./store.js";

const approvedTemplateIds = new Set<string>(communicationTemplateIds);

export interface CurrentCommunicationConsentFact {
  /** C-owned purpose vocabulary. */
  purpose: "service" | "marketing";
  decision: "granted" | "denied" | "withdrawn" | "unknown";
  source: string;
  recordedAt: string;
  policyVersion?: string;
}

export interface CurrentCommunicationContext {
  /** Opaque C/D-scoped recipient reference, never an email address. */
  recipientRef: string;
  /** Resolved server-side for the current subject; never supplied by Track E/browser authority. */
  recipientEmail?: string;
  /** Current C-owned channel/purpose fact. Missing C fact must be represented as unknown. */
  consent: CurrentCommunicationConsentFact;
  /** Current authoritative values assembled from the owning C/A/B/commercial domains. */
  variables: CommunicationVariableValues;
}

/**
 * Final composition supplies this adapter from C plus the authoritative public,
 * Experience and commercial readers. D owns how those facts are interpreted for
 * email eligibility; E never receives the raw address or consent object.
 */
export interface CurrentCommunicationContextPort {
  readCurrent(input: AcquisitionEmailEligibilityInput): Promise<CurrentCommunicationContext>;
}

export function requireApprovedCommunicationTemplateId(value: string): CommunicationTemplateId {
  if (!approvedTemplateIds.has(value)) throw new Error("Template is not in the approved Release 2 communication catalog.");
  return value as CommunicationTemplateId;
}

export function adaptCurrentConsent(
  fact: CurrentCommunicationConsentFact,
  acquisitionPurpose: CommunicationPurpose,
): EmailConsentSnapshot {
  const expectedPurpose = acquisitionPurpose === "transactional" ? "service" : "marketing";
  if (fact.purpose !== expectedPurpose) {
    return {
      decision: "unknown",
      purpose: acquisitionPurpose,
      source: "purpose-mismatch",
      observedAt: fact.recordedAt,
      policyVersion: fact.policyVersion,
    };
  }
  return {
    decision: fact.decision === "granted" ? "granted" : fact.decision === "unknown" ? "unknown" : "denied",
    purpose: acquisitionPurpose,
    source: fact.source,
    observedAt: fact.recordedAt,
    policyVersion: fact.policyVersion,
  };
}

export function mapEligibilityForAcquisition(result: EmailEligibilityResult, checkedAt: string): AcquisitionEmailEligibilityResult {
  if (result.outcome === "eligible") return { status: "eligible", checkedAt, recipientRef: "resolved-later", reason: result.explanation };
  const code = result.reason === "sender-not-ready"
    ? "sender-not-ready" as const
    : result.reason === "test-recipient-not-allowlisted" || result.reason === "test-recipient-required"
      ? "test-recipient-not-allowlisted" as const
      : result.reason === "provider-suppressed"
        ? "suppression" as const
        : result.reason === "recipient-unavailable"
          ? "recipient-unavailable" as const
          : result.reason === "consent-unknown" || result.reason === "consent-withdrawn" || result.reason === "purpose-mismatch"
            ? "consent" as const
            : "unknown" as const;
  return { status: result.outcome === "hold" ? "hold" : "suppress", checkedAt, reason: result.explanation, code };
}

interface EvaluatedContext {
  checkedAt: string;
  context: CurrentCommunicationContext;
  templateId: CommunicationTemplateId;
  templateVersion: number;
  purpose: CommunicationPurpose;
  eligibility: EmailEligibilityResult;
}

async function evaluateCurrentContext(
  source: CurrentCommunicationContextPort,
  input: AcquisitionEmailEligibilityInput,
): Promise<EvaluatedContext> {
  const checkedAt = new Date().toISOString();
  const templateId = requireApprovedCommunicationTemplateId(input.templateId);
  const templateVersion = input.templateVersion;
  if (!Number.isSafeInteger(templateVersion) || templateVersion < 1) throw new Error("Track D requires a positive immutable published template version.");
  const purpose = input.purpose;
  const context = await source.readCurrent(input);
  const recipientEmail = context.recipientEmail?.trim();
  const recipientHash = recipientEmail ? hashRecipientEmail(recipientEmail) : null;
  const [template, sender, suppression] = await Promise.all([
    getPublishedCommunicationTemplate(input.organizationId, templateId, templateVersion),
    getEmailSenderReadiness(input.organizationId),
    recipientHash
      ? getEmailSuppression(recipientHash)
      : Promise.resolve({ suppressed: false, scope: "none", observedAt: checkedAt } satisfies EmailSuppressionSnapshot),
  ]);

  if (!template) {
    return {
      checkedAt,
      context,
      templateId,
      templateVersion,
      purpose,
      eligibility: { outcome: "hold", reason: "recipient-unavailable", explanation: "The pinned published communication template version is unavailable." },
    };
  }

  const eligibility = evaluateEmailEligibility({
    mode: input.dataMode,
    purpose,
    templatePurpose: template.purpose,
    recipientKind: input.dataMode === "test" ? "test" : input.subjectKind,
    recipientAvailable: Boolean(recipientEmail),
    sender,
    consent: adaptCurrentConsent(context.consent, input.purpose),
    suppression,
    testAllowlisted: recipientEmail ? getControlledTestAllowlist().has(normalizeEmailAddress(recipientEmail)) : false,
  });
  return { checkedAt, context, templateId, templateVersion, purpose, eligibility };
}

function providerRequestId(record: MessageDeliveryRecord) {
  return record.attempts[record.attempts.length - 1]?.providerRequestId;
}

function acceptedSubmission(record: MessageDeliveryRecord): AcquisitionEmailSubmitResult {
  return {
    status: "provider-accepted",
    acceptedAt: record.acceptedAt ?? record.updatedAt,
    messageId: record.providerMessageId ?? record.intent.messageId,
    ...(providerRequestId(record) ? { providerRequestId: providerRequestId(record) } : {}),
  };
}

function mapRecordToSubmission(record: MessageDeliveryRecord): AcquisitionEmailSubmitResult {
  if (record.status === "accepted" || record.status === "delivered" || record.status === "deferred" || record.status === "bounced" || record.status === "dropped" || record.status === "complained" || record.status === "unsubscribed") {
    return acceptedSubmission(record);
  }
  if (record.status === "unknown" || record.status === "submitting") {
    return {
      status: "unknown-outcome",
      reason: record.statusReason ?? "Provider outcome is unknown; do not blindly retry.",
      ...(providerRequestId(record) ? { providerRequestId: providerRequestId(record) } : {}),
    };
  }
  if (record.status === "suppressed" || record.status === "held" || record.status === "cancelled") {
    return { status: "suppressed", reason: record.statusReason ?? `Communication ${record.status}.` };
  }
  const attempt = record.attempts[record.attempts.length - 1];
  if (record.status === "failed" && attempt?.outcome === "retryable-failure") {
    return {
      status: "retryable-failure",
      reason: attempt.reason ?? record.statusReason ?? "Provider request failed before observed acceptance.",
      ...(attempt.retryAfterMs ? { retryAfterSeconds: Math.max(1, Math.ceil(attempt.retryAfterMs / 1_000)) } : {}),
      ...(attempt.providerRequestId ? { providerRequestId: attempt.providerRequestId } : {}),
    };
  }
  return {
    status: "permanent-failure",
    reason: record.statusReason ?? attempt?.reason ?? "Communication failed before provider acceptance.",
    ...(attempt?.providerRequestId ? { providerRequestId: attempt.providerRequestId } : {}),
  };
}

function dispatchCommand(input: AcquisitionEmailSubmitInput, evaluated: EvaluatedContext) {
  return {
    organizationId: input.organizationId,
    effectId: input.idempotencyKey || input.effectId,
    mode: input.dataMode,
    purpose: evaluated.purpose,
    recipient: { kind: input.subjectKind, id: input.subjectId },
    templateId: evaluated.templateId,
    templateVersion: evaluated.templateVersion,
    variables: evaluated.context.variables,
    trigger: { eventId: input.correlationId, runId: input.automationVersionId },
  } as const;
}

/**
 * Track D implementation of E's canonical AcquisitionEmailDispatchPort. `submit`
 * re-reads context and runs D's evaluator again after E has persisted its
 * provider-submission ambiguity barrier.
 */
export function createAcquisitionEmailDispatchAdapter(
  source: CurrentCommunicationContextPort,
  provider?: EmailIntegrationPort,
): AcquisitionEmailDispatchPort {
  return {
    async evaluate(input: AcquisitionEmailEligibilityInput): Promise<AcquisitionEmailEligibilityResult> {
      if (input.dataMode === "preview" || input.dataMode === "demo" || input.dataMode === "development") {
        // E records these modes as dry-run immediately after evaluate and never calls submit.
        return { status: "eligible", checkedAt: new Date().toISOString(), recipientRef: `dry-run:${input.subjectKind}:${input.subjectId}` };
      }
      try {
        const evaluated = await evaluateCurrentContext(source, input);
        const mapped = mapEligibilityForAcquisition(evaluated.eligibility, evaluated.checkedAt);
        return mapped.status === "eligible" ? { ...mapped, recipientRef: evaluated.context.recipientRef } : mapped;
      } catch (error) {
        return {
          status: "hold",
          checkedAt: new Date().toISOString(),
          reason: error instanceof Error ? error.message : "Current communication eligibility could not be resolved.",
          code: "unknown",
        };
      }
    },

    async submit(input: AcquisitionEmailSubmitInput): Promise<AcquisitionEmailSubmitResult> {
      // Never trust the earlier evaluate result as current permission. Re-read C/D
      // facts after E's ambiguity barrier and immediately before provider dispatch.
      let evaluated: EvaluatedContext;
      try {
        evaluated = await evaluateCurrentContext(source, input);
      } catch (error) {
        return { status: "suppressed", reason: error instanceof Error ? error.message : "Final communication eligibility could not be resolved." };
      }

      const recipientEmail = evaluated.context.recipientEmail;
      const testAllowlisted = input.dataMode === "test" && recipientEmail
        ? getControlledTestAllowlist().has(normalizeEmailAddress(recipientEmail))
        : undefined;
      const prerequisites = {
        recipientEmail,
        consent: adaptCurrentConsent(evaluated.context.consent, input.purpose),
        testAllowlisted,
        eligibilityRecipientKind: input.dataMode === "test" ? "test" as const : input.subjectKind,
      };

      const recipientChanged = evaluated.context.recipientRef !== input.recipientRef;
      const result = await dispatchEmail(
        dispatchCommand(input, evaluated),
        recipientChanged
          ? { ...prerequisites, forcedSuppressionReason: "recipient-reference-changed-after-initial-eligibility" }
          : prerequisites,
        provider,
      );
      return mapRecordToSubmission(result.record);
    },
  };
}
