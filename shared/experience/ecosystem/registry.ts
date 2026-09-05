import type {
  ExperienceRegistryEntry,
  ModuleInstallation,
  ModuleInstallationHistoryEntry,
  RegisteredModuleVersion,
} from "./contracts.js";
import { installationKey, moduleVersionKey } from "./contracts.js";
import {
  authorizeEcosystemAction,
  isInstallableTrustStatus,
  type EcosystemActor,
} from "./governance.js";
import { validateExperienceModuleManifest } from "./manifest.js";

export interface EcosystemRegistryClock {
  now(): string;
  id(prefix: string): string;
}

export interface ExperienceRegistryStore {
  getVersion(moduleId: string, version: string): RegisteredModuleVersion | null;
  putVersion(record: RegisteredModuleVersion): void;
  listVersions(moduleId?: string): RegisteredModuleVersion[];
  getInstallation(installationId: string): ModuleInstallation | null;
  findCurrentInstallation(organizationId: string, moduleId: string): ModuleInstallation | null;
  putInstallation(installation: ModuleInstallation): void;
  listInstallationsByVersion(moduleId: string, moduleVersion: string): ModuleInstallation[];
  appendHistory(entry: ModuleInstallationHistoryEntry): void;
  listHistory(installationId: string): ModuleInstallationHistoryEntry[];
}

function cloneVersion(record: RegisteredModuleVersion): RegisteredModuleVersion {
  return {
    ...record,
    manifest: JSON.parse(JSON.stringify(record.manifest)) as RegisteredModuleVersion["manifest"],
    compatibility: { ...record.compatibility, reasons: [...record.compatibility.reasons] },
    trustDecision: { ...record.trustDecision },
  };
}

function cloneInstallation(installation: ModuleInstallation): ModuleInstallation {
  return { ...installation };
}

function cloneHistory(entry: ModuleInstallationHistoryEntry): ModuleInstallationHistoryEntry {
  return { ...entry };
}

export class InMemoryExperienceRegistryStore implements ExperienceRegistryStore {
  private readonly versions = new Map<string, RegisteredModuleVersion>();
  private readonly installations = new Map<string, ModuleInstallation>();
  private readonly histories = new Map<string, ModuleInstallationHistoryEntry[]>();

  getVersion(moduleId: string, version: string): RegisteredModuleVersion | null {
    const record = this.versions.get(moduleVersionKey(moduleId, version));
    return record ? cloneVersion(record) : null;
  }

  putVersion(record: RegisteredModuleVersion): void {
    this.versions.set(moduleVersionKey(record.moduleId, record.version), cloneVersion(record));
  }

  listVersions(moduleId?: string): RegisteredModuleVersion[] {
    return [...this.versions.values()]
      .filter((record) => !moduleId || record.moduleId === moduleId)
      .map(cloneVersion);
  }

  getInstallation(installationId: string): ModuleInstallation | null {
    const installation = this.installations.get(installationId);
    return installation ? cloneInstallation(installation) : null;
  }

  findCurrentInstallation(organizationId: string, moduleId: string): ModuleInstallation | null {
    return [...this.installations.values()]
      .find((installation) => installation.organizationId === organizationId && installation.moduleId === moduleId && installation.state !== "uninstalled") ?? null;
  }

  putInstallation(installation: ModuleInstallation): void {
    this.installations.set(installation.installationId, cloneInstallation(installation));
  }

  listInstallationsByVersion(moduleId: string, moduleVersion: string): ModuleInstallation[] {
    return [...this.installations.values()]
      .filter((installation) => installation.moduleId === moduleId && installation.activeVersion === moduleVersion && installation.state !== "uninstalled")
      .map(cloneInstallation);
  }

  appendHistory(entry: ModuleInstallationHistoryEntry): void {
    const entries = this.histories.get(entry.installationId) ?? [];
    entries.push(cloneHistory(entry));
    this.histories.set(entry.installationId, entries);
  }

  listHistory(installationId: string): ModuleInstallationHistoryEntry[] {
    return (this.histories.get(installationId) ?? []).map(cloneHistory);
  }
}

export interface RegisterModuleVersionInput {
  actor: EcosystemActor;
  record: RegisteredModuleVersion;
}

export interface InstallModuleInput {
  actor: EcosystemActor;
  organizationId: string;
  moduleId: string;
  version: string;
  slot: "primary" | "secondary";
}

export class ExperienceRegistryService {
  constructor(
    private readonly store: ExperienceRegistryStore,
    private readonly clock: EcosystemRegistryClock,
  ) {}

