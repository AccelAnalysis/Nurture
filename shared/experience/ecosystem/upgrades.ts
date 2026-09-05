import type {
  ExperienceConfigurationVersion,
  JsonObject,
  MigrationRun,
  ModuleInstallation,
  ModuleUpgradeRun,
  RegisteredModuleVersion,
  UpgradePreflightResult,
} from "./contracts.js";
import { authorizeEcosystemAction, isInstallableTrustStatus, type EcosystemActor } from "./governance.js";

export interface UpgradeClock {
  now(): string;
  id(prefix: string): string;
}

export interface MigrationContext {
  organizationId: string;
  installation: ModuleInstallation;
  fromVersion: RegisteredModuleVersion;
  toVersion: RegisteredModuleVersion;
  publishedConfiguration: ExperienceConfigurationVersion | null;
  checkpoints: readonly string[];
}

export interface MigrationResult {
  checkpoint?: { key: string; safeSummary?: string };
  configuration?: ExperienceConfigurationVersion;
}

export interface ModuleMigrationDescriptor {
  migrationId: string;
  kind: "configuration" | "data";
  moduleId: string;
  fromVersion: string;
  toVersion: string;
  reversible: boolean;
  apply(context: MigrationContext): Promise<MigrationResult>;
  rollback?(context: MigrationContext): Promise<MigrationResult>;
}

export interface UpgradeStatePort {
  getInstallation(organizationId: string, installationId: string): ModuleInstallation | null;
  getModuleVersion(moduleId: string, version: string): RegisteredModuleVersion | null;
  getPublishedConfiguration(installationId: string): ExperienceConfigurationVersion | null;
  saveConfiguration(version: ExperienceConfigurationVersion): void;
  activateVersion(input: {
    actor: EcosystemActor;
    organizationId: string;
    installationId: string;
    expectedFromVersion: string;
    targetVersion: RegisteredModuleVersion;
  }): ModuleInstallation;
  getMigrationRun(runKey: string): MigrationRun | null;
  putMigrationRun(runKey: string, run: MigrationRun): void;
  getUpgradeRun(runKey: string): ModuleUpgradeRun | null;
  putUpgradeRun(runKey: string, run: ModuleUpgradeRun): void;
}

function installable(record: RegisteredModuleVersion | null): record is RegisteredModuleVersion {
  return Boolean(record
    && record.availability === "available"
    && record.compatibility.compatible
    && isInstallableTrustStatus(record.trustDecision.status));
}

function upgradeKey(installationId: string, fromVersion: string, toVersion: string): string {
  return `${installationId}:${fromVersion}->${toVersion}`;
}

function migrationKey(installationId: string, migrationId: string, fromVersion: string, toVersion: string): string {
  return `${installationId}:${migrationId}:${fromVersion}->${toVersion}`;
}

function requiredMigrationKinds(
  fromVersion: RegisteredModuleVersion,
  toVersion: RegisteredModuleVersion,
  configuration: ExperienceConfigurationVersion | null,
): Array<"configuration" | "data"> {
  const required: Array<"configuration" | "data"> = [];
  if (configuration && (
    configuration.schemaVersion !== toVersion.manifest.configurationSchemaVersion
    || configuration.moduleVersion !== toVersion.version
  )) required.push("configuration");
  if (fromVersion.manifest.dataContract.migrationVersion !== toVersion.manifest.dataContract.migrationVersion) required.push("data");
  return required;
}

function findDescriptor(
  descriptors: readonly ModuleMigrationDescriptor[],
  moduleId: string,
  fromVersion: string,
  toVersion: string,
  kind: "configuration" | "data",
): ModuleMigrationDescriptor | null {
  return descriptors.find((descriptor) => descriptor.moduleId === moduleId
    && descriptor.fromVersion === fromVersion
    && descriptor.toVersion === toVersion
    && descriptor.kind === kind) ?? null;
}

function clonePreflight(preflight: UpgradePreflightResult): UpgradePreflightResult {
  return {
    ...preflight,
    compatibility: { ...preflight.compatibility, reasons: [...preflight.compatibility.reasons] },
    requiredConfigurationMigrations: [...preflight.requiredConfigurationMigrations],
    requiredDataMigrations: [...preflight.requiredDataMigrations],
    irreversibleReasons: [...preflight.irreversibleReasons],
    blockers: [...preflight.blockers],
  };
}

