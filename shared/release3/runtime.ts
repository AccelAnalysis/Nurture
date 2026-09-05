import type {
  AutomationDefinitionV3,
  CommercialServicingSummary,
  ConditionGroup,
  ContactabilitySummary,
  RecoveryCommand,
  RecoveryCommandResult,
  Release3ReasonCode,
  RulePredicate,
  SegmentFact,
  SegmentFactValue,
  TreatmentAdmissionDecision,
} from "./contracts.js";
import { buildLogicalEffectId, modeMayCreateExternalEffect } from "./contracts.js";

export interface TreatmentExecutionHistory {
  runId: string;
  automationId: string;
  automationVersion: number;
  kind: AutomationDefinitionV3["kind"];
  priority: AutomationDefinitionV3["conflict"]["priority"];
  conflictGroup?: string;
  state: "scheduled" | "eligible" | "executing" | "succeeded" | "suppressed" | "cancelled" | "retrying" | "failed" | "held";
  channel?: "email" | "in-app";
  createdAt: string;
  completedAt?: string;
}

export interface AdmissionContext {
  now: string;
  organizationPaused: boolean;
  automationPaused: boolean;
  facts: SegmentFact[];
  contactability?: ContactabilitySummary;
  commercial: CommercialServicingSummary;
  priorRuns: TreatmentExecutionHistory[];
  competingRuns: TreatmentExecutionHistory[];
  lastQualifiedAt?: string;
}

function scalarCompare(left: SegmentFactValue, right: SegmentFactValue | undefined, op: RulePredicate["operator"]): boolean {
  if (op === "exists") return left !== null && left !== undefined;
  if (right === undefined) return false;
  if (op === "eq") return Array.isArray(left) ? left.includes(String(right)) : left === right;
  if (op === "neq") return Array.isArray(left) ? !left.includes(String(right)) : left !== right;
  if (op === "in") return Array.isArray(right) ? right.includes(String(left)) : false;
  if (op === "not-in") return Array.isArray(right) ? !right.includes(String(left)) : false;
  if (typeof left !== "number" || typeof right !== "number") return false;
  if (op === "gt") return left > right;
  if (op === "gte") return left >= right;
  if (op === "lt") return left < right;
  if (op === "lte") return left <= right;
  return false;
}

export function evaluatePredicate(predicate: RulePredicate, facts: SegmentFact[]): boolean {
  const matching = facts.filter((fact) => fact.key === predicate.fact);
  if (predicate.operator === "exists") return matching.some((fact) => scalarCompare(fact.value, predicate.value, predicate.operator));
  return matching.some((fact) => scalarCompare(fact.value, predicate.value, predicate.operator));
}

export function evaluateConditionGroup(group: ConditionGroup | undefined, facts: SegmentFact[]): boolean {
  if (!group || group.predicates.length === 0) return true;
  return group.mode === "all"
    ? group.predicates.every((predicate) => evaluatePredicate(predicate, facts))
    : group.predicates.some((predicate) => evaluatePredicate(predicate, facts));
}

function inHours(now: string, then: string): number { return Math.max(0, (Date.parse(now) - Date.parse(then)) / 3_600_000); }
function sameUtcDay(left: string, right: string) { return left.slice(0, 10) === right.slice(0, 10); }
function withinDays(now: string, then: string, days: number) { return Date.parse(then) >= Date.parse(now) - days * 86_400_000; }

const priorityRank: Record<AutomationDefinitionV3["conflict"]["priority"], number> = {
  "critical-service": 4,
  service: 3,
  retention: 2,
  promotion: 1,
};

