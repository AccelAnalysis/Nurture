import { CONFIGURATION_EXTENSION_KEYS } from "../configuration/extensions";
import type { ConfigurationExtension, ConfigurationJsonObject } from "../configuration/types";

export const LIFECYCLE_ACQUISITION_SCHEMA_VERSION = "1";
export const LIFECYCLE_ACQUISITION_CATALOG_VERSION = "r2-acquisition-v1";
export type LifecycleAutomationId = "R2-WELCOME" | "R2-LEAD" | "R2-ACTIVATE" | "R2-ONBOARD" | "R2-TRIAL" | "R2-CHECKOUT";
export type LifecycleMessagePurpose = "service" | "promotional";
export interface LifecycleTimingChoice { id: string; label: string; description: string; offsetMinutes: number; }
export interface LifecycleConditionChoice { id: string; label: string; description: string; required: boolean; }
export interface LifecycleAutomationCatalogEntry { id: LifecycleAutomationId; label: string; intent: string; triggerLabel: string; messagePurpose: LifecycleMessagePurpose; timingChoices: LifecycleTimingChoice[]; conditionChoices: LifecycleConditionChoice[]; }
export interface LifecycleTemplateSummary { templateId: string; label: string; purpose: LifecycleMessagePurpose; publishedVersion: string; readiness: "ready" | "not-ready" | "unavailable"; readinessExplanation: string; }
export interface LifecycleAutomationConfiguration { automationId: LifecycleAutomationId; enabled: boolean; timingId: string; templateId: string; selectedConditionIds: string[]; }
export type LifecycleConfigurationProvenance = "nurture-default" | "organization-override";
export interface LifecyclePublishedVersion { id: string; version: number; publishedAt: string; automations: LifecycleAutomationConfiguration[]; }
export type LifecycleRunStatus = "scheduled" | "held" | "suppressed" | "cancelled" | "succeeded" | "failed" | "unknown";
export interface LifecycleRunExplanation { runId: string; customerId: string; automationId: LifecycleAutomationId; automationLabel: string; status: LifecycleRunStatus; reason: string; pinnedVersion: string; updatedAt: string; nextActionAt?: string; }
export interface LifecycleWorkspaceSnapshot { organizationId: string; catalogVersion: typeof LIFECYCLE_ACQUISITION_CATALOG_VERSION; catalog: LifecycleAutomationCatalogEntry[]; defaults: LifecycleAutomationConfiguration[]; draft: LifecycleAutomationConfiguration[]; draftRevision: number; published: LifecyclePublishedVersion | null; templates: LifecycleTemplateSummary[]; runHistory: LifecycleRunExplanation[]; outboundActivation: { status: "disabled" | "enabled" | "unavailable"; explanation: string; }; }
export interface LifecycleConfigurationValidationIssue { automationId: LifecycleAutomationId; field: "automation" | "timing" | "template" | "conditions"; message: string; }
export interface LifecycleAutomationPort { getWorkspace(organizationId: string): Promise<LifecycleWorkspaceSnapshot>; saveDraft(organizationId: string, draft: LifecycleAutomationConfiguration[], expectedRevision: number): Promise<LifecycleWorkspaceSnapshot>; publishDraft(organizationId: string, expectedRevision: number): Promise<LifecycleWorkspaceSnapshot>; }

export class LifecycleAutomationUnavailableError extends Error {
  constructor(message = "Lifecycle automation commands are not available from the authoritative runtime yet.") { super(message); this.name = "LifecycleAutomationUnavailableError"; }
}

export function lifecycleConfigurationProvenance(configuration: LifecycleAutomationConfiguration, defaults: LifecycleAutomationConfiguration[]): LifecycleConfigurationProvenance {
  const inherited = defaults.find((item) => item.automationId === configuration.automationId);
  return inherited && JSON.stringify(inherited) === JSON.stringify(configuration) ? "nurture-default" : "organization-override";
}

export function validateLifecycleDraft(catalog: LifecycleAutomationCatalogEntry[], templates: LifecycleTemplateSummary[], draft: LifecycleAutomationConfiguration[]): LifecycleConfigurationValidationIssue[] {
  const issues: LifecycleConfigurationValidationIssue[] = [];
  const catalogIds = new Set(catalog.map((entry) => entry.id));
  for (const automation of draft) {
    const entry = catalog.find((candidate) => candidate.id === automation.automationId);
    if (!entry) { issues.push({ automationId: automation.automationId, field: "automation", message: "This automation is not in the approved Release 2 acquisition catalog." }); continue; }
    if (!entry.timingChoices.some((choice) => choice.id === automation.timingId)) issues.push({ automationId: automation.automationId, field: "timing", message: "Select one of the approved timing choices." });
    const template = templates.find((candidate) => candidate.templateId === automation.templateId);
    if (!template || template.purpose !== entry.messagePurpose) issues.push({ automationId: automation.automationId, field: "template", message: `Select a published ${entry.messagePurpose} template approved for this automation.` });
    const allowedConditions = new Set(entry.conditionChoices.map((condition) => condition.id));
    const selectedConditions = new Set(automation.selectedConditionIds);
    if (automation.selectedConditionIds.some((conditionId) => !allowedConditions.has(conditionId))) issues.push({ automationId: automation.automationId, field: "conditions", message: "The draft contains a condition outside the approved predicate set." });
    for (const condition of entry.conditionChoices.filter((choice) => choice.required)) {
      if (!selectedConditions.has(condition.id)) issues.push({ automationId: automation.automationId, field: "conditions", message: `Required safety condition “${condition.label}” cannot be removed.` });
    }
  }
  for (const missingId of catalogIds) if (!draft.some((item) => item.automationId === missingId)) issues.push({ automationId: missingId, field: "automation", message: "The approved catalog entry is missing from the draft." });
  return issues;
}

export function automationPreviewLines(entry: LifecycleAutomationCatalogEntry, configuration: LifecycleAutomationConfiguration, templates: LifecycleTemplateSummary[]): string[] {
  const timing = entry.timingChoices.find((choice) => choice.id === configuration.timingId);
  const template = templates.find((candidate) => candidate.templateId === configuration.templateId);
  const conditions = entry.conditionChoices.filter((condition) => configuration.selectedConditionIds.includes(condition.id));
  return [
    configuration.enabled ? "Enabled after publication and runtime activation." : "Disabled; no new enrollment should be admitted.",
    `Trigger: ${entry.triggerLabel}.`,
    `Timing: ${timing?.label ?? "Invalid timing"}${timing ? ` — ${timing.description}` : ""}.`,
    `Message: ${template?.label ?? "Invalid template"} (${entry.messagePurpose}).`,
    `Recheck before dispatch: ${conditions.map((condition) => condition.label).join("; ") || "No valid conditions selected"}.`,
  ];
}

export function lifecycleDraftToConfigurationExtension(draft: LifecycleAutomationConfiguration[]): { extensionKey: string; extension: ConfigurationExtension } {
  const automations = draft.map((automation): ConfigurationJsonObject => ({ automationId: automation.automationId, enabled: automation.enabled, timingId: automation.timingId, templateId: automation.templateId, selectedConditionIds: [...automation.selectedConditionIds] }));
  return { extensionKey: CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition, extension: { namespace: "nurture.lifecycle.acquisition", schemaVersion: LIFECYCLE_ACQUISITION_SCHEMA_VERSION, payload: { catalogVersion: LIFECYCLE_ACQUISITION_CATALOG_VERSION, automations } } };
}