export class ModuleUpgradeCoordinator {
  constructor(
    private readonly port: UpgradeStatePort,
    private readonly descriptors: readonly ModuleMigrationDescriptor[],
    private readonly clock: UpgradeClock,
  ) {}

  preflight(input: {
    actor: EcosystemActor;
    organizationId: string;
    installationId: string;
    toVersion: string;
  }): UpgradePreflightResult {
    const authorization = authorizeEcosystemAction({ actor: input.actor, action: "installation.upgrade", organizationId: input.organizationId });
    const blockers: string[] = [];
    if (!authorization.allowed) blockers.push(`Authorization failed: ${authorization.reason}.`);

    const installation = this.port.getInstallation(input.organizationId, input.installationId);
    if (!installation) throw new Error("Installation was not found in the validated organization scope.");
    const fromVersion = this.port.getModuleVersion(installation.moduleId, installation.activeVersion);
    if (!fromVersion) throw new Error("The currently installed module version is no longer present in the registry.");
    const target = this.port.getModuleVersion(installation.moduleId, input.toVersion);
    if (!target) blockers.push("Target module version is not registered.");
    if (target && target.availability !== "available") blockers.push(`Target module availability is ${target.availability}.`);
    if (target && !isInstallableTrustStatus(target.trustDecision.status)) blockers.push(`Target module trust status is ${target.trustDecision.status}.`);
    if (target && !target.compatibility.compatible) blockers.push(`Target module is not compatible: ${target.compatibility.code}.`);
    if (installation.activeVersion === input.toVersion) blockers.push("Target version is already active.");

    const configuration = this.port.getPublishedConfiguration(input.installationId);
    const kinds = target ? requiredMigrationKinds(fromVersion, target, configuration) : [];
    const configDescriptor = target && kinds.includes("configuration")
      ? findDescriptor(this.descriptors, installation.moduleId, installation.activeVersion, input.toVersion, "configuration")
      : null;
    const dataDescriptor = target && kinds.includes("data")
      ? findDescriptor(this.descriptors, installation.moduleId, installation.activeVersion, input.toVersion, "data")
      : null;
    if (kinds.includes("configuration") && !configDescriptor) blockers.push("Required configuration migration is missing.");
    if (kinds.includes("data") && !dataDescriptor) blockers.push("Required data migration is missing.");

    const requiredDescriptors = [configDescriptor, dataDescriptor].filter((value): value is ModuleMigrationDescriptor => value !== null);
    const irreversibleReasons = requiredDescriptors
      .filter((descriptor) => !descriptor.reversible || !descriptor.rollback)
      .map((descriptor) => descriptor.reversible
        ? `${descriptor.migrationId} has no rollback handler.`
        : `${descriptor.migrationId} is declared irreversible.`);

    const compatibility = target?.compatibility ?? {
      compatible: false,
      code: "manifest-invalid" as const,
      reasons: ["Target module version is not registered."],
      hostContractVersion: fromVersion.compatibility.hostContractVersion,
      moduleContractVersion: fromVersion.manifest.contractVersion,
      evaluatedAt: this.clock.now(),
    };

    return {
      allowed: blockers.length === 0,
      installationId: installation.installationId,
      fromVersion: installation.activeVersion,
      toVersion: input.toVersion,
      trustStatus: target?.trustDecision.status ?? "registered",
      compatibility: { ...compatibility, reasons: [...compatibility.reasons] },
      requiredConfigurationMigrations: configDescriptor ? [configDescriptor.migrationId] : [],
      requiredDataMigrations: dataDescriptor ? [dataDescriptor.migrationId] : [],
      rollbackSupported: blockers.length === 0 && irreversibleReasons.length === 0,
      irreversibleReasons,
      blockers,
    };
  }

