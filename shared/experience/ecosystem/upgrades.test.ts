import { describe, expect, it } from "vitest";
import type {
  ExperienceConfigurationVersion,
  ExperienceModuleManifestRecord,
  MigrationRun,
  ModuleInstallation,
  ModuleUpgradeRun,
  RegisteredModuleVersion,
} from "./contracts.js";
import type { EcosystemActor } from "./governance.js";
import {
  ModuleUpgradeCoordinator,
  type ModuleMigrationDescriptor,
  type UpgradeClock,
  type UpgradeStatePort,
} from "./upgrades.js";

function manifest(version: string, configurationSchemaVersion: number, migrationVersion: string): ExperienceModuleManifestRecord {
  return {
    manifestSchemaVersion: 1,
    id: "nurture.focus-timer",
    version,
    contractVersion: "1.0.0",
    name: "Focus Timer",
    description: "Upgrade fixture",
    icon: "/brand/logo/nurture-n.svg",
    routes: [{ path: "", label: "Timer", access: ["authenticated"], capability: "experience.focus-timer.use" }],
    navigation: [{ path: "", label: "Timer", access: ["authenticated"], capability: "experience.focus-timer.use" }],
    configurationSchemaVersion,
    configurationSchema: {
      minutes: { type: "number", label: "Minutes", required: true, min: 1, max: 180 },
      ...(configurationSchemaVersion >= 2 ? { completionLabel: { type: "string" as const, label: "Completion label", required: true } } : {}),
    },
    defaults: configurationSchemaVersion >= 2 ? { minutes: 25, completionLabel: "Done" } : { minutes: 25 },
    capabilities: [{ key: "experience.focus-timer.use", label: "Use", description: "Use timer", availability: ["authenticated"] }],
    eventDefinitions: [{ name: "experience.focus-timer.completed", description: "Completed", source: "server", schemaVersion: 1, requiresServerValidation: true }],
    profileRequirements: [],
    onboardingRequirements: [],
    activityDefinition: { meaningfulEvent: "experience.focus-timer.completed", description: "Completion", pageViewCountsAsActivity: false },
    dataContract: {
      scope: "organization-customer",
      retention: "Retained until explicit deletion policy applies.",
      export: "Export supported.",
      migrationVersion,
      deletionBehavior: "preserve-until-explicit-delete",
    },
    compatibility: { hostContractRange: "1.x", minimumHostVersion: "0.1.0", unavailableBehavior: "Unavailable" },
  };
}

