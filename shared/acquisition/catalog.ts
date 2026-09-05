import { isSourceAllowedForEvent } from "../analytics/core.js";
import type { LifecycleEventSource } from "../analytics/contracts.js";
import {
  ACQUISITION_AUTOMATION_SCHEMA_VERSION,
  MAX_ACQUISITION_DELAY_SECONDS,
  MAX_ACQUISITION_EXPIRATION_SECONDS,
  MAX_ACQUISITION_STEPS,
  type AcquisitionAutomationDefinition,
  type AcquisitionCatalogId,
  type AcquisitionPredicateKey,
  type AcquisitionStopRule,
} from "./contracts.js";

export interface AcquisitionCatalogDescriptor {
  id: AcquisitionCatalogId;
  triggerEventType: AcquisitionAutomationDefinition["triggerEventType"];
  allowedTriggerSources: readonly LifecycleEventSource[];
  requiredPredicates: readonly AcquisitionPredicateKey[];
  allowedPredicates: readonly AcquisitionPredicateKey[];
  requiredStopRules: readonly AcquisitionStopRule[];
  allowedStopRules: readonly AcquisitionStopRule[];
  allowedScheduleKinds: readonly AcquisitionAutomationDefinition["steps"][number]["schedule"]["kind"][];
}

/**
 * Release 2 is intentionally a small approved catalog, not a general workflow
 * language. Timing, template versions, and the subset of approved optional
 * predicates remain organization configurable.
 */
export const ACQUISITION_CATALOG: Readonly<Record<AcquisitionCatalogId, AcquisitionCatalogDescriptor>> = {
  "R2-WELCOME": {
    id: "R2-WELCOME",
    triggerEventType: "registration.completed",
    allowedTriggerSources: ["domain_action", "trusted_server"],
    requiredPredicates: ["subject.active", "registration.completed"],
    allowedPredicates: ["subject.active", "registration.completed", "onboarding.incomplete"],
    requiredStopRules: ["subject.deleted"],
    allowedStopRules: ["subject.deleted", "onboarding.completed"],
    allowedScheduleKinds: ["after-trigger"],
  },
  "R2-LEAD": {
    id: "R2-LEAD",
    triggerEventType: "lead.created",
    allowedTriggerSources: ["domain_action", "trusted_server"],
    requiredPredicates: ["subject.active", "registration.incomplete"],
    allowedPredicates: ["subject.active", "registration.incomplete"],
    requiredStopRules: ["subject.deleted", "registration.completed"],
    allowedStopRules: ["subject.deleted", "registration.completed"],
    allowedScheduleKinds: ["after-trigger"],
  },
  "R2-ACTIVATE": {
    id: "R2-ACTIVATE",
    triggerEventType: "registration.completed",
    allowedTriggerSources: ["domain_action", "trusted_server"],
    requiredPredicates: ["subject.active", "registration.completed", "activation.missing"],
    allowedPredicates: ["subject.active", "registration.completed", "activation.missing", "commercial.eligible"],
    requiredStopRules: ["subject.deleted", "activation.completed"],
    allowedStopRules: ["subject.deleted", "activation.completed", "commercial.ineligible", "purchase.completed"],
    allowedScheduleKinds: ["after-trigger"],
  },
  "R2-ONBOARD": {
    id: "R2-ONBOARD",
    triggerEventType: "onboarding.started",
    allowedTriggerSources: ["domain_action", "trusted_server"],
    requiredPredicates: ["subject.active", "onboarding.incomplete"],
    allowedPredicates: ["subject.active", "onboarding.incomplete"],
    requiredStopRules: ["subject.deleted", "onboarding.completed"],
    allowedStopRules: ["subject.deleted", "onboarding.completed"],
    allowedScheduleKinds: ["after-trigger"],
  },
  "R2-TRIAL": {
    id: "R2-TRIAL",
    triggerEventType: "trial.started",
    allowedTriggerSources: ["domain_action", "trusted_server"],
    requiredPredicates: ["subject.active", "trial.active", "purchase.absent", "commercial.eligible"],
    allowedPredicates: ["subject.active", "trial.active", "purchase.absent", "commercial.eligible", "activation.missing"],
    requiredStopRules: ["subject.deleted", "trial.ended", "purchase.completed", "commercial.ineligible"],
    allowedStopRules: ["subject.deleted", "trial.ended", "purchase.completed", "commercial.ineligible", "activation.completed"],
    allowedScheduleKinds: ["after-trigger", "before-trial-end"],
  },
  "R2-CHECKOUT": {
    id: "R2-CHECKOUT",
    triggerEventType: "checkout.started",
    // A browser may report checkout.started to F, but recovery enrollment requires
    // the validated domain action produced by the trusted checkout handler.
    allowedTriggerSources: ["domain_action"],
    requiredPredicates: ["subject.active", "purchase.absent", "commercial.eligible"],
    allowedPredicates: ["subject.active", "purchase.absent", "commercial.eligible"],
    requiredStopRules: ["subject.deleted", "purchase.completed", "commercial.ineligible"],
    allowedStopRules: ["subject.deleted", "purchase.completed", "commercial.ineligible"],
    allowedScheduleKinds: ["after-trigger"],
  },
};

export class AcquisitionDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcquisitionDefinitionError";
  }
}

function nonEmpty(label: string, value: string): string {
  if (!value.trim()) throw new AcquisitionDefinitionError(`${label} is required.`);
  return value;
}

