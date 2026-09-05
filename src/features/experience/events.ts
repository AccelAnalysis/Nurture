import { MAX_EVENT_PAYLOAD_BYTES, type ExperienceModuleEventType } from "../../../shared/analytics/contracts";
import {
  isExperienceModuleEventType,
  validateEventPayload,
} from "../../../shared/analytics/core";
import type {
  ExperienceEventDefinition,
  ExperienceEventPayloadField,
  ExperienceModuleManifest,
  JsonObject,
  JsonValue,
} from "./contracts";

export const MAX_EXPERIENCE_EVENT_PAYLOAD_BYTES = 4_096;

export type ExperienceEventValidationResult =
  | { ok: true; properties: JsonObject }
  | { ok: false; reason: string };

const HOST_EVENT_PAYLOADS: Record<
  "experience.started" | "experience.premium_feature_requested",
  Record<string, ExperienceEventPayloadField>
> = {
  "experience.started": {
    accessMode: {
      type: "string",
      required: true,
      allowedValues: ["public", "trial", "authenticated"],
      maxLength: 24,
    },
    slot: {
      type: "string",
      required: true,
      allowedValues: ["primary", "secondary"],
      maxLength: 24,
    },
  },
  "experience.premium_feature_requested": {
    capabilityKey: { type: "string", required: true, maxLength: 160 },
    reason: { type: "string", maxLength: 80 },
  },
};

function encodedBytes(value: JsonObject): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function moduleEventNamespace(moduleId: string): string {
  const parts = moduleId.split(".").filter(Boolean);
  return parts.at(-1) ?? moduleId;
}

function valueMatchesField(value: JsonValue, field: ExperienceEventPayloadField): string | null {
  if (typeof value !== field.type) return `must be ${field.type}`;
  if (field.allowedValues && !field.allowedValues.includes(value as string | number | boolean)) {
    return "is not an allowed value";
  }
  if (typeof value === "string" && field.maxLength !== undefined && value.length > field.maxLength) {
    return `must be at most ${field.maxLength} characters`;
  }
  if (typeof value === "number") {
    if (field.integer && !Number.isInteger(value)) return "must be an integer";
    if (field.min !== undefined && value < field.min) return `must be at least ${field.min}`;
    if (field.max !== undefined && value > field.max) return `must be at most ${field.max}`;
  }
  return null;
}

function validateSchema(
  properties: JsonObject,
  schema: Record<string, ExperienceEventPayloadField>,
  maxPayloadBytes: number,
): ExperienceEventValidationResult {
  try {
    validateEventPayload(properties);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Event payload is invalid." };
  }

  const bytes = encodedBytes(properties);
  if (bytes > maxPayloadBytes) {
    return { ok: false, reason: `Event payload exceeds ${maxPayloadBytes} bytes.` };
  }

  for (const [key, field] of Object.entries(schema)) {
    const value = properties[key];
    if (value === undefined) {
      if (field.required) return { ok: false, reason: `Event property ${key} is required.` };
      continue;
    }
    const problem = valueMatchesField(value, field);
    if (problem) return { ok: false, reason: `Event property ${key} ${problem}.` };
  }

  for (const key of Object.keys(properties)) {
    if (!schema[key]) return { ok: false, reason: `Event property ${key} is not declared.` };
  }

  return { ok: true, properties };
}

function declarationMaxBytes(definition: ExperienceEventDefinition): number {
  const requested = definition.maxPayloadBytes ?? MAX_EXPERIENCE_EVENT_PAYLOAD_BYTES;
  return Math.min(requested, MAX_EXPERIENCE_EVENT_PAYLOAD_BYTES, MAX_EVENT_PAYLOAD_BYTES);
}

export function validateExperienceModuleEvent(
  manifest: ExperienceModuleManifest,
  name: ExperienceModuleEventType,
  properties: JsonObject,
): ExperienceEventValidationResult {
  const definition = manifest.eventDefinitions.find((item) => item.name === name);
  if (!definition) return { ok: false, reason: "The Experience module did not declare this event." };
  if (definition.source !== "browser") return { ok: false, reason: "This event requires a trusted domain source." };
  if (definition.schemaVersion !== 1) return { ok: false, reason: "The Experience event schema version is unsupported." };
  if (!isExperienceModuleEventType(name)) return { ok: false, reason: "The Experience event name is not registered in the canonical module namespace." };
  const prefix = `experience.${moduleEventNamespace(manifest.id)}.`;
  if (!name.startsWith(prefix)) {
    return { ok: false, reason: `The Experience event must use the ${prefix} namespace.` };
  }
  if (definition.maxPayloadBytes !== undefined && (
    definition.maxPayloadBytes <= 0
    || definition.maxPayloadBytes > MAX_EXPERIENCE_EVENT_PAYLOAD_BYTES
  )) {
    return { ok: false, reason: `The Experience event payload cap must be between 1 and ${MAX_EXPERIENCE_EVENT_PAYLOAD_BYTES} bytes.` };
  }
  return validateSchema(properties, definition.payloadSchema, declarationMaxBytes(definition));
}

export function validateExperienceHostEvent(
  name: "experience.started" | "experience.premium_feature_requested",
  properties: JsonObject,
): ExperienceEventValidationResult {
  return validateSchema(properties, HOST_EVENT_PAYLOADS[name], MAX_EXPERIENCE_EVENT_PAYLOAD_BYTES);
}

export function validateExperienceManifestLifecycle(manifest: ExperienceModuleManifest): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const prefix = `experience.${moduleEventNamespace(manifest.id)}.`;

  for (const definition of manifest.eventDefinitions) {
    if (seen.has(definition.name)) errors.push(`Experience event ${definition.name} is declared more than once.`);
    seen.add(definition.name);
    if (!isExperienceModuleEventType(definition.name)) errors.push(`Experience event ${definition.name} is not a valid canonical module event name.`);
    if (!definition.name.startsWith(prefix)) errors.push(`Experience event ${definition.name} must use the ${prefix} namespace.`);
    if (definition.schemaVersion !== 1) errors.push(`Experience event ${definition.name} must use schema version 1.`);
    if (definition.maxPayloadBytes !== undefined && (
      definition.maxPayloadBytes <= 0
      || definition.maxPayloadBytes > MAX_EXPERIENCE_EVENT_PAYLOAD_BYTES
    )) {
      errors.push(`Experience event ${definition.name} payload cap exceeds the Track B limit.`);
    }
  }

  const activation = manifest.activityDefinition.activation;
  const activationDefinition = manifest.eventDefinitions.find((item) => item.name === activation.moduleEvent);
  if (!activationDefinition) errors.push("The activation event must be declared by the module.");
  if (manifest.activityDefinition.meaningfulEvent !== activation.moduleEvent) {
    errors.push("The first meaningful-use event and activation event must agree for the Release 2 contract.");
  }
  if (activation.verification !== "trusted-domain-action") {
    errors.push("Activation must require trusted domain-action validation.");
  }
  if (!activationDefinition?.requiresServerValidation) {
    errors.push("The activation event must explicitly require server validation before a global milestone is emitted.");
  }
  if (!activation.milestoneKey.trim()) errors.push("The activation milestone key is required.");
  if (manifest.activityDefinition.pageViewCountsAsActivity !== false) {
    errors.push("A page view may not count as meaningful activity in the Release 2 Experience contract.");
  }

  return errors;
}
