import type {
  ExperienceModuleManifestRecord,
  HostCompatibilityResult,
  JsonObject,
  JsonValue,
  ModuleEventProvenance,
} from "./contracts.js";
import { R6_HOST_CONTRACT_VERSION } from "./contracts.js";

const MODULE_ID = /^[a-z0-9]+(?:[.-][a-z0-9-]+)+$/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;
const CAPABILITY = /^[a-z0-9]+(?:[._-][a-z0-9-]+)+$/;
const EVENT = /^experience\.[a-z0-9-]+(?:[._-][a-z0-9-]+)+$/;
const SENSITIVE_CONFIGURATION_KEY = /(secret|password|credential|api.?key|auth.?token|private.?key)/i;
const EXECUTABLE_CONFIGURATION_KEY = /(javascript|script|iframe|executable|source.?code)/i;
const EXECUTABLE_STRING = /(?:javascript\s*:|<\s*script\b|<\s*iframe\b|data\s*:\s*text\/html)/i;

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

export interface HostCompatibilityInput {
  hostContractVersion?: string;
  hostVersion: string;
  evaluatedAt?: string;
}

export interface ModuleHostContextInput {
  organizationId?: string;
  customerId?: string;
  identityId?: string;
  authenticated: boolean;
  accessMode: "public" | "trial" | "authenticated";
  locale: string;
  timeZone: string;
  publishedConfigurationVersion?: string;
  entitlements: readonly string[];
}

export interface ModuleHostContextProjection {
  organizationId?: string;
  customerId?: string;
  identityId?: string;
  authenticated: boolean;
  accessMode: "public" | "trial" | "authenticated";
  locale: string;
  timeZone: string;
  publishedConfigurationVersion?: string;
  entitlements: readonly string[];
}