  async execute(input: {
    actor: EcosystemActor;
    organizationId: string;
    installationId: string;
    toVersion: string;
  }): Promise<ModuleUpgradeRun> {
    const preflight = this.preflight(input);
    const key = upgradeKey(input.installationId, preflight.fromVersion, input.toVersion);
    const existing = this.port.getUpgradeRun(key);
    if (existing?.state === "succeeded") return { ...existing, preflight: clonePreflight(existing.preflight), migrationRunIds: [...existing.migrationRunIds] };

    const run: ModuleUpgradeRun = existing ?? {
      upgradeRunId: this.clock.id("upgrade"),
      installationId: input.installationId,
      organizationId: input.organizationId,
      moduleId: this.requireInstallation(input.organizationId, input.installationId).moduleId,
      fromVersion: preflight.fromVersion,
      toVersion: input.toVersion,
      state: preflight.allowed ? "planned" : "blocked",
      preflight: clonePreflight(preflight),
      migrationRunIds: [],
      startedAt: this.clock.now(),
    };
    if (!preflight.allowed) {
      this.port.putUpgradeRun(key, run);
      return run;
    }

    run.state = "running";
    this.port.putUpgradeRun(key, run);
    try {
      const installation = this.requireInstallation(input.organizationId, input.installationId);
      if (installation.activeVersion !== preflight.fromVersion) throw new Error("Installation changed after upgrade preflight.");
      const fromVersion = this.requireVersion(installation.moduleId, preflight.fromVersion);
      const target = this.requireVersion(installation.moduleId, input.toVersion);
      if (!installable(target)) throw new Error("Target module version is no longer trusted, compatible, and available.");
      let configuration = this.port.getPublishedConfiguration(input.installationId);

      const migrationIds = [...preflight.requiredConfigurationMigrations, ...preflight.requiredDataMigrations];
      for (const migrationId of migrationIds) {
        const descriptor = this.descriptors.find((candidate) => candidate.migrationId === migrationId);
        if (!descriptor) throw new Error(`Migration ${migrationId} disappeared after preflight.`);
        const runKey = migrationKey(input.installationId, descriptor.migrationId, preflight.fromVersion, input.toVersion);
        let migrationRun = this.port.getMigrationRun(runKey);
        if (migrationRun?.state === "succeeded") {
          if (!run.migrationRunIds.includes(migrationRun.migrationRunId)) run.migrationRunIds.push(migrationRun.migrationRunId);
          continue;
        }
        migrationRun = migrationRun ?? {
          migrationRunId: this.clock.id("migration"),
          installationId: input.installationId,
          organizationId: input.organizationId,
          moduleId: installation.moduleId,
          fromVersion: preflight.fromVersion,
          toVersion: input.toVersion,
          migrationId: descriptor.migrationId,
          state: "pending",
          checkpoints: [],
          startedAt: this.clock.now(),
        };
        migrationRun.state = "running";
        this.port.putMigrationRun(runKey, migrationRun);
        let result: MigrationResult;
        try {
          result = await descriptor.apply({
            organizationId: input.organizationId,
            installation,
            fromVersion,
            toVersion: target,
            publishedConfiguration: configuration,
            checkpoints: migrationRun.checkpoints.map((checkpoint) => checkpoint.key),
          });
        } catch (error) {
          migrationRun.state = "failed";
          migrationRun.errorCode = error instanceof Error ? error.name || "migration-failed" : "migration-failed";
          migrationRun.finishedAt = this.clock.now();
          this.port.putMigrationRun(runKey, migrationRun);
          throw error;
        }
        if (result.configuration) {
          if (result.configuration.organizationId !== input.organizationId || result.configuration.installationId !== input.installationId) {
            throw new Error("Migration attempted to write configuration outside the validated installation scope.");
          }
          configuration = result.configuration;
          this.port.saveConfiguration(result.configuration);
        }
        if (result.checkpoint && !migrationRun.checkpoints.some((checkpoint) => checkpoint.key === result.checkpoint!.key)) {
          migrationRun.checkpoints.push({ ...result.checkpoint, completedAt: this.clock.now() });
        }
        migrationRun.state = "succeeded";
        migrationRun.finishedAt = this.clock.now();
        this.port.putMigrationRun(runKey, migrationRun);
        if (!run.migrationRunIds.includes(migrationRun.migrationRunId)) run.migrationRunIds.push(migrationRun.migrationRunId);
        this.port.putUpgradeRun(key, run);
      }

      const current = this.requireInstallation(input.organizationId, input.installationId);
      if (current.activeVersion !== preflight.fromVersion) throw new Error("Installation changed before version activation.");
      const currentTarget = this.requireVersion(current.moduleId, input.toVersion);
      if (!installable(currentTarget)) throw new Error("Target module version failed the final trust/compatibility check.");
      this.port.activateVersion({
        actor: input.actor,
        organizationId: input.organizationId,
        installationId: input.installationId,
        expectedFromVersion: preflight.fromVersion,
        targetVersion: currentTarget,
      });
      run.state = "succeeded";
      run.activatedAt = this.clock.now();
      run.finishedAt = this.clock.now();
      this.port.putUpgradeRun(key, run);
      return { ...run, preflight: clonePreflight(run.preflight), migrationRunIds: [...run.migrationRunIds] };
    } catch (error) {
      run.state = "failed";
      run.failureReason = error instanceof Error ? error.message : "Upgrade failed.";
      run.finishedAt = this.clock.now();
      this.port.putUpgradeRun(key, run);
      return { ...run, preflight: clonePreflight(run.preflight), migrationRunIds: [...run.migrationRunIds] };
    }
  }