  registerVersion(input: RegisterModuleVersionInput): RegisteredModuleVersion {
    const authorization = authorizeEcosystemAction({ actor: input.actor, action: "module.register" });
    if (!authorization.allowed) throw new Error(`Not authorized to register modules: ${authorization.reason}.`);
    const validation = validateExperienceModuleManifest(input.record.manifest);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    if (input.record.moduleId !== input.record.manifest.id || input.record.version !== input.record.manifest.version) {
      throw new Error("Registry record identity must match the manifest identity and version.");
    }
    if (input.record.trustDecision.moduleId !== input.record.moduleId || input.record.trustDecision.moduleVersion !== input.record.version) {
      throw new Error("Trust decision identity does not match the registry version.");
    }
    if (input.record.compatibility.moduleContractVersion !== input.record.manifest.contractVersion) {
      throw new Error("Compatibility decision does not match the manifest contract version.");
    }
    if (this.store.getVersion(input.record.moduleId, input.record.version)) {
      throw new Error(`Module version ${moduleVersionKey(input.record.moduleId, input.record.version)} is already registered.`);
    }
    this.store.putVersion(input.record);
    return cloneVersion(input.record);
  }

  listRegistry(): ExperienceRegistryEntry[] {
    const grouped = new Map<string, RegisteredModuleVersion[]>();
    for (const version of this.store.listVersions()) {
      const versions = grouped.get(version.moduleId) ?? [];
      versions.push(version);
      grouped.set(version.moduleId, versions);
    }
    return [...grouped.entries()].map(([moduleId, versions]) => {
      const latest = [...versions].sort((left, right) => right.version.localeCompare(left.version))[0];
      return {
        moduleId,
        name: latest.manifest.name,
        description: latest.manifest.description,
        icon: latest.manifest.icon,
        versions: versions.map(cloneVersion),
      };
    });
  }

  listInstallableVersions(moduleId?: string): RegisteredModuleVersion[] {
    return this.store.listVersions(moduleId).filter((record) => this.isInstallable(record));
  }

  private isInstallable(record: RegisteredModuleVersion): boolean {
    return record.availability === "available"
      && isInstallableTrustStatus(record.trustDecision.status)
      && record.compatibility.compatible;
  }

  install(input: InstallModuleInput): ModuleInstallation {
    const authorization = authorizeEcosystemAction({ actor: input.actor, action: "installation.install", organizationId: input.organizationId });
    if (!authorization.allowed) throw new Error(`Not authorized to install Experience modules: ${authorization.reason}.`);
    const record = this.store.getVersion(input.moduleId, input.version);
    if (!record || !this.isInstallable(record)) throw new Error("Requested module version is not currently trusted, compatible, and available for installation.");
    const existing = this.store.findCurrentInstallation(input.organizationId, input.moduleId);
    if (existing) {
      throw new Error("An active installation already exists. Module versions change only through the controlled upgrade workflow.");
    }
    const now = this.clock.now();
    const installation: ModuleInstallation = {
      installationId: this.clock.id(`installation-${installationKey(input.organizationId, input.moduleId)}`),
      organizationId: input.organizationId,
      moduleId: input.moduleId,
      activeVersion: input.version,
      state: "installed",
      slot: input.slot,
      installedAt: now,
      updatedAt: now,
      trustDecisionId: record.trustDecision.decisionId,
      hostContractVersion: record.compatibility.hostContractVersion,
    };
    this.store.putInstallation(installation);
    this.recordHistory(installation, "installed", input.actor.actorId);
    return cloneInstallation(installation);
  }

  setDisabled(input: { actor: EcosystemActor; organizationId: string; installationId: string; disabled: boolean; reason?: string }): ModuleInstallation {
    const action = input.disabled ? "installation.disable" : "installation.configure";
    const authorization = authorizeEcosystemAction({ actor: input.actor, action, organizationId: input.organizationId });
    if (!authorization.allowed) throw new Error(`Not authorized to change installation state: ${authorization.reason}.`);
    const installation = this.requireScopedInstallation(input.installationId, input.organizationId);
    if (installation.state === "uninstalled") throw new Error("An uninstalled module cannot be re-enabled; install a new version instead.");
    installation.state = input.disabled ? "disabled" : "installed";
    installation.updatedAt = this.clock.now();
    this.store.putInstallation(installation);
    this.recordHistory(installation, input.disabled ? "disabled" : "enabled", input.actor.actorId, input.reason);
    return cloneInstallation(installation);
  }

