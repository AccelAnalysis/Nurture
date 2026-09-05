export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const R6_HOST_CONTRACT_VERSION = "1.0.0" as const;
export const R6_MANIFEST_SCHEMA_VERSION = 1 as const;
export const R6_CONFIGURATION_SCHEMA_VERSION = 1 as const;

export type ModuleId = string;
export type ModuleVersion = string;
export type InstallationId = string;
export type OrganizationId = string;
export type ConfigurationVersionId = string;
export type TemplateVersionId = string;

export type ExperienceAccessMode = "public" | "trial" | "authenticated";
export type ModuleTrustStatus =
  | "registered"
  | "under-review"
  | "trusted"
  | "rejected"
  | "deprecated"
  | "revoked";

export type ModuleAvailabilityState = "available" | "deprecated" | "blocked" | "revoked";
export type ModuleInstallationState = "installed" | "disabled" | "uninstalled" | "upgrade-blocked";
export type UpgradeRunState = "planned" | "running" | "succeeded" | "failed" | "rolled-back" | "blocked";
export type MigrationRunState = "pending" | "running" | "succeeded" | "failed" | "skipped";

export interface ModuleRouteDeclaration {
  path: string;
  label: string;
  access: ExperienceAccessMode[];
  capability?: string;
}

export interface ModuleNavigationDeclaration extends ModuleRouteDeclaration {
  description?: string;
}

export interface ExperienceConfigurationFieldSchema {
  type: "string" | "number" | "boolean" | "string-array" | "object";
  label: string;
  description?: string;
  required?: boolean;
  sensitive?: boolean;
  enum?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
}

export interface ModuleCapabilityDeclaration {
  key: string;
  label: string;
  description: string;
  availability: ExperienceAccessMode[];
  requiresEntitlement?: boolean;
  quota?: { kind: "boolean" | "allowance"; unit?: string; reset?: "day" | "month" | "subscription-period" };
  upgradeContext?: string;
}

export interface ModuleEventDeclaration {
  name: string;
  description: string;
  source: "browser" | "server";
  requiresServerValidation?: boolean;
  schemaVersion: number;
  allowedProperties?: string[];
}

export interface ModuleProfileRequirement {
  field: string;
  purpose: string;
  required: boolean;
  sensitivity: "standard" | "sensitive";
}

export interface ModuleOnboardingRequirement {
  id: string;
  label: string;
  completion: string;
}

export interface ModuleActivityDefinition {
  meaningfulEvent: string;
  description: string;
  pageViewCountsAsActivity: false;
}

export interface ModuleDataContract {
  scope: "organization-customer" | "organization" | "customer" | "session-only";
  retention: string;
  export: string;
  migrationVersion: string;
  deletionBehavior: "preserve-until-explicit-delete" | "session-only";
}

export interface ModuleCompatibilityDeclaration {
  hostContractRange: string;
  minimumHostVersion: string;
  unavailableBehavior: string;
}

export interface ExperienceModuleManifestRecord {
  manifestSchemaVersion: typeof R6_MANIFEST_SCHEMA_VERSION;
  id: ModuleId;
  version: ModuleVersion;
  contractVersion: string;
  name: string;
  description: string;
  icon: string;
  routes: ModuleRouteDeclaration[];
  navigation: ModuleNavigationDeclaration[];
  configurationSchemaVersion: number;
  configurationSchema: Record<string, ExperienceConfigurationFieldSchema>;
  defaults: JsonObject;
  capabilities: ModuleCapabilityDeclaration[];
  eventDefinitions: ModuleEventDeclaration[];
  profileRequirements: ModuleProfileRequirement[];
  onboardingRequirements: ModuleOnboardingRequirement[];
  activityDefinition: ModuleActivityDefinition;
  dataContract: ModuleDataContract;
  compatibility: ModuleCompatibilityDeclaration;
}

export type HostCompatibilityCode =
  | "compatible"
  | "manifest-invalid"
  | "host-contract-incompatible"
  | "host-version-too-old"
  | "route-policy-invalid"
  | "capability-policy-invalid"
  | "event-policy-invalid";

export interface HostCompatibilityResult {
  compatible: boolean;
  code: HostCompatibilityCode;
  reasons: string[];
  hostContractVersion: string;
  moduleContractVersion: string;
  evaluatedAt: string;
}

export interface ModuleTrustDecision {
  moduleId: ModuleId;
  moduleVersion: ModuleVersion;
  status: ModuleTrustStatus;
  decisionId: string;
  reviewedArtifactId: string;
  manifestDigest: string;
  decidedBy: string;
  decidedAt: string;
  safeSummary?: string;
}

