import type {
  ExperienceModuleManifestRecord,
  HostCompatibilityResult,
  JsonObject,
  ModuleEventProvenance,
} from "./contracts.js";
import { evaluateHostCompatibility, validateExperienceModuleManifest } from "./manifest.js";

export type ConformanceCheckId =
  | "manifest"
  | "host-compatibility"
  | "namespaced-events"
  | "meaningful-activity"
  | "configuration-is-data"
  | "capability-declaration"
  | "data-contract";

export interface ConformanceCheckResult {
  check: ConformanceCheckId;
  passed: boolean;
  details: string[];
}

export interface ModuleConformanceResult {
  moduleId: string;
  moduleVersion: string;
  domainKey: string;
  passed: boolean;
  compatibility: HostCompatibilityResult;
  checks: ConformanceCheckResult[];
}

export interface PortabilityCandidate {
  domainKey: string;
  manifest: ExperienceModuleManifestRecord;
}

export interface PortabilityCertification {
  passed: boolean;
  candidates: ModuleConformanceResult[];
  reasons: string[];
}

function check(condition: boolean, id: ConformanceCheckId, details: string[] = []): ConformanceCheckResult {
  return { check: id, passed: condition, details: condition ? [] : details };
}

export function certifyModuleConformance(input: {
  candidate: PortabilityCandidate;
  hostVersion: string;
  hostContractVersion?: string;
  evaluatedAt?: string;
}): ModuleConformanceResult {
  const { manifest } = input.candidate;
  const validation = validateExperienceModuleManifest(manifest);
  const compatibility = evaluateHostCompatibility(manifest, {
    hostVersion: input.hostVersion,
    hostContractVersion: input.hostContractVersion,
    evaluatedAt: input.evaluatedAt,
  });
  const capabilityKeys = new Set(manifest.capabilities.map((capability) => capability.key));
  const undeclaredRouteCapabilities = manifest.routes
    .map((route) => route.capability)
    .filter((capability): capability is string => Boolean(capability && !capabilityKeys.has(capability)));
  const eventNames = new Set(manifest.eventDefinitions.map((event) => event.name));

  const checks: ConformanceCheckResult[] = [
    check(validation.valid, "manifest", validation.errors),
    check(compatibility.compatible, "host-compatibility", compatibility.reasons),
    check(
      manifest.eventDefinitions.every((event) => event.name.startsWith("experience.")),
      "namespaced-events",
      ["Every module event must remain in the Experience event namespace."],
    ),
    check(
      manifest.activityDefinition.pageViewCountsAsActivity === false && eventNames.has(manifest.activityDefinition.meaningfulEvent),
      "meaningful-activity",
      ["Meaningful activity must be a declared event and cannot be a page view."],
    ),
    check(
      Object.values(manifest.configurationSchema).every((field) => !field.sensitive),
      "configuration-is-data",
      ["Experience configuration may not contain secret-bearing fields."],
    ),
    check(
      undeclaredRouteCapabilities.length === 0,
      "capability-declaration",
      undeclaredRouteCapabilities.map((capability) => `Undeclared route capability ${capability}.`),
    ),
    check(
      Boolean(manifest.dataContract.scope && manifest.dataContract.retention && manifest.dataContract.export && manifest.dataContract.migrationVersion),
      "data-contract",
      ["Module data contract must declare scope, retention, export, and migration version."],
    ),
  ];

  return {
    moduleId: manifest.id,
    moduleVersion: manifest.version,
    domainKey: input.candidate.domainKey,
    passed: checks.every((result) => result.passed),
    compatibility,
    checks,
  };
}

export function certifyPortabilitySet(input: {
  candidates: readonly PortabilityCandidate[];
  hostVersion: string;
  hostContractVersion?: string;
  evaluatedAt?: string;
}): PortabilityCertification {
  const results = input.candidates.map((candidate) => certifyModuleConformance({
    candidate,
    hostVersion: input.hostVersion,
    hostContractVersion: input.hostContractVersion,
    evaluatedAt: input.evaluatedAt,
  }));
  const reasons: string[] = [];
  if (results.length < 2) reasons.push("Portability certification requires at least two Experience modules.");
  if (new Set(results.map((result) => result.moduleId)).size !== results.length) reasons.push("Portability candidates must use distinct module identifiers.");
  if (new Set(results.map((result) => result.domainKey)).size !== results.length) reasons.push("Portability candidates must represent materially different declared domains.");
  if (new Set(input.candidates.map((candidate) => candidate.manifest.activityDefinition.meaningfulEvent)).size !== input.candidates.length) {
    reasons.push("Portability candidates must define distinct meaningful domain activity signals.");
  }
  for (const result of results) {
    if (!result.passed) reasons.push(`${result.moduleId}@${result.moduleVersion} failed conformance.`);
  }
  return { passed: reasons.length === 0, candidates: results, reasons };
}

export type EcosystemOperation =
  | "install"
  | "disable"
  | "uninstall"
  | "upgrade"
  | "rollback"
  | "migration"
  | "module-event"
  | "compatibility-block"
  | "trust-revocation";

export interface EcosystemObservation {
  observationId: string;
  occurredAt: string;
  organizationId: string;
  operation: EcosystemOperation;
  outcome: "succeeded" | "failed" | "blocked";
  provenance: ModuleEventProvenance;
  safeCode?: string;
  properties?: JsonObject;
}

export interface EcosystemModuleSummary {
  moduleId: string;
  moduleVersion: string;
  observations: number;
  succeeded: number;
  failed: number;
  blocked: number;
  operations: Partial<Record<EcosystemOperation, number>>;
}

export function summarizeLiveEcosystemObservations(observations: readonly EcosystemObservation[]): EcosystemModuleSummary[] {
  const summaries = new Map<string, EcosystemModuleSummary>();
  for (const observation of observations) {
    if (observation.provenance.dataMode !== "live") continue;
    const key = `${observation.provenance.moduleId}@${observation.provenance.moduleVersion}`;
    const summary = summaries.get(key) ?? {
      moduleId: observation.provenance.moduleId,
      moduleVersion: observation.provenance.moduleVersion,
      observations: 0,
      succeeded: 0,
      failed: 0,
      blocked: 0,
      operations: {},
    };
    summary.observations += 1;
    summary[observation.outcome] += 1;
    summary.operations[observation.operation] = (summary.operations[observation.operation] ?? 0) + 1;
    summaries.set(key, summary);
  }
  return [...summaries.values()].sort((left, right) => `${left.moduleId}@${left.moduleVersion}`.localeCompare(`${right.moduleId}@${right.moduleVersion}`));
}

export function validateObservationProvenance(observation: EcosystemObservation): string[] {
  const errors: string[] = [];
  if (!observation.organizationId.trim()) errors.push("Observation requires organization scope.");
  if (!observation.provenance.moduleId.trim()) errors.push("Observation requires module id provenance.");
  if (!observation.provenance.moduleVersion.trim()) errors.push("Observation requires module version provenance.");
  if (!observation.provenance.installationId.trim()) errors.push("Observation requires installation provenance.");
  if (!Number.isInteger(observation.provenance.eventSchemaVersion) || observation.provenance.eventSchemaVersion < 1) errors.push("Observation requires a positive event schema version.");
  return errors;
}