function uniqueStrings<T extends string>(label: string, values: readonly T[]): void {
  if (new Set(values).size !== values.length) {
    throw new AcquisitionDefinitionError(`${label} must not contain duplicates.`);
  }
}

function assertIntegerRange(label: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AcquisitionDefinitionError(`${label} must be an integer between ${min} and ${max}.`);
  }
}

function assertContainsAll<T extends string>(label: string, actual: readonly T[], required: readonly T[]): void {
  const actualSet = new Set(actual);
  const missing = required.filter((item) => !actualSet.has(item));
  if (missing.length) throw new AcquisitionDefinitionError(`${label} is missing required values: ${missing.join(", ")}.`);
}

function assertSubset<T extends string>(label: string, actual: readonly T[], allowed: readonly T[]): void {
  const allowedSet = new Set(allowed);
  const rejected = actual.filter((item) => !allowedSet.has(item));
  if (rejected.length) throw new AcquisitionDefinitionError(`${label} contains unsupported values: ${rejected.join(", ")}.`);
}

export function validateAcquisitionDefinition(definition: AcquisitionAutomationDefinition): AcquisitionAutomationDefinition {
  if (definition.schemaVersion !== ACQUISITION_AUTOMATION_SCHEMA_VERSION) {
    throw new AcquisitionDefinitionError(`Unsupported automation schema version: ${String(definition.schemaVersion)}.`);
  }

  nonEmpty("organizationId", definition.organizationId);
  nonEmpty("versionId", definition.versionId);
  const descriptor = ACQUISITION_CATALOG[definition.automationId];
  if (!descriptor) throw new AcquisitionDefinitionError(`Unsupported Release 2 automation: ${String(definition.automationId)}.`);
  if (definition.triggerEventType !== descriptor.triggerEventType) {
    throw new AcquisitionDefinitionError(`${definition.automationId} must use trigger ${descriptor.triggerEventType}.`);
  }

  if (!definition.allowedTriggerSources.length) {
    throw new AcquisitionDefinitionError("At least one approved trigger source is required.");
  }
  uniqueStrings("allowedTriggerSources", definition.allowedTriggerSources);
  assertSubset("allowedTriggerSources", definition.allowedTriggerSources, descriptor.allowedTriggerSources);
  for (const source of definition.allowedTriggerSources) {
    if (!isSourceAllowedForEvent(definition.triggerEventType, source)) {
      throw new AcquisitionDefinitionError(`${source} is not registered by the lifecycle catalog for ${definition.triggerEventType}.`);
    }
  }

  uniqueStrings("predicates", definition.predicates);
  assertContainsAll("predicates", definition.predicates, descriptor.requiredPredicates);
  assertSubset("predicates", definition.predicates, descriptor.allowedPredicates);

  uniqueStrings("stopRules", definition.stopRules);
  assertContainsAll("stopRules", definition.stopRules, descriptor.requiredStopRules);
  assertSubset("stopRules", definition.stopRules, descriptor.allowedStopRules);

  if (!definition.steps.length || definition.steps.length > MAX_ACQUISITION_STEPS) {
    throw new AcquisitionDefinitionError(`Automation must contain between 1 and ${MAX_ACQUISITION_STEPS} email steps.`);
  }
  uniqueStrings("step IDs", definition.steps.map((step) => step.stepId));
  for (const [index, step] of definition.steps.entries()) {
    nonEmpty(`steps[${index}].stepId`, step.stepId);
    if (!descriptor.allowedScheduleKinds.includes(step.schedule.kind)) {
      throw new AcquisitionDefinitionError(`${definition.automationId} does not allow ${step.schedule.kind} scheduling.`);
    }
    const seconds = step.schedule.kind === "after-trigger" ? step.schedule.delaySeconds : step.schedule.offsetSeconds;
    assertIntegerRange(`steps[${index}].schedule`, seconds, 0, MAX_ACQUISITION_DELAY_SECONDS);
    if (step.action.kind !== "email") throw new AcquisitionDefinitionError("Release 2 acquisition actions must be email actions.");
    nonEmpty(`steps[${index}].templateId`, step.action.templateId);
    nonEmpty(`steps[${index}].templateVersionId`, step.action.templateVersionId);
    if (step.action.purpose !== "service" && step.action.purpose !== "promotional") {
      throw new AcquisitionDefinitionError(`steps[${index}].purpose is unsupported.`);
    }
  }

  assertIntegerRange("expirationSeconds", definition.expirationSeconds, 1, MAX_ACQUISITION_EXPIRATION_SECONDS);
  assertIntegerRange("retryPolicy.maxAttempts", definition.retryPolicy.maxAttempts, 1, 8);
  assertIntegerRange("retryPolicy.baseBackoffSeconds", definition.retryPolicy.baseBackoffSeconds, 1, 86_400);
  assertIntegerRange("retryPolicy.maxBackoffSeconds", definition.retryPolicy.maxBackoffSeconds, definition.retryPolicy.baseBackoffSeconds, 604_800);
  assertIntegerRange("frequencyPolicy.maxProviderAcceptedEffects", definition.frequencyPolicy.maxProviderAcceptedEffects, 1, 20);
  assertIntegerRange("frequencyPolicy.windowSeconds", definition.frequencyPolicy.windowSeconds, 60, 60 * 60 * 24 * 90);
  if (Number.isNaN(Date.parse(definition.publishedAt))) throw new AcquisitionDefinitionError("publishedAt must be an ISO-compatible timestamp.");

  return definition;
}
