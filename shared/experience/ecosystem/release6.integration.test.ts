import { describe, expect, it } from "vitest";
import type {
  ExperienceConfigurationVersion,
  ExperienceModuleManifestRecord,
  MigrationRun,
  ModuleInstallation,
  ModuleUpgradeRun,
  RegisteredModuleVersion,
} from "./contracts.js";
import {
  InMemoryExperienceConfigurationService,
  InMemoryExperienceTemplateCatalog,
  type ExperienceConfigurationClock,
} from "./configuration.js";
import { certifyPortabilitySet, summarizeLiveEcosystemObservations, type EcosystemObservation } from "./conformance.js";
import type { EcosystemActor } from "./governance.js";
import { ExperienceRegistryService, InMemoryExperienceRegistryStore, type EcosystemRegistryClock } from "./registry.js";
import { ModuleUpgradeCoordinator, type ModuleMigrationDescriptor, type UpgradeClock, type UpgradeStatePort } from "./upgrades.js";

class ReleaseClock implements EcosystemRegistryClock, ExperienceConfigurationClock, UpgradeClock {
  private sequence = 0;
  now(): string {
    return `2026-09-05T14:00:${String(this.sequence).padStart(2, "0")}.000Z`;
  }
  id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }
}

function manifest(input: {
  id: string;
  version: string;
  schemaVersion?: number;
  dataMigrationVersion?: string;
  meaningfulEvent: string;
}): ExperienceModuleManifestRecord {
  const schemaVersion = input.schemaVersion ?? 1;
  return {
    manifestSchemaVersion: 1,
    id: input.id,
    version: input.version,
    contractVersion: "1.0.0",
    name: input.id.includes("assessment") ? "Reference Assessment" : "Reference Checklist",
    description: "Release 6 combined acceptance fixture.",
    icon: "/brand/logo/nurture-n.svg",
    routes: [{ path: "", label: "Experience", access: ["authenticated"], capability: `${input.id}.use` }],
    navigation: [{ path: "", label: "Experience", access: ["authenticated"], capability: `${input.id}.use` }],
    configurationSchemaVersion: schemaVersion,
    configurationSchema: {
      title: { type: "string", label: "Title", required: true, maxLength: 80 },
      ...(schemaVersion >= 2 ? { completionMessage: { type: "string" as const, label: "Completion message", required: true, maxLength: 120 } } : {}),
    },
    defaults: schemaVersion >= 2
      ? { title: "Momentum Check", completionMessage: "Complete" }
      : { title: "Momentum Check" },
    capabilities: [{ key: `${input.id}.use`, label: "Use", description: "Use the Experience.", availability: ["authenticated"] }],
    eventDefinitions: [{ name: input.meaningfulEvent, description: "Meaningful module action.", source: "server", requiresServerValidation: true, schemaVersion: 1 }],
    profileRequirements: [],
    onboardingRequirements: [{ id: `${input.id}.setup`, label: "Setup", completion: "Complete host onboarding step." }],
    activityDefinition: { meaningfulEvent: input.meaningfulEvent, description: "Meaningful completion.", pageViewCountsAsActivity: false },
    dataContract: {
      scope: "organization-customer",
      retention: "Preserve according to organization/module policy.",
      export: "Export through Nurture host policy.",
      migrationVersion: input.dataMigrationVersion ?? "1",
      deletionBehavior: "preserve-until-explicit-delete",
    },
    compatibility: { hostContractRange: "1.x", minimumHostVersion: "0.1.0", unavailableBehavior: "Standard host unavailable state." },
  };
}

function registered(moduleManifest: ExperienceModuleManifestRecord): RegisteredModuleVersion {
  return {
    moduleId: moduleManifest.id,
    version: moduleManifest.version,
    manifest: moduleManifest,
    availability: "available",
    trustDecision: {
      moduleId: moduleManifest.id,
      moduleVersion: moduleManifest.version,
      status: "trusted",
      decisionId: `trust:${moduleManifest.id}:${moduleManifest.version}`,
      reviewedArtifactId: `artifact:${moduleManifest.id}:${moduleManifest.version}`,
      manifestDigest: `sha256:${moduleManifest.id}:${moduleManifest.version}`,
      decidedBy: "platform-reviewer",
      decidedAt: "2026-09-05T14:00:00.000Z",
    },
    compatibility: {
      compatible: true,
      code: "compatible",
      reasons: [],
      hostContractVersion: "1.0.0",
      moduleContractVersion: "1.0.0",
      evaluatedAt: "2026-09-05T14:00:00.000Z",
    },
    releaseNotes: "Acceptance fixture",
    registeredAt: "2026-09-05T14:00:00.000Z",
  };
}

