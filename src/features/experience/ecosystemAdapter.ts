import type { ExperienceModuleManifestRecord } from "../../../shared/experience/ecosystem/contracts";
import type { ExperienceModuleManifest } from "./contracts";

function minimumHostVersion(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith(">=") ? trimmed.slice(2).trim() : trimmed;
}

/**
 * Release 6 bridge from the original trusted Experience host manifest to the
 * version-aware ecosystem contract. The bridge is intentionally one-way and
 * data-only: it does not load remote code, add credentials, or reinterpret
 * Nurture lifecycle ownership.
 */
export function adaptLegacyExperienceManifest(
  manifest: ExperienceModuleManifest,
  options: { configurationSchemaVersion?: number; dataMigrationVersion?: string } = {},
): ExperienceModuleManifestRecord {
  return {
    manifestSchemaVersion: 1,
    id: manifest.id,
    version: manifest.version,
    contractVersion: manifest.contractVersion,
    name: manifest.name,
    description: manifest.description,
    icon: manifest.icon,
    routes: manifest.routes.map((route) => ({ ...route, access: [...route.access] })),
    navigation: manifest.navigation.map((item) => ({ ...item, access: [...item.access] })),
    configurationSchemaVersion: options.configurationSchemaVersion ?? 1,
    configurationSchema: Object.fromEntries(Object.entries(manifest.configurationSchema).map(([key, field]) => [key, {
      type: field.type === "array" ? "string-array" as const : field.type,
      label: field.label,
      description: field.description,
      required: field.required,
    }])),
    defaults: JSON.parse(JSON.stringify(manifest.defaults)) as ExperienceModuleManifestRecord["defaults"],
    capabilities: manifest.capabilities.map((capability) => ({
      key: capability.key,
      label: capability.label,
      description: capability.description,
      availability: [...capability.availability],
      requiresEntitlement: capability.requiresEntitlement,
      quota: capability.quotaUnit ? { kind: "allowance", unit: capability.quotaUnit } : undefined,
      upgradeContext: capability.upgradeContext,
    })),
    eventDefinitions: manifest.eventDefinitions.map((event) => ({
      ...event,
      schemaVersion: 1,
    })),
    profileRequirements: manifest.profileRequirements.map((requirement) => ({ ...requirement })),
    onboardingRequirements: manifest.onboardingRequirements.map((requirement) => ({ ...requirement })),
    activityDefinition: { ...manifest.activityDefinition },
    dataContract: {
      scope: manifest.dataContract.scope,
      retention: manifest.dataContract.retention,
      export: manifest.dataContract.export,
      migrationVersion: options.dataMigrationVersion ?? manifest.dataContract.migration,
      deletionBehavior: manifest.dataContract.scope === "session-only"
        ? "session-only"
        : "preserve-until-explicit-delete",
    },
    compatibility: {
      hostContractRange: manifest.compatibility.hostContract,
      minimumHostVersion: minimumHostVersion(manifest.compatibility.hostVersion),
      unavailableBehavior: manifest.compatibility.unavailableBehavior,
    },
  };
}