  async rollback(input: {
    actor: EcosystemActor;
    organizationId: string;
    installationId: string;
    fromVersion: string;
    toVersion: string;
  }): Promise<ModuleUpgradeRun> {
    const authorization = authorizeEcosystemAction({ actor: input.actor, action: "installation.upgrade", organizationId: input.organizationId });
    if (!authorization.allowed) throw new Error(`Not authorized to roll back an upgrade: ${authorization.reason}.`);
    const key = upgradeKey(input.installationId, input.fromVersion, input.toVersion);
    const run = this.port.getUpgradeRun(key);
    if (!run || run.state !== "succeeded") throw new Error("Only a successfully activated upgrade can be rolled back.");
    if (!run.preflight.rollbackSupported) throw new Error(`Upgrade rollback is not supported: ${run.preflight.irreversibleReasons.join(" ")}`);

    const installation = this.requireInstallation(input.organizationId, input.installationId);
    if (installation.activeVersion !== input.toVersion) throw new Error("Installation no longer matches the upgraded version.");
    const original = this.requireVersion(installation.moduleId, input.fromVersion);
    const upgraded = this.requireVersion(installation.moduleId, input.toVersion);
    if (!installable(original)) throw new Error("Original module version is no longer trusted, compatible, and available for rollback.");

    let configuration = this.port.getPublishedConfiguration(input.installationId);
    const descriptorIds = [...run.preflight.requiredConfigurationMigrations, ...run.preflight.requiredDataMigrations].reverse();
    for (const migrationId of descriptorIds) {
      const descriptor = this.descriptors.find((candidate) => candidate.migrationId === migrationId);
      if (!descriptor?.reversible || !descriptor.rollback) throw new Error(`Migration ${migrationId} cannot be rolled back safely.`);
      const result = await descriptor.rollback({
        organizationId: input.organizationId,
        installation,
        fromVersion: original,
        toVersion: upgraded,
        publishedConfiguration: configuration,
        checkpoints: [],
      });
      if (result.configuration) {
        if (result.configuration.organizationId !== input.organizationId || result.configuration.installationId !== input.installationId) {
          throw new Error("Rollback attempted to write configuration outside the validated installation scope.");
        }
        configuration = result.configuration;
        this.port.saveConfiguration(result.configuration);
      }
    }

    const currentOriginal = this.requireVersion(installation.moduleId, input.fromVersion);
    if (!installable(currentOriginal)) throw new Error("Original module version failed the final rollback trust/compatibility check.");
    this.port.activateVersion({
      actor: input.actor,
      organizationId: input.organizationId,
      installationId: input.installationId,
      expectedFromVersion: input.toVersion,
      targetVersion: currentOriginal,
    });
    run.state = "rolled-back";
    run.finishedAt = this.clock.now();
    this.port.putUpgradeRun(key, run);
    return { ...run, preflight: clonePreflight(run.preflight), migrationRunIds: [...run.migrationRunIds] };
  }

  private requireInstallation(organizationId: string, installationId: string): ModuleInstallation {
    const installation = this.port.getInstallation(organizationId, installationId);
    if (!installation) throw new Error("Installation was not found in the validated organization scope.");
    return installation;
  }

  private requireVersion(moduleId: string, version: string): RegisteredModuleVersion {
    const record = this.port.getModuleVersion(moduleId, version);
    if (!record) throw new Error(`Module version ${moduleId}@${version} is not registered.`);
    return record;
  }
}
