import { createHash } from "node:crypto";
import type { FeedbackScope, ReferralProgramDraft, SurveyDraft } from "../../../shared/feedback/contracts.js";
import { id } from "../../../shared/feedback/validation.js";
import type { AuditRecord } from "../../../shared/platform/audit.js";
import type { AutomationDefinitionV3, InAppTreatmentAction } from "../../../shared/release3/contracts.js";
import { db } from "../firebase.js";

function automationId(kind: "survey" | "program", entityId: string) {
  return `r4-${kind === "survey" ? "survey" : "referral"}-${id(entityId)}`;
}
function defaultSurveyTrigger(draft: SurveyDraft) {
  switch (draft.kind) {
    case "nps": return { eventType: "subscription.renewed", delayMinutes: 10_080 };
    case "cancellation-feedback": return { eventType: "subscription.cancelled", delayMinutes: 0 };
    case "data-gathering":
    case "research": return { eventType: "experience.milestone_reached", delayMinutes: 0 };
    case "onboarding-feedback": return { eventType: "onboarding.completed", delayMinutes: 0 };
    default: return { eventType: "onboarding.completed", delayMinutes: 1_440 };
  }
}
function feedbackAction(kind: "survey" | "program", entityId: string): InAppTreatmentAction {
  return {
    type: "in-app",
    templateId: entityId,
    templateVersion: 1,
    placementId: "participant-home",
    purpose: kind === "program" ? "promotional" : "transactional",
  };
}
function defaultDefinition(scope: FeedbackScope, kind: "survey" | "program", entityId: string, draft: SurveyDraft | ReferralProgramDraft, version: number): AutomationDefinitionV3 {
  const surveyTrigger = kind === "survey" ? defaultSurveyTrigger(draft as SurveyDraft) : null;
  return {
    id: automationId(kind, entityId),
    organizationId: scope.organizationId,
    version,
    name: kind === "survey" ? `Survey invitation · ${(draft as SurveyDraft).title}` : `Referral invitation · ${(draft as ReferralProgramDraft).title}`,
    kind: kind === "survey" ? "survey" : "referral",
    trigger: { eventType: surveyTrigger?.eventType ?? "survey.nps.promoter", schemaVersion: 1 },
    branches: [{ id: "feedback-presentation", actions: [feedbackAction(kind, entityId)] }],
    delayMinutes: surveyTrigger?.delayMinutes ?? 0,
    reentry: { kind: "after-cooldown", cooldownHours: draft.cooldownHours },
    conflict: {
      group: "feedback-invitation",
      priority: kind === "program" ? "promotion" : "service",
      caps: { customerPerDay: 1, customerPerWeek: kind === "program" ? 1 : 2, channelPerDay: 1 },
    },
    mode: "test",
    enabled: false,
  };
}
function refreshDefinition(prior: AutomationDefinitionV3 | undefined, scope: FeedbackScope, kind: "survey" | "program", entityId: string, draft: SurveyDraft | ReferralProgramDraft, version: number): AutomationDefinitionV3 {
  const expectedKind = kind === "survey" ? "survey" : "referral";
  if (!prior || prior.organizationId !== scope.organizationId || prior.kind !== expectedKind) return defaultDefinition(scope, kind, entityId, draft, version);
  let replaced = false;
  const branches = prior.branches.map(branch => ({
    ...branch,
    actions: branch.actions.map(action => {
      if (!replaced && action.type === "in-app") {
        replaced = true;
        return { ...action, templateId: entityId, purpose: kind === "program" ? "promotional" as const : action.purpose };
      }
      return action;
    }),
  }));
  if (!replaced) branches.push({ id: "feedback-presentation", actions: [feedbackAction(kind, entityId)] });
  return {
    ...prior,
    id: automationId(kind, entityId),
    organizationId: scope.organizationId,
    version,
    kind: expectedKind,
    name: prior.name || (kind === "survey" ? `Survey invitation · ${(draft as SurveyDraft).title}` : `Referral invitation · ${(draft as ReferralProgramDraft).title}`),
    branches,
  };
}

/**
 * Refreshes only the Release 3 DRAFT. Published automation behavior is preserved
 * until an authorized administrator explicitly publishes the new R3 version.
 */
export async function syncFeedbackAutomationDraft(
  scope: FeedbackScope,
  kind: "survey" | "program",
  entityId: string,
  feedbackVersionId: string,
  draft: SurveyDraft | ReferralProgramDraft,
  actorUid: string,
): Promise<void> {
  const idValue = automationId(kind, entityId);
  const reference = db.collection("organizations").doc(scope.organizationId).collection("release3AutomationDefinitions").doc(idValue);
  const now = new Date().toISOString();
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(reference);
    const record = existing.data() ?? {};
    const priorDraft = record.draftDefinition as AutomationDefinitionV3 | undefined;
    const priorPublished = record.publishedDefinition as AutomationDefinitionV3 | undefined;
    const nextVersion = Math.max(Number(priorDraft?.version ?? 0), Number(priorPublished?.version ?? 0)) + 1;
    const nextDraft = refreshDefinition(priorDraft ?? priorPublished, scope, kind, entityId, draft, nextVersion);
    transaction.set(reference, {
      ...record,
      organizationId: scope.organizationId,
      draftDefinition: nextDraft,
      release4FeedbackVersionId: feedbackVersionId,
      updatedAt: now,
      updatedBy: actorUid,
    }, { merge: false });

    const auditKey = `${scope.organizationId}:${idValue}:${feedbackVersionId}:r3-draft-sync`;
    const auditId = `r4_${createHash("sha256").update(auditKey).digest("hex")}`;
    const audit: AuditRecord = {
      schemaVersion: 1,
      id: auditId,
      action: "feedback.automation_draft_synced",
      scope: { kind: "organization", organizationId: scope.organizationId },
      target: { type: "lifecycle-automation", id: idValue, organizationId: scope.organizationId, versionId: String(nextVersion) },
      metadata: { feedbackEntityId: entityId, feedbackVersionId, feedbackKind: kind, enabled: nextDraft.enabled, mode: nextDraft.mode },
      correlationId: auditKey,
      idempotencyKey: auditKey,
      actor: { kind: "user", id: actorUid },
      occurredAt: now,
      receivedAt: now,
      source: "cloud-function",
    };
    transaction.set(db.collection("organizations").doc(scope.organizationId).collection("auditEvents").doc(auditId), audit, { merge: false });
  });
}