const platformActor: EcosystemActor = {
  actorId: "platform-reviewer",
  platformCapabilities: ["product.manage", "operations.manage", "audit.view"],
};
const orgAActor: EcosystemActor = {
  actorId: "org-a-admin",
  organizationId: "org-a",
  organizationCapabilities: ["experience.view", "experience.manage", "experience.publish"],
};
const orgBActor: EcosystemActor = {
  actorId: "org-b-admin",
  organizationId: "org-b",
  organizationCapabilities: ["experience.view", "experience.manage", "experience.publish"],
};

class CombinedUpgradePort implements UpgradeStatePort {
  readonly migrationRuns = new Map<string, MigrationRun>();
  readonly upgradeRuns = new Map<string, ModuleUpgradeRun>();
  configuration: ExperienceConfigurationVersion | null;

  constructor(
    private readonly registry: ExperienceRegistryService,
    private readonly store: InMemoryExperienceRegistryStore,
    private readonly actor: EcosystemActor,
    private readonly organizationId: string,
    configuration: ExperienceConfigurationVersion | null,
  ) {
    this.configuration = configuration;
  }

  getInstallation(organizationId: string, installationId: string): ModuleInstallation | null {
    return this.registry.getInstallation(organizationId, installationId);
  }
  getModuleVersion(moduleId: string, version: string): RegisteredModuleVersion | null {
    return this.store.getVersion(moduleId, version);
  }
  getPublishedConfiguration(installationId: string): ExperienceConfigurationVersion | null {
    return this.configuration?.installationId === installationId
      ? JSON.parse(JSON.stringify(this.configuration)) as ExperienceConfigurationVersion
      : null;
  }
  saveConfiguration(version: ExperienceConfigurationVersion): void {
    this.configuration = JSON.parse(JSON.stringify(version)) as ExperienceConfigurationVersion;
  }
  activateVersion(input: {
    actor: EcosystemActor;
    organizationId: string;
    installationId: string;
    expectedFromVersion: string;
    targetVersion: RegisteredModuleVersion;
  }): ModuleInstallation {
    expect(input.actor.actorId).toBe(this.actor.actorId);
    expect(input.organizationId).toBe(this.organizationId);
    return this.registry.activateValidatedUpgrade({
      actor: input.actor,
      organizationId: input.organizationId,
      installationId: input.installationId,
      fromVersion: input.expectedFromVersion,
      toVersion: input.targetVersion.version,
      trustDecisionId: input.targetVersion.trustDecision.decisionId,
    });
  }
  getMigrationRun(key: string): MigrationRun | null {
    const run = this.migrationRuns.get(key);
    return run ? JSON.parse(JSON.stringify(run)) as MigrationRun : null;
  }
  putMigrationRun(key: string, run: MigrationRun): void {
    this.migrationRuns.set(key, JSON.parse(JSON.stringify(run)) as MigrationRun);
  }
  getUpgradeRun(key: string): ModuleUpgradeRun | null {
    const run = this.upgradeRuns.get(key);
    return run ? JSON.parse(JSON.stringify(run)) as ModuleUpgradeRun : null;
  }
  putUpgradeRun(key: string, run: ModuleUpgradeRun): void {
    this.upgradeRuns.set(key, JSON.parse(JSON.stringify(run)) as ModuleUpgradeRun);
  }
}