export function parseSemver(value: string): readonly [number, number, number] | null {
  const match = SEMVER.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function compareSemver(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

export function satisfiesVersionRange(version: string, range: string): boolean {
  const parsed = parseSemver(version);
  if (!parsed) return false;
  const trimmed = range.trim();
  if (/^\d+\.x$/.test(trimmed)) return parsed[0] === Number(trimmed.split(".")[0]);
  if (/^\d+\.\d+\.x$/.test(trimmed)) {
    const [major, minor] = trimmed.split(".");
    return parsed[0] === Number(major) && parsed[1] === Number(minor);
  }
  if (trimmed.startsWith(">=")) {
    const minimum = parseSemver(trimmed.slice(2).trim());
    return minimum !== null && compareSemver(parsed, minimum) >= 0;
  }
  if (trimmed.startsWith("^")) {
    const minimum = parseSemver(trimmed.slice(1).trim());
    if (!minimum) return false;
    return parsed[0] === minimum[0] && compareSemver(parsed, minimum) >= 0;
  }
  const exact = parseSemver(trimmed);
  return exact !== null && compareSemver(parsed, exact) === 0;
}

function inspectJsonValue(value: unknown, path: string, errors: string[]): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) errors.push(`${path} must contain finite numbers.`);
    return;
  }
  if (typeof value === "string") {
    if (EXECUTABLE_STRING.test(value)) errors.push(`${path} may not contain executable HTML or JavaScript content.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectJsonValue(item, `${path}[${index}]`, errors));
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_CONFIGURATION_KEY.test(key)) errors.push(`${path}.${key} may not store credentials or secrets.`);
      if (EXECUTABLE_CONFIGURATION_KEY.test(key)) errors.push(`${path}.${key} may not define executable code.`);
      inspectJsonValue(nested, `${path}.${key}`, errors);
    }
    return;
  }
  errors.push(`${path} must be JSON data.`);
}

export function validateExperienceModuleManifest(manifest: ExperienceModuleManifestRecord): ManifestValidationResult {
  const errors: string[] = [];
  if (manifest.manifestSchemaVersion !== 1) errors.push("Unsupported manifest schema version.");
  if (!MODULE_ID.test(manifest.id)) errors.push("Module id must be a stable lowercase namespaced identifier.");
  if (!parseSemver(manifest.version)) errors.push("Module version must use semantic versioning.");
  if (!parseSemver(manifest.contractVersion)) errors.push("Contract version must use semantic versioning.");
  if (!Number.isInteger(manifest.configurationSchemaVersion) || manifest.configurationSchemaVersion < 1) {
    errors.push("Configuration schema version must be a positive integer.");
  }

  const routePaths = new Set<string>();
  for (const route of manifest.routes) {
    if (routePaths.has(route.path)) errors.push(`Duplicate module route: ${route.path || "<index>"}.`);
    routePaths.add(route.path);
    if (route.path.startsWith("/") || route.path.includes("..") || /(?:^|\/)(?:platform|org|sign-in|register)(?:\/|$)/.test(route.path)) {
      errors.push(`Module route "${route.path}" must remain relative to the Experience host.`);
    }
  }

  const capabilityKeys = new Set<string>();
  for (const capability of manifest.capabilities) {
    if (!CAPABILITY.test(capability.key)) errors.push(`Invalid capability key: ${capability.key}.`);
    if (capabilityKeys.has(capability.key)) errors.push(`Duplicate capability key: ${capability.key}.`);
    capabilityKeys.add(capability.key);
  }
  for (const route of manifest.routes) {
    if (route.capability && !capabilityKeys.has(route.capability)) {
      errors.push(`Route ${route.path || "<index>"} references undeclared capability ${route.capability}.`);
    }
  }

  const eventNames = new Set<string>();
  for (const event of manifest.eventDefinitions) {
    if (!EVENT.test(event.name)) errors.push(`Invalid Experience event name: ${event.name}.`);
    if (eventNames.has(event.name)) errors.push(`Duplicate Experience event: ${event.name}.`);
    eventNames.add(event.name);
    if (!Number.isInteger(event.schemaVersion) || event.schemaVersion < 1) errors.push(`Event ${event.name} requires a positive schema version.`);
  }
  if (!eventNames.has(manifest.activityDefinition.meaningfulEvent)) {
    errors.push("Meaningful activity must reference a declared module event.");
  }
  if (manifest.activityDefinition.pageViewCountsAsActivity !== false) {
    errors.push("Page views cannot be declared as meaningful activity.");
  }

  for (const [key, field] of Object.entries(manifest.configurationSchema)) {
    if (SENSITIVE_CONFIGURATION_KEY.test(key) || field.sensitive) errors.push(`Configuration field ${key} may not store credentials or secrets.`);
    if (EXECUTABLE_CONFIGURATION_KEY.test(key)) errors.push(`Configuration field ${key} may not define executable code.`);
  }
  for (const key of Object.keys(manifest.defaults)) {
    if (!manifest.configurationSchema[key]) errors.push(`Default ${key} is not declared in configurationSchema.`);
  }
  inspectJsonValue(manifest.defaults as unknown, "defaults", errors);

  return { valid: errors.length === 0, errors };
}

export function evaluateHostCompatibility(
  manifest: ExperienceModuleManifestRecord,
  input: HostCompatibilityInput,
): HostCompatibilityResult {
  const validation = validateExperienceModuleManifest(manifest);
  const hostContractVersion = input.hostContractVersion ?? R6_HOST_CONTRACT_VERSION;
  const reasons: string[] = [];
  let code: HostCompatibilityResult["code"] = "compatible";

  if (!validation.valid) {
    code = "manifest-invalid";
    reasons.push(...validation.errors);
  } else if (!satisfiesVersionRange(hostContractVersion, manifest.compatibility.hostContractRange)) {
    code = "host-contract-incompatible";
    reasons.push(`Host contract ${hostContractVersion} does not satisfy ${manifest.compatibility.hostContractRange}.`);
  } else {
    const hostVersion = parseSemver(input.hostVersion);
    const minimumHostVersion = parseSemver(manifest.compatibility.minimumHostVersion);
    if (!hostVersion || !minimumHostVersion || compareSemver(hostVersion, minimumHostVersion) < 0) {
      code = "host-version-too-old";
      reasons.push(`Host version ${input.hostVersion} is below ${manifest.compatibility.minimumHostVersion}.`);
    }
  }

  return {
    compatible: code === "compatible",
    code,
    reasons,
    hostContractVersion,
    moduleContractVersion: manifest.contractVersion,
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
  };
}

export function projectModuleHostContext(input: ModuleHostContextInput): ModuleHostContextProjection {
  return {
    organizationId: input.organizationId,
    customerId: input.customerId,
    identityId: input.identityId,
    authenticated: input.authenticated,
    accessMode: input.accessMode,
    locale: input.locale,
    timeZone: input.timeZone,
    publishedConfigurationVersion: input.publishedConfigurationVersion,
    entitlements: [...input.entitlements],
  };
}

export function isValidExperienceReturnPath(returnPath: string): boolean {
  if (!returnPath.startsWith("/") || returnPath.startsWith("//") || returnPath.includes("\\")) return false;
  try {
    const parsed = new URL(returnPath, "https://nurture.invalid");
    if (parsed.origin !== "https://nurture.invalid") return false;
    return parsed.pathname === "/experience" || parsed.pathname.startsWith("/experience/") || parsed.pathname === "/app" || parsed.pathname.startsWith("/app/");
  } catch {
    return false;
  }
}

export function validateModuleEventProperties(properties: JsonObject, allowedProperties: readonly string[] | undefined): string[] {
  const errors: string[] = [];
  if (allowedProperties) {
    for (const key of Object.keys(properties)) {
      if (!allowedProperties.includes(key)) errors.push(`Event property ${key} is not declared.`);
    }
  }
  inspectJsonValue(properties as unknown, "properties", errors);
  return errors;
}

export function bindModuleEventProvenance(
  provenance: ModuleEventProvenance,
  properties: JsonObject,
): JsonObject {
  return {
    ...properties,
    moduleId: provenance.moduleId,
    moduleVersion: provenance.moduleVersion,
    installationId: provenance.installationId,
    configurationVersionId: provenance.configurationVersionId ?? null,
    eventSchemaVersion: provenance.eventSchemaVersion,
    dataMode: provenance.dataMode,
  } as JsonObject;
}

export function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
