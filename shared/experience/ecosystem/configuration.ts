import type {
  CapabilityOfferMapping,
  ExperienceConfigurationVersion,
  ExperienceModuleManifestRecord,
  ExperienceOnboardingMapping,
  ExperienceTemplateVersion,
  JsonObject,
  JsonValue,
  ModuleInstallation,
} from "./contracts.js";
import { cloneJson, validateExperienceModuleManifest } from "./manifest.js";

const EXECUTABLE_TEXT = /(?:javascript\s*:|<\s*script\b|<\s*iframe\b|data\s*:\s*text\/html)/i;
const SECRET_KEY = /(secret|password|credential|api.?key|auth.?token|private.?key)/i;

export interface ConfigurationValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ConfigurationDraftInput {
  installation: ModuleInstallation;
  manifest: ExperienceModuleManifestRecord;
  organizationId: string;
  actorId: string;
  values: JsonObject;
  baseTemplateVersionId?: string;
  capabilityMappings?: CapabilityOfferMapping[];
  onboardingMappings?: ExperienceOnboardingMapping[];
}

export interface ExperienceConfigurationClock {
  now(): string;
  id(prefix: string): string;
}

function valueType(value: JsonValue): "string" | "number" | "boolean" | "string-array" | "object" | "other" {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return value.every((item) => typeof item === "string") ? "string-array" : "other";
  if (value !== null && typeof value === "object") return "object";
  return "other";
}