export interface RegisteredModuleVersion {
  moduleId: ModuleId;
  version: ModuleVersion;
  manifest: ExperienceModuleManifestRecord;
  availability: ModuleAvailabilityState;
  trustDecision: ModuleTrustDecision;
  compatibility: HostCompatibilityResult;
  releaseNotes?: string;
  registeredAt: string;
}

export interface ExperienceRegistryEntry {
  moduleId: ModuleId;
  name: string;
  description: string;
  icon: string;
  versions: RegisteredModuleVersion[];
}

export interface ModuleInstallation {
  installationId: InstallationId;
  organizationId: OrganizationId;
  moduleId: ModuleId;
  activeVersion: ModuleVersion;
  state: ModuleInstallationState;
  slot: "primary" | "secondary";
  installedAt: string;
  updatedAt: string;
  publishedConfigurationVersion?: ConfigurationVersionId;
  trustDecisionId: string;
  hostContractVersion: string;
}

export type InstallationHistoryAction =
  | "installed"
  | "disabled"
  | "enabled"
  | "uninstalled"
  | "upgrade-started"
  | "upgraded"
  | "upgrade-failed"
  | "rolled-back"
  | "trust-revoked";

export interface ModuleInstallationHistoryEntry {
  historyId: string;
  installationId: InstallationId;
  organizationId: OrganizationId;
  moduleId: ModuleId;
  moduleVersion: ModuleVersion;
  action: InstallationHistoryAction;
  actorId: string;
  occurredAt: string;
  reason?: string;
  previousVersion?: ModuleVersion;
}

export interface CapabilityOfferMapping {
  capabilityKey: string;
  offerIds: string[];
}

export interface ExperienceOnboardingMapping {
  requirementId: string;
  enabled: boolean;
  order: number;
}

export interface ExperienceConfigurationVersion {
  configurationVersionId: ConfigurationVersionId;
  installationId: InstallationId;
  organizationId: OrganizationId;
  moduleId: ModuleId;
  moduleVersion: ModuleVersion;
  schemaVersion: number;
  baseTemplateVersionId?: TemplateVersionId;
  values: JsonObject;
  capabilityMappings: CapabilityOfferMapping[];
  onboardingMappings: ExperienceOnboardingMapping[];
  createdAt: string;
  createdBy: string;
  status: "draft" | "published" | "superseded";
}

export interface ExperienceTemplateVersion {
  templateVersionId: TemplateVersionId;
  templateId: string;
  moduleId: ModuleId;
  compatibleModuleVersions: string[];
  schemaVersion: number;
  values: JsonObject;
  capabilityMappings: CapabilityOfferMapping[];
  onboardingMappings: ExperienceOnboardingMapping[];
  createdAt: string;
  createdBy: string;
  status: "available" | "deprecated";
}

export interface MigrationCheckpoint {
  key: string;
  completedAt: string;
  safeSummary?: string;
}

export interface MigrationRun {
  migrationRunId: string;
  installationId: InstallationId;
  organizationId: OrganizationId;
  moduleId: ModuleId;
  fromVersion: ModuleVersion;
  toVersion: ModuleVersion;
  migrationId: string;
  state: MigrationRunState;
  checkpoints: MigrationCheckpoint[];
  startedAt: string;
  finishedAt?: string;
  errorCode?: string;
}

export interface UpgradePreflightResult {
  allowed: boolean;
  installationId: InstallationId;
  fromVersion: ModuleVersion;
  toVersion: ModuleVersion;
  trustStatus: ModuleTrustStatus;
  compatibility: HostCompatibilityResult;
  requiredConfigurationMigrations: string[];
  requiredDataMigrations: string[];
  rollbackSupported: boolean;
  irreversibleReasons: string[];
  blockers: string[];
}

export interface ModuleUpgradeRun {
  upgradeRunId: string;
  installationId: InstallationId;
  organizationId: OrganizationId;
  moduleId: ModuleId;
  fromVersion: ModuleVersion;
  toVersion: ModuleVersion;
  state: UpgradeRunState;
  preflight: UpgradePreflightResult;
  migrationRunIds: string[];
  startedAt: string;
  finishedAt?: string;
  activatedAt?: string;
  failureReason?: string;
}

export interface ModuleEventProvenance {
  moduleId: ModuleId;
  moduleVersion: ModuleVersion;
  installationId: InstallationId;
  configurationVersionId?: ConfigurationVersionId;
  eventSchemaVersion: number;
  dataMode: "live" | "test" | "preview" | "demo" | "development";
}

export function moduleVersionKey(moduleId: ModuleId, version: ModuleVersion): string {
  return `${moduleId}@${version}`;
}

export function installationKey(organizationId: OrganizationId, moduleId: ModuleId): string {
  return `${organizationId}:${moduleId}`;
}