describe("Release 6 combined staged acceptance", () => {
  it("runs trust -> install -> template/config -> explicit upgrade -> portability -> revocation without cross-tenant drift", async () => {
    const clock = new ReleaseClock();
    const store = new InMemoryExperienceRegistryStore();
    const registry = new ExperienceRegistryService(store, clock);
    const configurations = new InMemoryExperienceConfigurationService(clock);
    const templates = new InMemoryExperienceTemplateCatalog(clock);

    const assessmentV1 = registered(manifest({
      id: "nurture.reference-assessment",
      version: "1.0.0",
      meaningfulEvent: "experience.reference-assessment.completed",
    }));
    const assessmentV2 = registered(manifest({
      id: "nurture.reference-assessment",
      version: "2.0.0",
      schemaVersion: 2,
      dataMigrationVersion: "2",
      meaningfulEvent: "experience.reference-assessment.completed",
    }));
    const checklistV1 = registered(manifest({
      id: "nurture.reference-checklist",
      version: "1.0.0",
      meaningfulEvent: "experience.reference-checklist.completed",
    }));

    registry.registerVersion({ actor: platformActor, record: assessmentV1 });
    registry.registerVersion({ actor: platformActor, record: assessmentV2 });
    registry.registerVersion({ actor: platformActor, record: checklistV1 });

    const orgAInstall = registry.install({
      actor: orgAActor,
      organizationId: "org-a",
      moduleId: assessmentV1.moduleId,
      version: assessmentV1.version,
      slot: "primary",
    });
    const orgBInstall = registry.install({
      actor: orgBActor,
      organizationId: "org-b",
      moduleId: checklistV1.moduleId,
      version: checklistV1.version,
      slot: "primary",
    });

    expect(registry.getInstallation("org-a", orgAInstall.installationId)?.activeVersion).toBe("1.0.0");
    expect(registry.getInstallation("org-b", orgBInstall.installationId)?.activeVersion).toBe("1.0.0");
    expect(registry.listInstallableVersions(assessmentV1.moduleId).map((version) => version.version)).toContain("2.0.0");
    expect(registry.getInstallation("org-a", orgAInstall.installationId)?.activeVersion).toBe("1.0.0");

    const template = templates.createVersion({
      templateId: "assessment-standard",
      manifest: assessmentV1.manifest,
      compatibleModuleVersions: ["1.0.0"],
      values: { title: "Organization A Momentum Check" },
      capabilityMappings: [{ capabilityKey: "nurture.reference-assessment.use", offerIds: ["offer-standard"] }],
      onboardingMappings: [{ requirementId: "nurture.reference-assessment.setup", enabled: true, order: 0 }],
      actorId: platformActor.actorId,
    });
    const draft = configurations.applyTemplate({
      installation: orgAInstall,
      manifest: assessmentV1.manifest,
      organizationId: "org-a",
      actorId: orgAActor.actorId,
      template,
      overrides: { title: "Org A Custom Momentum" },
    });
    expect(configurations.getPublished(orgAInstall.installationId)).toBeNull();
    const published = configurations.publish(orgAInstall, draft.configurationVersionId);
    expect(published.values.title).toBe("Org A Custom Momentum");
    expect(configurations.getPublished(orgBInstall.installationId)).toBeNull();

    const migrationDescriptors: ModuleMigrationDescriptor[] = [
      {
        migrationId: "assessment-config-v1-v2",
        kind: "configuration",
        moduleId: assessmentV1.moduleId,
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
        reversible: true,
        async apply(context) {
          if (!context.publishedConfiguration) throw new Error("Published configuration required.");
          return {
            checkpoint: { key: "config-v2", safeSummary: "Preserved organization title override." },
            configuration: {
              ...context.publishedConfiguration,
              configurationVersionId: "cfg-org-a-v2-migrated",
              moduleVersion: "2.0.0",
              schemaVersion: 2,
              values: { ...context.publishedConfiguration.values, completionMessage: "Complete" },
              createdAt: clock.now(),
              createdBy: "system:migration",
              status: "published",
            },
          };
        },
        async rollback(context) {
          if (!context.publishedConfiguration) throw new Error("Published configuration required.");
          return {
            configuration: {
              ...context.publishedConfiguration,
              configurationVersionId: "cfg-org-a-v1-restored",
              moduleVersion: "1.0.0",
              schemaVersion: 1,
              values: { title: String(context.publishedConfiguration.values.title ?? "Momentum Check") },
              createdAt: clock.now(),
              createdBy: "system:rollback",
              status: "published",
            },
          };
        },
      },
      {
        migrationId: "assessment-data-v1-v2",
        kind: "data",
        moduleId: assessmentV1.moduleId,
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
        reversible: true,
        async apply() {
          return { checkpoint: { key: "org-a-domain-data-v2", safeSummary: "Organization-scoped fixture data migrated." } };
        },
        async rollback() {
          return { checkpoint: { key: "org-a-domain-data-v1", safeSummary: "Organization-scoped fixture data restored." } };
        },
      },
    ];
    const upgradePort = new CombinedUpgradePort(registry, store, orgAActor, "org-a", published);
    const upgrades = new ModuleUpgradeCoordinator(upgradePort, migrationDescriptors, clock);
    const preflight = upgrades.preflight({ actor: orgAActor, organizationId: "org-a", installationId: orgAInstall.installationId, toVersion: "2.0.0" });
    expect(preflight.allowed).toBe(true);
    expect(preflight.rollbackSupported).toBe(true);

    const upgraded = await upgrades.execute({ actor: orgAActor, organizationId: "org-a", installationId: orgAInstall.installationId, toVersion: "2.0.0" });
    expect(upgraded.state).toBe("succeeded");
    expect(registry.getInstallation("org-a", orgAInstall.installationId)?.activeVersion).toBe("2.0.0");
    expect(upgradePort.configuration).toMatchObject({ moduleVersion: "2.0.0", schemaVersion: 2 });
    expect(upgradePort.configuration?.values.title).toBe("Org A Custom Momentum");
    expect(registry.getInstallation("org-b", orgBInstall.installationId)?.activeVersion).toBe("1.0.0");

    const portability = certifyPortabilitySet({
      candidates: [
        { domainKey: "guided-assessment", manifest: assessmentV2.manifest },
        { domainKey: "action-checklist", manifest: checklistV1.manifest },
      ],
      hostVersion: "0.6.0",
      evaluatedAt: clock.now(),
    });
    expect(portability.passed).toBe(true);

    const observations: EcosystemObservation[] = [
      {
        observationId: "obs-live-v1",
        occurredAt: clock.now(),
        organizationId: "org-a",
        operation: "module-event",
        outcome: "succeeded",
        provenance: { moduleId: assessmentV1.moduleId, moduleVersion: "1.0.0", installationId: orgAInstall.installationId, configurationVersionId: published.configurationVersionId, eventSchemaVersion: 1, dataMode: "live" },
      },
      {
        observationId: "obs-live-v2",
        occurredAt: clock.now(),
        organizationId: "org-a",
        operation: "upgrade",
        outcome: "succeeded",
        provenance: { moduleId: assessmentV2.moduleId, moduleVersion: "2.0.0", installationId: orgAInstall.installationId, configurationVersionId: upgradePort.configuration?.configurationVersionId, eventSchemaVersion: 1, dataMode: "live" },
      },
      {
        observationId: "obs-preview-v2",
        occurredAt: clock.now(),
        organizationId: "org-a",
        operation: "module-event",
        outcome: "succeeded",
        provenance: { moduleId: assessmentV2.moduleId, moduleVersion: "2.0.0", installationId: orgAInstall.installationId, eventSchemaVersion: 1, dataMode: "preview" },
      },
    ];
    const summaries = summarizeLiveEcosystemObservations(observations);
    expect(summaries).toHaveLength(2);
    expect(summaries.reduce((total, summary) => total + summary.observations, 0)).toBe(2);

    const revoked = {
      ...assessmentV2,
      availability: "revoked" as const,
      trustDecision: { ...assessmentV2.trustDecision, status: "revoked" as const, decisionId: "trust:assessment-v2:revoked" },
    };
    store.putVersion(revoked);
    registry.emergencyDisableRevokedVersion({
      actor: platformActor,
      moduleId: assessmentV2.moduleId,
      moduleVersion: "2.0.0",
      trustDecisionId: revoked.trustDecision.decisionId,
      reason: "Combined acceptance revocation fixture.",
    });
    expect(registry.getInstallation("org-a", orgAInstall.installationId)?.state).toBe("disabled");
    expect(registry.getInstallation("org-b", orgBInstall.installationId)?.state).toBe("installed");
    expect(registry.listHistory("org-a", orgAInstall.installationId).at(-1)?.action).toBe("trust-revoked");
  });
});