function validateSafeData(value: unknown, path: string, errors: string[], depth = 0): void {
  if (depth > 8) {
    errors.push(`${path} exceeds the supported configuration depth.`);
    return;
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) errors.push(`${path} must be a finite number.`);
    return;
  }
  if (typeof value === "string") {
    if (EXECUTABLE_TEXT.test(value)) errors.push(`${path} may not contain executable HTML or JavaScript.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSafeData(item, `${path}[${index}]`, errors, depth + 1));
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) errors.push(`${path}.${key} may not contain credentials or secrets.`);
      validateSafeData(nested, `${path}.${key}`, errors, depth + 1);
    }
    return;
  }
  errors.push(`${path} must contain JSON-compatible data.`);
}

export function validateConfigurationValues(
  manifest: ExperienceModuleManifestRecord,
  values: JsonObject,
): ConfigurationValidationResult {
  const errors = [...validateExperienceModuleManifest(manifest).errors];
  for (const key of Object.keys(values)) {
    if (!manifest.configurationSchema[key]) errors.push(`Unknown configuration field ${key}.`);
    if (SECRET_KEY.test(key)) errors.push(`Configuration field ${key} may not contain credentials or secrets.`);
  }
  for (const [key, field] of Object.entries(manifest.configurationSchema)) {
    const value = values[key];
    if (value === undefined) {
      if (field.required) errors.push(`Configuration field ${key} is required.`);
      continue;
    }
    const actualType = valueType(value);
    if (actualType !== field.type) {
      errors.push(`Configuration field ${key} must be ${field.type}.`);
      continue;
    }
    if (typeof value === "string") {
      if (field.maxLength !== undefined && value.length > field.maxLength) errors.push(`Configuration field ${key} exceeds maxLength ${field.maxLength}.`);
      if (field.enum && !field.enum.includes(value)) errors.push(`Configuration field ${key} must use an allowed value.`);
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) errors.push(`Configuration field ${key} must be finite.`);
      if (field.min !== undefined && value < field.min) errors.push(`Configuration field ${key} is below minimum ${field.min}.`);
      if (field.max !== undefined && value > field.max) errors.push(`Configuration field ${key} exceeds maximum ${field.max}.`);
    }
  }
  validateSafeData(values, "configuration", errors);
  return { valid: errors.length === 0, errors };
}

function mergeJsonObjects(base: JsonObject, overlay: JsonObject): JsonObject {
  const result: JsonObject = cloneJson(base);
  for (const [key, value] of Object.entries(overlay)) {
    const previous = result[key];
    if (
      value !== null
      && !Array.isArray(value)
      && typeof value === "object"
      && previous !== null
      && !Array.isArray(previous)
      && typeof previous === "object"
    ) {
      result[key] = mergeJsonObjects(previous as JsonObject, value as JsonObject);
    } else {
      result[key] = cloneJson(value);
    }
  }
  return result;
}

export function resolveEffectiveExperienceConfiguration(input: {
  manifest: ExperienceModuleManifestRecord;
  template?: ExperienceTemplateVersion | null;
  organizationOverrides?: JsonObject;
}): JsonObject {
  let effective = cloneJson(input.manifest.defaults);
  if (input.template) effective = mergeJsonObjects(effective, input.template.values);
  if (input.organizationOverrides) effective = mergeJsonObjects(effective, input.organizationOverrides);
  return effective;
}

export function validateCapabilityMappings(
  manifest: ExperienceModuleManifestRecord,
  mappings: readonly CapabilityOfferMapping[],
): string[] {
  const errors: string[] = [];
  const declared = new Set(manifest.capabilities.map((capability) => capability.key));
  const seen = new Set<string>();
  for (const mapping of mappings) {
    if (!declared.has(mapping.capabilityKey)) errors.push(`Capability mapping references undeclared capability ${mapping.capabilityKey}.`);
    if (seen.has(mapping.capabilityKey)) errors.push(`Capability ${mapping.capabilityKey} is mapped more than once.`);
    seen.add(mapping.capabilityKey);
    if (mapping.offerIds.some((offerId) => !offerId.trim())) errors.push(`Capability ${mapping.capabilityKey} contains an empty Offer id.`);
  }
  return errors;
}

export function validateOnboardingMappings(
  manifest: ExperienceModuleManifestRecord,
  mappings: readonly ExperienceOnboardingMapping[],
): string[] {
  const errors: string[] = [];
  const declared = new Set(manifest.onboardingRequirements.map((requirement) => requirement.id));
  const seen = new Set<string>();
  for (const mapping of mappings) {
    if (!declared.has(mapping.requirementId)) errors.push(`Onboarding mapping references undeclared requirement ${mapping.requirementId}.`);
    if (seen.has(mapping.requirementId)) errors.push(`Onboarding requirement ${mapping.requirementId} is mapped more than once.`);
    seen.add(mapping.requirementId);
    if (!Number.isInteger(mapping.order) || mapping.order < 0) errors.push(`Onboarding requirement ${mapping.requirementId} has an invalid order.`);
  }
  return errors;
}

function cloneConfigurationVersion(version: ExperienceConfigurationVersion): ExperienceConfigurationVersion {
  return {
    ...version,
    values: cloneJson(version.values),
    capabilityMappings: version.capabilityMappings.map((mapping) => ({ ...mapping, offerIds: [...mapping.offerIds] })),
    onboardingMappings: version.onboardingMappings.map((mapping) => ({ ...mapping })),
  };
}

function cloneTemplateVersion(version: ExperienceTemplateVersion): ExperienceTemplateVersion {
  return {
    ...version,
    values: cloneJson(version.values),
    capabilityMappings: version.capabilityMappings.map((mapping) => ({ ...mapping, offerIds: [...mapping.offerIds] })),
    onboardingMappings: version.onboardingMappings.map((mapping) => ({ ...mapping })),
    compatibleModuleVersions: [...version.compatibleModuleVersions],
  };
}

export class InMemoryExperienceTemplateCatalog {
  private readonly versions = new Map<string, ExperienceTemplateVersion[]>();

  constructor(private readonly clock: ExperienceConfigurationClock) {}

  createVersion(input: {
    templateId: string;
    manifest: ExperienceModuleManifestRecord;
    compatibleModuleVersions: string[];
    values: JsonObject;
    capabilityMappings?: CapabilityOfferMapping[];
    onboardingMappings?: ExperienceOnboardingMapping[];
    actorId: string;
  }): ExperienceTemplateVersion {
    const resolved = resolveEffectiveExperienceConfiguration({ manifest: input.manifest, organizationOverrides: input.values });
    const validation = validateConfigurationValues(input.manifest, resolved);
    const mappingErrors = [
      ...validateCapabilityMappings(input.manifest, input.capabilityMappings ?? []),
      ...validateOnboardingMappings(input.manifest, input.onboardingMappings ?? []),
    ];
    if (!validation.valid || mappingErrors.length) throw new Error([...validation.errors, ...mappingErrors].join(" "));
    if (!input.compatibleModuleVersions.includes(input.manifest.version)) {
      throw new Error("Template compatibility must include the manifest version used to validate it.");
    }
    const version: ExperienceTemplateVersion = {
      templateVersionId: this.clock.id(`template-${input.templateId}`),
      templateId: input.templateId,
      moduleId: input.manifest.id,
      compatibleModuleVersions: [...input.compatibleModuleVersions],
      schemaVersion: input.manifest.configurationSchemaVersion,
      values: cloneJson(input.values),
      capabilityMappings: (input.capabilityMappings ?? []).map((mapping) => ({ ...mapping, offerIds: [...mapping.offerIds] })),
      onboardingMappings: (input.onboardingMappings ?? []).map((mapping) => ({ ...mapping })),
      createdAt: this.clock.now(),
      createdBy: input.actorId,
      status: "available",
    };
    const existing = this.versions.get(input.templateId) ?? [];
    existing.push(version);
    this.versions.set(input.templateId, existing);
    return cloneTemplateVersion(version);
  }

  getVersion(templateVersionId: string): ExperienceTemplateVersion | null {
    for (const versions of this.versions.values()) {
      const match = versions.find((version) => version.templateVersionId === templateVersionId);
      if (match) return cloneTemplateVersion(match);
    }
    return null;
  }

  deprecate(templateVersionId: string): void {
    for (const versions of this.versions.values()) {
      const match = versions.find((version) => version.templateVersionId === templateVersionId);
      if (match) {
        match.status = "deprecated";
        return;
      }
    }
    throw new Error(`Template version ${templateVersionId} was not found.`);
  }
}

export class InMemoryExperienceConfigurationService {
  private readonly versionsByInstallation = new Map<string, ExperienceConfigurationVersion[]>();

  constructor(private readonly clock: ExperienceConfigurationClock) {}

  saveDraft(input: ConfigurationDraftInput): ExperienceConfigurationVersion {
    if (input.installation.organizationId !== input.organizationId) throw new Error("Configuration organization does not match the installation.");
    if (input.installation.moduleId !== input.manifest.id || input.installation.activeVersion !== input.manifest.version) {
      throw new Error("Configuration manifest does not match the active installed module version.");
    }
    const validation = validateConfigurationValues(input.manifest, input.values);
    const mappingErrors = [
      ...validateCapabilityMappings(input.manifest, input.capabilityMappings ?? []),
      ...validateOnboardingMappings(input.manifest, input.onboardingMappings ?? []),
    ];
    if (!validation.valid || mappingErrors.length) throw new Error([...validation.errors, ...mappingErrors].join(" "));

    const version: ExperienceConfigurationVersion = {
      configurationVersionId: this.clock.id(`config-${input.installation.installationId}`),
      installationId: input.installation.installationId,
      organizationId: input.organizationId,
      moduleId: input.manifest.id,
      moduleVersion: input.manifest.version,
      schemaVersion: input.manifest.configurationSchemaVersion,
      baseTemplateVersionId: input.baseTemplateVersionId,
      values: cloneJson(input.values),
      capabilityMappings: (input.capabilityMappings ?? []).map((mapping) => ({ ...mapping, offerIds: [...mapping.offerIds] })),
      onboardingMappings: (input.onboardingMappings ?? []).map((mapping) => ({ ...mapping })),
      createdAt: this.clock.now(),
      createdBy: input.actorId,
      status: "draft",
    };
    const versions = this.versionsByInstallation.get(input.installation.installationId) ?? [];
    versions.push(version);
    this.versionsByInstallation.set(input.installation.installationId, versions);
    return cloneConfigurationVersion(version);
  }

  applyTemplate(input: {
    installation: ModuleInstallation;
    manifest: ExperienceModuleManifestRecord;
    organizationId: string;
    actorId: string;
    template: ExperienceTemplateVersion;
    overrides?: JsonObject;
  }): ExperienceConfigurationVersion {
    if (input.template.status !== "available") throw new Error("Deprecated templates cannot be applied to a new draft.");
    if (input.template.moduleId !== input.manifest.id || !input.template.compatibleModuleVersions.includes(input.manifest.version)) {
      throw new Error("Template is not compatible with the installed module version.");
    }
    const values = resolveEffectiveExperienceConfiguration({
      manifest: input.manifest,
      template: input.template,
      organizationOverrides: input.overrides,
    });
    return this.saveDraft({
      installation: input.installation,
      manifest: input.manifest,
      organizationId: input.organizationId,
      actorId: input.actorId,
      values,
      baseTemplateVersionId: input.template.templateVersionId,
      capabilityMappings: input.template.capabilityMappings,
      onboardingMappings: input.template.onboardingMappings,
    });
  }

  publish(installation: ModuleInstallation, configurationVersionId: string): ExperienceConfigurationVersion {
    const versions = this.versionsByInstallation.get(installation.installationId) ?? [];
    const target = versions.find((version) => version.configurationVersionId === configurationVersionId);
    if (!target) throw new Error("Configuration version was not found for this installation.");
    if (target.status !== "draft") throw new Error("Only a draft configuration can be published.");
    if (target.moduleVersion !== installation.activeVersion) throw new Error("Cannot publish configuration for a different module version.");
    for (const version of versions) if (version.status === "published") version.status = "superseded";
    target.status = "published";
    return cloneConfigurationVersion(target);
  }

  getPublished(installationId: string): ExperienceConfigurationVersion | null {
    const version = (this.versionsByInstallation.get(installationId) ?? []).find((candidate) => candidate.status === "published");
    return version ? cloneConfigurationVersion(version) : null;
  }

  listVersions(installationId: string): ExperienceConfigurationVersion[] {
    return (this.versionsByInstallation.get(installationId) ?? []).map(cloneConfigurationVersion);
  }
}
