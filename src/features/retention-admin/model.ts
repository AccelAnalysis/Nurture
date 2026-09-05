import type {
  AutomationDefinitionV3,
  ContactabilitySummary,
  EngagementProjection,
  CommercialServicingSummary,
  RecoveryCommand,
  RecoveryCommandResult,
  Release3ReasonCode,
  SegmentFactKey,
  TreatmentAction,
} from "../../../shared/release3/contracts";

export interface LifecycleStudioCatalog {
  triggers: Array<{ eventType: string; label: string; trustedOnly?: boolean }>;
  segmentFacts: Array<{ key: SegmentFactKey; label: string }>;
  actions: Array<{ type: TreatmentAction["type"]; label: string }>;
  placementIds: Array<{ id: string; label: string }>;
  messageTemplates: Array<{ id: string; version: number; channel: "email" | "in-app"; label: string }>;
  offerIds: Array<{ id: string; version: number; label: string }>;
}

export interface LifecycleRunSummary {
  runId: string;
  automationId: string;
  automationVersion: number;
  customerId: string;
  state: "scheduled" | "eligible" | "executing" | "succeeded" | "suppressed" | "cancelled" | "retrying" | "failed" | "held";
  nextStepAt?: string;
  reasons: Release3ReasonCode[];
  effectIds: string[];
  updatedAt: string;
}

export interface CustomerRetentionSnapshot {
  organizationId: string;
  customerId: string;
  engagement: EngagementProjection;
  commercial: CommercialServicingSummary;
  contactability: ContactabilitySummary[];
  activeRuns: LifecycleRunSummary[];
  cooldowns: Array<{ key: string; until: string }>;
  timeline: Array<{ id: string; occurredAt: string; label: string; detail?: string; source: string }>;
}

export interface LifecycleStudioPort {
  loadCatalog(organizationId: string): Promise<LifecycleStudioCatalog>;
  loadDefinitions(organizationId: string): Promise<AutomationDefinitionV3[]>;
  saveDraft(definition: AutomationDefinitionV3): Promise<{ version: number }>;
  dryRun(definition: AutomationDefinitionV3, customerId?: string): Promise<{ eligible: boolean; reasons: Release3ReasonCode[] }>;
  publish(organizationId: string, automationId: string, expectedDraftVersion: number): Promise<{ publishedVersion: number }>;
  loadCustomerSnapshot(organizationId: string, customerId: string): Promise<CustomerRetentionSnapshot>;
  executeRecovery(command: RecoveryCommand): Promise<RecoveryCommandResult>;
}

export interface DefinitionValidation {
  valid: boolean;
  errors: string[];
}

export function validateDefinition(definition: AutomationDefinitionV3): DefinitionValidation {
  const errors: string[] = [];
  if (!definition.id.trim()) errors.push("Automation ID is required.");
  if (!definition.organizationId.trim()) errors.push("Organization scope is required.");
  if (!definition.name.trim()) errors.push("Name is required.");
  if (!definition.trigger.eventType.trim()) errors.push("A registered trigger is required.");
  if (definition.branches.length === 0) errors.push("At least one branch is required.");
  if (definition.branches.some((branch) => branch.actions.length === 0)) errors.push("Every branch requires at least one approved action.");
  if (definition.reentry.kind === "after-cooldown" && (!definition.reentry.cooldownHours || definition.reentry.cooldownHours <= 0)) {
    errors.push("Cooldown re-entry requires a positive cooldown.");
  }
  if (definition.delayMinutes !== undefined && definition.delayMinutes < 0) errors.push("Delay cannot be negative.");
  if (definition.mode === "live" && !definition.enabled) errors.push("A live definition must be explicitly enabled before publish.");
  return { valid: errors.length === 0, errors };
}

const factLabels: Record<SegmentFactKey, string> = {
  "customer.tenure_days": "customer tenure",
  "subscription.state": "subscription state",
  "subscription.offer_id": "current offer",
  "capability.present": "capability present",
  "capability.absent": "capability absent",
  "experience.milestone": "validated Experience milestone",
  "engagement.state": "meaningful engagement state",
  "engagement.inactive_hours": "meaningful inactivity duration",
  "renewal.within_days": "renewal window",
  "payment.health": "payment health",
  "cancellation.status": "cancellation state",
  "treatment.last_outcome": "prior treatment outcome",
  "communication.eligibility": "communication eligibility",
};

export function explainDefinition(definition: AutomationDefinitionV3): string {
  const audience = definition.audience?.predicates.length
    ? ` when ${definition.audience.predicates.map((predicate) => `${factLabels[predicate.fact]} ${predicate.operator}${predicate.value === undefined ? "" : ` ${String(predicate.value)}`}`).join(definition.audience.mode === "all" ? " and " : " or ")}`
    : "";
  const delay = definition.delayMinutes ? ` Wait ${definition.delayMinutes} minute${definition.delayMinutes === 1 ? "" : "s"}.` : "";
  const actions = definition.branches.flatMap((branch) => branch.actions.map((action) => action.type)).join(", ");
  const cooldown = definition.reentry.cooldownHours ? ` Re-entry cooldown: ${definition.reentry.cooldownHours} hours.` : "";
  const conflict = definition.conflict.group ? ` Conflict group: ${definition.conflict.group}; priority ${definition.conflict.priority}.` : ` Priority ${definition.conflict.priority}.`;
  return `After ${definition.trigger.eventType}${audience}.${delay} Use approved action(s): ${actions || "none"}. Re-entry: ${definition.reentry.kind}.${cooldown}${conflict} Eligibility and safety are rechecked before every effect.`;
}
