import type { InAppTreatmentInteraction, InAppTreatmentIntent, MeaningfulActivityFact } from "../../../shared/release3/contracts";

export interface MeaningfulActivityDefinition {
  key: string;
  label: string;
  description: string;
  establishesActivation?: boolean;
  supportsReactivation?: boolean;
  payloadKeys?: string[];
}

export interface PremiumCapabilityIntentDefinition {
  capabilityKey: string;
  label: string;
  placementId?: string;
  safeReturnPath?: string;
}

export interface ExperienceRetentionManifest {
  experienceId: string;
  moduleVersion: string;
  meaningfulActivities: MeaningfulActivityDefinition[];
  premiumCapabilities: PremiumCapabilityIntentDefinition[];
  placements: Array<{ id: string; label: string; presentation: "banner" | "card" | "modal" }>;
}

export interface ExperienceRetentionContext {
  organizationId: string;
  customerId?: string;
  experienceId: string;
  mode: "public" | "trial" | "authenticated";
}

export interface ExperienceRetentionBridge {
  submitMeaningfulActivity(input: {
    context: ExperienceRetentionContext;
    definition: MeaningfulActivityDefinition;
    actionId: string;
    occurredAt: string;
    payload?: Record<string, unknown>;
  }): Promise<{ accepted: boolean; eventId?: string }>;
  requestPremiumCapability(input: {
    context: ExperienceRetentionContext;
    definition: PremiumCapabilityIntentDefinition;
    actionId: string;
    occurredAt: string;
  }): Promise<{ accepted: boolean; requestId?: string }>;
  loadTreatment(input: { context: ExperienceRetentionContext; placementId: string }): Promise<InAppTreatmentIntent | null>;
  recordTreatmentInteraction(interaction: InAppTreatmentInteraction): Promise<{ accepted: boolean }>;
  startCommercialHandoff(input: {
    context: ExperienceRetentionContext;
    treatment: InAppTreatmentIntent;
  }): Promise<{ href: string }>;
}

export function validateRetentionManifest(manifest: ExperienceRetentionManifest): string[] {
  const errors: string[] = [];
  if (!manifest.experienceId.trim()) errors.push("Experience ID is required.");
  if (!manifest.moduleVersion.trim()) errors.push("Module version is required.");
  const activityKeys = new Set<string>();
  for (const activity of manifest.meaningfulActivities) {
    if (!activity.key.trim()) errors.push("Meaningful activity keys are required.");
    if (activityKeys.has(activity.key)) errors.push(`Duplicate meaningful activity: ${activity.key}.`);
    activityKeys.add(activity.key);
  }
  const capabilityKeys = new Set<string>();
  for (const capability of manifest.premiumCapabilities) {
    if (!capability.capabilityKey.trim()) errors.push("Capability keys are required.");
    if (capabilityKeys.has(capability.capabilityKey)) errors.push(`Duplicate premium capability: ${capability.capabilityKey}.`);
    capabilityKeys.add(capability.capabilityKey);
  }
  const placements = new Set(manifest.placements.map((placement) => placement.id));
  for (const capability of manifest.premiumCapabilities) {
    if (capability.placementId && !placements.has(capability.placementId)) errors.push(`Unknown placement: ${capability.placementId}.`);
  }
  return errors;
}

export function sanitizeMeaningfulPayload(definition: MeaningfulActivityDefinition, payload: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!payload || !definition.payloadKeys?.length) return {};
  const allowed = new Set(definition.payloadKeys);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.has(key)));
}

export function toMeaningfulActivityFact(input: {
  context: Required<Pick<ExperienceRetentionContext, "organizationId" | "customerId" | "experienceId">>;
  definition: MeaningfulActivityDefinition;
  occurredAt: string;
  actionId: string;
}): MeaningfulActivityFact {
  return {
    organizationId: input.context.organizationId,
    customerId: input.context.customerId,
    experienceId: input.context.experienceId,
    activityKey: input.definition.key,
    occurredAt: input.occurredAt,
    provenance: { source: "experience", sourceId: input.actionId, occurredAt: input.occurredAt, schemaVersion: 1 },
  };
}

export function buildTreatmentInteraction(input: {
  treatment: InAppTreatmentIntent;
  interaction: InAppTreatmentInteraction["interaction"];
  occurredAt: string;
}): InAppTreatmentInteraction {
  return {
    treatmentId: input.treatment.treatmentId,
    runId: input.treatment.runId,
    organizationId: input.treatment.organizationId,
    customerId: input.treatment.customerId,
    interaction: input.interaction,
    occurredAt: input.occurredAt,
    idempotencyKey: `${input.treatment.treatmentId}:${input.interaction}`,
  };
}

export function activitySupportsReactivation(definition: MeaningfulActivityDefinition): boolean {
  return definition.supportsReactivation === true;
}