  uninstall(input: { actor: EcosystemActor; organizationId: string; installationId: string; reason?: string }): ModuleInstallation {
    const authorization = authorizeEcosystemAction({ actor: input.actor, action: "installation.uninstall", organizationId: input.organizationId });
    if (!authorization.allowed) throw new Error(`Not authorized to uninstall Experience modules: ${authorization.reason}.`);
    const installation = this.requireScopedInstallation(input.installationId, input.organizationId);
    installation.state = "uninstalled";
    installation.updatedAt = this.clock.now();
    this.store.putInstallation(installation);
    this.recordHistory(installation, "uninstalled", input.actor.actorId, input.reason);
    return cloneInstallation(installation);
  }

  emergencyDisableRevokedVersion(input: {
    actor: EcosystemActor;
    moduleId: string;
    moduleVersion: string;
    trustDecisionId: string;
    reason: string;
  }): ModuleInstallation[] {
    const authorization = authorizeEcosystemAction({ actor: input.actor, action: "module.emergency-disable" });
    if (!authorization.allowed) throw new Error(`Not authorized for emergency module disable: ${authorization.reason}.`);
    const record = this.store.getVersion(input.moduleId, input.moduleVersion);
    if (!record || record.trustDecision.status !== "revoked" || record.trustDecision.decisionId !== input.trustDecisionId) {
      throw new Error("Emergency disable requires the current revoked trust decision for this exact module version.");
    }
    const installations = this.store.listInstallationsByVersion(input.moduleId, input.moduleVersion);
    for (const installation of installations) {
      installation.state = "disabled";
      installation.updatedAt = this.clock.now();
      installation.trustDecisionId = input.trustDecisionId;
      this.store.putInstallation(installation);
      this.recordHistory(installation, "trust-revoked", input.actor.actorId, input.reason);
    }
    return installations.map(cloneInstallation);
  }

  getInstallation(organizationId: string, installationId: string): ModuleInstallation | null {
    const installation = this.store.getInstallation(installationId);
    return installation?.organizationId === organizationId ? cloneInstallation(installation) : null;
  }

  listHistory(organizationId: string, installationId: string): ModuleInstallationHistoryEntry[] {
    this.requireScopedInstallation(installationId, organizationId);
    return this.store.listHistory(installationId);
  }

  /** Track D uses this only after its upgrade/migration transaction succeeds. */
  activateValidatedUpgrade(input: {
    actor: EcosystemActor;
    organizationId: string;
    installationId: string;
    fromVersion: string;
    toVersion: string;
    trustDecisionId: string;
  }): ModuleInstallation {
    const authorization = authorizeEcosystemAction({ actor: input.actor, action: "installation.upgrade", organizationId: input.organizationId });
    if (!authorization.allowed) throw new Error(`Not authorized to activate an upgrade: ${authorization.reason}.`);
    const installation = this.requireScopedInstallation(input.installationId, input.organizationId);
    if (installation.activeVersion !== input.fromVersion) throw new Error("Installation version changed after upgrade preflight.");
    const target = this.store.getVersion(installation.moduleId, input.toVersion);
    if (!target || !this.isInstallable(target) || target.trustDecision.decisionId !== input.trustDecisionId) {
      throw new Error("Target module version is no longer trusted, compatible, and available.");
    }
    installation.activeVersion = input.toVersion;
    installation.trustDecisionId = target.trustDecision.decisionId;
    installation.hostContractVersion = target.compatibility.hostContractVersion;
    installation.state = "installed";
    installation.updatedAt = this.clock.now();
    this.store.putInstallation(installation);
    this.recordHistory(installation, "upgraded", input.actor.actorId, undefined, input.fromVersion);
    return cloneInstallation(installation);
  }

  private requireScopedInstallation(installationId: string, organizationId: string): ModuleInstallation {
    const installation = this.store.getInstallation(installationId);
    if (!installation || installation.organizationId !== organizationId) throw new Error("Installation was not found in the validated organization scope.");
    return installation;
  }

  private recordHistory(
    installation: ModuleInstallation,
    action: ModuleInstallationHistoryEntry["action"],
    actorId: string,
    reason?: string,
    previousVersion?: string,
  ): void {
    this.store.appendHistory({
      historyId: this.clock.id(`history-${installation.installationId}`),
      installationId: installation.installationId,
      organizationId: installation.organizationId,
      moduleId: installation.moduleId,
      moduleVersion: installation.activeVersion,
      action,
      actorId,
      occurredAt: this.clock.now(),
      reason,
      previousVersion,
    });
  }
}