export function evaluateTreatmentAdmission(definition: AutomationDefinitionV3, context: AdmissionContext): TreatmentAdmissionDecision {
  const reasons: Release3ReasonCode[] = [];
  if (!definition.enabled || context.automationPaused) reasons.push("automation-paused");
  if (context.organizationPaused) reasons.push("organization-paused");
  if (definition.expiresAt && definition.expiresAt <= context.now) reasons.push("expired");
  if (!evaluateConditionGroup(definition.audience, context.facts)) reasons.push("unknown-required-fact");
  if (definition.stopConditions && evaluateConditionGroup(definition.stopConditions, context.facts)) reasons.push("superseded");

  const isPromotion = definition.kind === "upsell" || definition.kind === "win-back" || definition.kind === "re-engagement" || definition.kind === "referral";
  if (isPromotion && context.commercial.cancellation.status !== "none") reasons.push("cancellation-conflict");
  if (definition.kind === "upsell" && (context.commercial.paymentHealth === "failed" || context.commercial.paymentHealth === "recovering")) reasons.push("payment-health-conflict");
  if (definition.kind === "renewal" && context.commercial.subscriptionState !== "active" && context.commercial.subscriptionState !== "trialing") reasons.push("commercial-state-conflict");
  if (definition.kind === "payment-recovery" && context.commercial.paymentHealth !== "failed") reasons.push("payment-health-conflict");
  if (definition.kind === "win-back" && context.commercial.subscriptionState !== "canceled") reasons.push("commercial-state-conflict");
  if (definition.kind === "re-engagement" && !context.facts.some((fact) => fact.key === "engagement.state" && fact.value === "inactive")) reasons.push("engagement-state-conflict");

  const actionRequiresContactability = definition.branches.some((branch) => branch.actions.some((action) => action.type === "email"));
  if (actionRequiresContactability) {
    if (!context.contactability || context.contactability.state !== "eligible") reasons.push(...(context.contactability?.reasons ?? ["consent-missing"]));
  }

  const priorForDefinition = context.priorRuns.filter((run) => run.automationId === definition.id && run.automationVersion === definition.version);
  if (definition.reentry.kind === "once-per-customer" && priorForDefinition.some((run) => ["succeeded", "executing", "eligible", "scheduled"].includes(run.state))) reasons.push("reentry-not-allowed");
  if (definition.reentry.kind === "after-cooldown" && definition.reentry.cooldownHours) {
    const latest = [...priorForDefinition].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (latest && inHours(context.now, latest.createdAt) < definition.reentry.cooldownHours) reasons.push("cooldown-active");
  }
  if (definition.reentry.kind === "after-requalification" && context.lastQualifiedAt) {
    const latest = [...priorForDefinition].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (latest && context.lastQualifiedAt <= latest.createdAt) reasons.push("reentry-not-allowed");
  }

  const customerPerDay = definition.conflict.caps.customerPerDay;
  if (customerPerDay !== undefined && context.priorRuns.filter((run) => sameUtcDay(run.createdAt, context.now) && run.state !== "suppressed" && run.state !== "cancelled").length >= customerPerDay) reasons.push("frequency-cap-reached");
  const customerPerWeek = definition.conflict.caps.customerPerWeek;
  if (customerPerWeek !== undefined && context.priorRuns.filter((run) => withinDays(context.now, run.createdAt, 7) && run.state !== "suppressed" && run.state !== "cancelled").length >= customerPerWeek) reasons.push("frequency-cap-reached");
  const channelCap = definition.conflict.caps.channelPerDay;
  if (channelCap !== undefined && context.contactability && context.priorRuns.filter((run) => run.channel === context.contactability?.channel && sameUtcDay(run.createdAt, context.now) && run.state !== "suppressed" && run.state !== "cancelled").length >= channelCap) reasons.push("frequency-cap-reached");

  const conflicting = context.competingRuns.filter((run) => run.state === "scheduled" || run.state === "eligible" || run.state === "executing").filter((run) => definition.conflict.group && run.conflictGroup === definition.conflict.group);
  if (conflicting.some((run) => priorityRank[run.priority] >= priorityRank[definition.conflict.priority])) reasons.push("conflict-group-blocked");

  const unique = [...new Set(reasons)];
  return { allowed: unique.length === 0, reasons: unique.length ? unique : ["allowed"], evaluatedAt: context.now, policyVersion: 1, ...(conflicting.length ? { competingRunIds: conflicting.map((run) => run.runId) } : {}) };
}

export function planEffects(input: {
  definition: AutomationDefinitionV3;
  customerId: string;
  triggerId: string;
  facts: SegmentFact[];
}): Array<{ branchId: string; actionIndex: number; effectId: string; action: AutomationDefinitionV3["branches"][number]["actions"][number] }> {
  const branch = input.definition.branches.find((candidate) => evaluateConditionGroup(candidate.when, input.facts));
  if (!branch) return [];
  return branch.actions.map((action, actionIndex) => ({
    branchId: branch.id,
    actionIndex,
    effectId: buildLogicalEffectId({ organizationId: input.definition.organizationId, customerId: input.customerId, automationId: input.definition.id, automationVersion: input.definition.version, triggerId: input.triggerId, branchId: branch.id, actionIndex }),
    action,
  }));
}

export function evaluateRecoveryCommand(input: {
  command: RecoveryCommand;
  knownEffect?: { effectId: string; state: "pending" | "submitted" | "confirmed" | "failed" | "ambiguous"; reversible: boolean };
  authorized: boolean;
}): RecoveryCommandResult {
  const commandId = `${input.command.organizationId}:${input.command.type}:${input.command.runId ?? input.command.automationId ?? input.command.effectId ?? "scope"}`;
  if (!input.authorized) return { accepted: false, reason: "unauthorized", commandId };
  if (!modeMayCreateExternalEffect(input.command.mode) && input.command.type === "safe-retry") return { accepted: false, reason: "mode-not-allowed", commandId };
  if (input.command.type === "safe-retry") {
    if (!input.knownEffect || input.knownEffect.effectId !== input.command.effectId) return { accepted: false, reason: "unsafe-retry", commandId };
    if (input.knownEffect.state === "ambiguous" || input.knownEffect.state === "submitted") return { accepted: false, reason: "ambiguous-provider-outcome", commandId, effectId: input.knownEffect.effectId };
    if (input.knownEffect.state === "confirmed") return { accepted: false, reason: "superseded", commandId, effectId: input.knownEffect.effectId };
    return { accepted: true, reason: "allowed", commandId, effectId: input.knownEffect.effectId, outcome: "retrying" };
  }
  if (input.command.type === "reconcile") return { accepted: true, reason: "allowed", commandId, effectId: input.command.effectId, outcome: "reconciled" };
  if (input.command.type === "pause") return { accepted: true, reason: "allowed", commandId, outcome: "paused" };
  if (input.command.type === "resume") return { accepted: true, reason: "allowed", commandId, outcome: "resumed" };
  if (input.command.type === "cancel-run") return { accepted: true, reason: "allowed", commandId, outcome: "cancelled" };
  if (input.command.type === "re-evaluate") return { accepted: true, reason: "allowed", commandId, outcome: "re-evaluated" };
  if (input.command.type === "dry-run") return { accepted: true, reason: "allowed", commandId, outcome: "dry-run-complete" };
  return { accepted: true, reason: "allowed", commandId, outcome: "projection-replayed" };
}