function versionRecord(version: string, schema: number, migrationVersion: string, overrides: Partial<RegisteredModuleVersion> = {}): RegisteredModuleVersion {
  const moduleManifest = manifest(version, schema, migrationVersion);
  return {
    moduleId: moduleManifest.id,
    version,
    manifest: moduleManifest,
    availability: "available",
    trustDecision: {
      moduleId: moduleManifest.id,
      moduleVersion: version,
      status: "trusted",
      decisionId: `trust-${version}`,
      reviewedArtifactId: `artifact-${version}`,
      manifestDigest: `sha256:${version}`,
      decidedBy: "reviewer",
      decidedAt: "2026-09-05T00:00:00.000Z",
    },
    compatibility: {
      compatible: true,
      code: "compatible",
      reasons: [],
      hostContractVersion: "1.0.0",
      moduleContractVersion: "1.0.0",
      evaluatedAt: "2026-09-05T00:00:00.000Z",
    },
    registeredAt: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}

function configuration(moduleVersion = "1.0.0", schemaVersion = 1): ExperienceConfigurationVersion {
  return {
    configurationVersionId: `cfg-${moduleVersion}-${schemaVersion}`,
    installationId: "inst-focus",
    organizationId: "org-a",
    moduleId: "nurture.focus-timer",
    moduleVersion,
    schemaVersion,
    values: schemaVersion >= 2 ? { minutes: 25, completionLabel: "Done" } : { minutes: 25 },
    capabilityMappings: [],
    onboardingMappings: [],
    createdAt: "2026-09-05T00:00:00.000Z",
    createdBy: "admin",
    status: "published",
  };
}

function installation(): ModuleInstallation {
  return {
    installationId: "inst-focus",
    organizationId: "org-a",
    moduleId: "nurture.focus-timer",
    activeVersion: "1.0.0",
    state: "installed",
    slot: "secondary",
    installedAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
    publishedConfigurationVersion: "cfg-1.0.0-1",
    trustDecisionId: "trust-1.0.0",
    hostContractVersion: "1.0.0",
  };
}

function clock(): UpgradeClock {
  let sequence = 0;
  return {
    now: () => `2026-09-05T00:01:${String(sequence).padStart(2, "0")}.000Z`,
    id: (prefix) => `${prefix}-${++sequence}`,
  };
}

class InMemoryUpgradePort implements UpgradeStatePort {
  currentInstallation = installation();
  currentConfiguration: ExperienceConfigurationVersion | null = configuration();
  versions = new Map<string, RegisteredModuleVersion>([
    ["1.0.0", versionRecord("1.0.0", 1, "1")],
    ["2.0.0", versionRecord("2.0.0", 2, "2")],
  ]);
  migrationRuns = new Map<string, MigrationRun>();
  upgradeRuns = new Map<string, ModuleUpgradeRun>();
  savedConfigurations: ExperienceConfigurationVersion[] = [];
  activationCount = 0;

  getInstallation(organizationId: string, installationId: string): ModuleInstallation | null {
    if (organizationId !== this.currentInstallation.organizationId || installationId !== this.currentInstallation.installationId) return null;
    return { ...this.currentInstallation };
  }

  getModuleVersion(moduleId: string, version: string): RegisteredModuleVersion | null {
    const record = this.versions.get(version);
    if (!record || record.moduleId !== moduleId) return null;
    return JSON.parse(JSON.stringify(record)) as RegisteredModuleVersion;
  }

  getPublishedConfiguration(installationId: string): ExperienceConfigurationVersion | null {
    if (installationId !== this.currentInstallation.installationId || !this.currentConfiguration) return null;
    return JSON.parse(JSON.stringify(this.currentConfiguration)) as ExperienceConfigurationVersion;
  }

  saveConfiguration(version: ExperienceConfigurationVersion): void {
    this.savedConfigurations.push(JSON.parse(JSON.stringify(version)) as ExperienceConfigurationVersion);
    this.currentConfiguration = JSON.parse(JSON.stringify(version)) as ExperienceConfigurationVersion;
  }

  activateVersion(input: {
    actor: EcosystemActor;
    organizationId: string;
    installationId: string;
    expectedFromVersion: string;
    targetVersion: RegisteredModuleVersion;
  }): ModuleInstallation {
    if (input.organizationId !== this.currentInstallation.organizationId || input.installationId !== this.currentInstallation.installationId) {
      throw new Error("Wrong organization or installation scope.");
    }
    if (this.currentInstallation.activeVersion !== input.expectedFromVersion) throw new Error("Active version changed.");
    if (input.targetVersion.availability !== "available" || input.targetVersion.trustDecision.status !== "trusted" || !input.targetVersion.compatibility.compatible) {
      throw new Error("Target is not installable.");
    }
    this.activationCount += 1;
    this.currentInstallation = {
      ...this.currentInstallation,
      activeVersion: input.targetVersion.version,
      trustDecisionId: input.targetVersion.trustDecision.decisionId,
      hostContractVersion: input.targetVersion.compatibility.hostContractVersion,
    };
    return { ...this.currentInstallation };
  }

  getMigrationRun(runKey: string): MigrationRun | null {
    const run = this.migrationRuns.get(runKey);
    return run ? JSON.parse(JSON.stringify(run)) as MigrationRun : null;
  }

  putMigrationRun(runKey: string, run: MigrationRun): void {
    this.migrationRuns.set(runKey, JSON.parse(JSON.stringify(run)) as MigrationRun);
  }

  getUpgradeRun(runKey: string): ModuleUpgradeRun | null {
    const run = this.upgradeRuns.get(runKey);
    return run ? JSON.parse(JSON.stringify(run)) as ModuleUpgradeRun : null;
  }

  putUpgradeRun(runKey: string, run: ModuleUpgradeRun): void {
    this.upgradeRuns.set(runKey, JSON.parse(JSON.stringify(run)) as ModuleUpgradeRun);
  }
}

const orgActor: EcosystemActor = {
  actorId: "org-admin",
  organizationId: "org-a",
  organizationCapabilities: ["experience.manage", "experience.publish"],
};

function migrationDescriptors(counters = { configuration: 0, data: 0, rollbackConfiguration: 0, rollbackData: 0 }): ModuleMigrationDescriptor[] {
  return [
    {
      migrationId: "focus-config-v1-v2",
      kind: "configuration",
      moduleId: "nurture.focus-timer",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
      reversible: true,
      async apply(context) {
        counters.configuration += 1;
        if (!context.publishedConfiguration) throw new Error("Missing configuration.");
        return {
          checkpoint: { key: "config-v2", safeSummary: "Configuration schema migrated." },
          configuration: {
            ...context.publishedConfiguration,
            configurationVersionId: "cfg-2.0.0-2-migrated",
            moduleVersion: "2.0.0",
            schemaVersion: 2,
            values: { ...context.publishedConfiguration.values, completionLabel: "Done" },
            createdAt: "2026-09-05T00:02:00.000Z",
            createdBy: "system:migration",
            status: "published",
          },
        };
      },
      async rollback(context) {
        counters.rollbackConfiguration += 1;
        if (!context.publishedConfiguration) throw new Error("Missing configuration.");
        return {
          configuration: {
            ...context.publishedConfiguration,
            configurationVersionId: "cfg-1.0.0-restored",
            moduleVersion: "1.0.0",
            schemaVersion: 1,
            values: { minutes: 25 },
            createdAt: "2026-09-05T00:03:00.000Z",
            createdBy: "system:rollback",
            status: "published",
          },
        };
      },
    },
    {
      migrationId: "focus-data-v1-v2",
      kind: "data",
      moduleId: "nurture.focus-timer",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
      reversible: true,
      async apply() {
        counters.data += 1;
        return { checkpoint: { key: "data-v2", safeSummary: "Domain records migrated." } };
      },
      async rollback() {
        counters.rollbackData += 1;
        return { checkpoint: { key: "data-v1", safeSummary: "Domain records restored." } };
      },
    },
  ];
}

describe("Release 6 controlled Experience upgrades and migrations", () => {
  it("blocks preflight when target trust or compatibility is no longer valid", () => {
    const port = new InMemoryUpgradePort();
    port.versions.set("2.0.0", versionRecord("2.0.0", 2, "2", {
      trustDecision: { ...versionRecord("2.0.0", 2, "2").trustDecision, status: "revoked" },
      compatibility: { ...versionRecord("2.0.0", 2, "2").compatibility, compatible: false, code: "host-contract-incompatible" },
    }));
    const result = new ModuleUpgradeCoordinator(port, migrationDescriptors(), clock()).preflight({
      actor: orgActor,
      organizationId: "org-a",
      installationId: "inst-focus",
      toVersion: "2.0.0",
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/trust status is revoked/);
    expect(result.blockers.join(" ")).toMatch(/not compatible/);
  });

  it("blocks an upgrade when required configuration or data migrations are missing", () => {
    const port = new InMemoryUpgradePort();
    const result = new ModuleUpgradeCoordinator(port, [], clock()).preflight({
      actor: orgActor,
      organizationId: "org-a",
      installationId: "inst-focus",
      toVersion: "2.0.0",
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("Required configuration migration is missing.");
    expect(result.blockers).toContain("Required data migration is missing.");
  });

  it("runs crash-safe migrations before activating the new trusted version", async () => {
    const port = new InMemoryUpgradePort();
    const counters = { configuration: 0, data: 0, rollbackConfiguration: 0, rollbackData: 0 };
    const coordinator = new ModuleUpgradeCoordinator(port, migrationDescriptors(counters), clock());
    const preflight = coordinator.preflight({ actor: orgActor, organizationId: "org-a", installationId: "inst-focus", toVersion: "2.0.0" });
    expect(preflight.allowed).toBe(true);
    expect(preflight.rollbackSupported).toBe(true);
    expect(preflight.requiredConfigurationMigrations).toEqual(["focus-config-v1-v2"]);
    expect(preflight.requiredDataMigrations).toEqual(["focus-data-v1-v2"]);

    const result = await coordinator.execute({ actor: orgActor, organizationId: "org-a", installationId: "inst-focus", toVersion: "2.0.0" });
    expect(result.state).toBe("succeeded");
    expect(port.currentInstallation.activeVersion).toBe("2.0.0");
    expect(port.currentConfiguration).toMatchObject({ moduleVersion: "2.0.0", schemaVersion: 2 });
    expect(port.activationCount).toBe(1);
    expect(counters.configuration).toBe(1);
    expect(counters.data).toBe(1);
    expect([...port.migrationRuns.values()].every((run) => run.state === "succeeded")).toBe(true);
  });

  it("persists a failed migration and leaves the old version active", async () => {
    const port = new InMemoryUpgradePort();
    const descriptors = migrationDescriptors();
    descriptors[1] = {
      ...descriptors[1],
      async apply() {
        const error = new Error("simulated data migration failure");
        error.name = "DataMigrationFailure";
        throw error;
      },
    };
    const result = await new ModuleUpgradeCoordinator(port, descriptors, clock()).execute({
      actor: orgActor,
      organizationId: "org-a",
      installationId: "inst-focus",
      toVersion: "2.0.0",
    });
    expect(result.state).toBe("failed");
    expect(result.failureReason).toMatch(/simulated data migration failure/);
    expect(port.currentInstallation.activeVersion).toBe("1.0.0");
    expect(port.activationCount).toBe(0);
    const failedRun = [...port.migrationRuns.values()].find((run) => run.migrationId === "focus-data-v1-v2");
    expect(failedRun).toMatchObject({ state: "failed", errorCode: "DataMigrationFailure" });
  });

  it("is idempotent after a completed upgrade and does not replay migrations or activation", async () => {
    const port = new InMemoryUpgradePort();
    const counters = { configuration: 0, data: 0, rollbackConfiguration: 0, rollbackData: 0 };
    const coordinator = new ModuleUpgradeCoordinator(port, migrationDescriptors(counters), clock());
    const first = await coordinator.execute({ actor: orgActor, organizationId: "org-a", installationId: "inst-focus", toVersion: "2.0.0" });
    expect(first.state).toBe("succeeded");

    // Recreate the pre-upgrade lookup context to simulate a retry arriving with the original idempotency key.
    port.currentInstallation.activeVersion = "1.0.0";
    const retried = await coordinator.execute({ actor: orgActor, organizationId: "org-a", installationId: "inst-focus", toVersion: "2.0.0" });
    expect(retried.upgradeRunId).toBe(first.upgradeRunId);
    expect(counters.configuration).toBe(1);
    expect(counters.data).toBe(1);
    expect(port.activationCount).toBe(1);
  });

  it("supports explicit rollback only when every required migration is reversible", async () => {
    const port = new InMemoryUpgradePort();
    const counters = { configuration: 0, data: 0, rollbackConfiguration: 0, rollbackData: 0 };
    const coordinator = new ModuleUpgradeCoordinator(port, migrationDescriptors(counters), clock());
    const upgraded = await coordinator.execute({ actor: orgActor, organizationId: "org-a", installationId: "inst-focus", toVersion: "2.0.0" });
    expect(upgraded.state).toBe("succeeded");

    const rolledBack = await coordinator.rollback({
      actor: orgActor,
      organizationId: "org-a",
      installationId: "inst-focus",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
    });
    expect(rolledBack.state).toBe("rolled-back");
    expect(port.currentInstallation.activeVersion).toBe("1.0.0");
    expect(port.currentConfiguration).toMatchObject({ moduleVersion: "1.0.0", schemaVersion: 1 });
    expect(counters.rollbackConfiguration).toBe(1);
    expect(counters.rollbackData).toBe(1);
  });

  it("marks rollback unsupported when any required migration is irreversible", () => {
    const port = new InMemoryUpgradePort();
    const descriptors = migrationDescriptors();
    descriptors[1] = { ...descriptors[1], reversible: false, rollback: undefined };
    const result = new ModuleUpgradeCoordinator(port, descriptors, clock()).preflight({
      actor: orgActor,
      organizationId: "org-a",
      installationId: "inst-focus",
      toVersion: "2.0.0",
    });
    expect(result.allowed).toBe(true);
    expect(result.rollbackSupported).toBe(false);
    expect(result.irreversibleReasons.join(" ")).toMatch(/declared irreversible/);
  });

  it("rejects cross-tenant upgrade requests before any migration or activation", async () => {
    const port = new InMemoryUpgradePort();
    const otherTenantActor: EcosystemActor = { ...orgActor, organizationId: "org-b" };
    await expect(new ModuleUpgradeCoordinator(port, migrationDescriptors(), clock()).execute({
      actor: otherTenantActor,
      organizationId: "org-b",
      installationId: "inst-focus",
      toVersion: "2.0.0",
    })).rejects.toThrow(/validated organization scope/);
    expect(port.activationCount).toBe(0);
    expect(port.migrationRuns.size).toBe(0);
  });
});
