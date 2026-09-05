import { describe, expect, it } from "vitest";
import type { ExperienceModuleManifestRecord, RegisteredModuleVersion } from "./contracts.js";
import type { EcosystemActor } from "./governance.js";
import {
  ExperienceRegistryService,
  InMemoryExperienceRegistryStore,
  type EcosystemRegistryClock,
} from "./registry.js";

function moduleManifest(version = "1.0.0"): ExperienceModuleManifestRecord {
  return {
    manifestSchemaVersion: 1,
    id: "nurture.focus-timer",
    version,
    contractVersion: "1.0.0",
    name: "Focus Timer",
    description: "Different-domain Experience",
    icon: "/brand/logo/nurture-n.svg",
    routes: [{ path: "", label: "Timer", access: ["public", "authenticated"], capability: "experience.focus-timer.use" }],
    navigation: [{ path: "", label: "Timer", access: ["public", "authenticated"], capability: "experience.focus-timer.use" }],
    configurationSchemaVersion: 1,
    configurationSchema: { minutes: { type: "number", label: "Minutes", required: true, min: 1, max: 120 } },
    defaults: { minutes: 25 },
    capabilities: [{ key: "experience.focus-timer.use", label: "Use", description: "Use timer", availability: ["public", "authenticated"] }],
    eventDefinitions: [{ name: "experience.focus-timer.completed", description: "Completed", source: "browser", schemaVersion: 1 }],
    profileRequirements: [],
    onboardingRequirements: [],
    activityDefinition: { meaningfulEvent: "experience.focus-timer.completed", description: "Timer completion", pageViewCountsAsActivity: false },
    dataContract: { scope: "session-only", retention: "Session", export: "None", migrationVersion: "1", deletionBehavior: "session-only" },
    compatibility: { hostContractRange: "1.x", minimumHostVersion: "0.1.0", unavailableBehavior: "Unavailable" },
  };
}

function registeredVersion(version = "1.0.0", overrides: Partial<RegisteredModuleVersion> = {}): RegisteredModuleVersion {
  return {
    moduleId: "nurture.focus-timer",
    version,
    manifest: moduleManifest(version),
    availability: "available",
    trustDecision: {
      moduleId: "nurture.focus-timer",
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

function clock(): EcosystemRegistryClock {
  let sequence = 0;
  return {
    now: () => `2026-09-05T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    id: (prefix) => `${prefix}-${++sequence}`,
  };
}

const platformActor: EcosystemActor = { actorId: "platform", platformCapabilities: ["product.manage", "operations.manage"] };
const orgActor: EcosystemActor = { actorId: "org-admin", organizationId: "org-a", organizationCapabilities: ["experience.manage", "experience.publish"] };

function setup() {
  const store = new InMemoryExperienceRegistryStore();
  const service = new ExperienceRegistryService(store, clock());
  return { store, service };
}

describe("Release 6 trusted Experience registry and installation lifecycle", () => {
  it("registers a reviewed version and installs only the trusted compatible available artifact", () => {
    const { service } = setup();
    service.registerVersion({ actor: platformActor, record: registeredVersion() });
    expect(service.listInstallableVersions("nurture.focus-timer")).toHaveLength(1);
    const installation = service.install({ actor: orgActor, organizationId: "org-a", moduleId: "nurture.focus-timer", version: "1.0.0", slot: "secondary" });
    expect(installation.activeVersion).toBe("1.0.0");
    expect(installation.trustDecisionId).toBe("trust-1.0.0");
    expect(service.listHistory("org-a", installation.installationId).map((item) => item.action)).toEqual(["installed"]);
  });

  it("fails closed for untrusted, incompatible, or unavailable module versions", () => {
    const { service } = setup();
    service.registerVersion({ actor: platformActor, record: registeredVersion("1.0.0", { trustDecision: { ...registeredVersion().trustDecision, status: "under-review" } }) });
    service.registerVersion({ actor: platformActor, record: registeredVersion("1.1.0", { compatibility: { ...registeredVersion("1.1.0").compatibility, compatible: false, code: "host-contract-incompatible" } }) });
    service.registerVersion({ actor: platformActor, record: registeredVersion("1.2.0", { availability: "blocked" }) });
    expect(service.listInstallableVersions()).toEqual([]);
    expect(() => service.install({ actor: orgActor, organizationId: "org-a", moduleId: "nurture.focus-timer", version: "1.0.0", slot: "secondary" })).toThrow(/not currently trusted/);
  });

  it("prevents cross-tenant installation access and URL/id substitution", () => {
    const { service } = setup();
    service.registerVersion({ actor: platformActor, record: registeredVersion() });
    const installation = service.install({ actor: orgActor, organizationId: "org-a", moduleId: "nurture.focus-timer", version: "1.0.0", slot: "secondary" });
    expect(service.getInstallation("org-b", installation.installationId)).toBeNull();
    expect(() => service.listHistory("org-b", installation.installationId)).toThrow(/validated organization scope/);
    expect(() => service.setDisabled({ actor: orgActor, organizationId: "org-b", installationId: installation.installationId, disabled: true })).toThrow(/scope-mismatch/);
  });

  it("does not silently change versions and retains disable/uninstall history", () => {
    const { service } = setup();
    service.registerVersion({ actor: platformActor, record: registeredVersion("1.0.0") });
    service.registerVersion({ actor: platformActor, record: registeredVersion("2.0.0") });
    const installation = service.install({ actor: orgActor, organizationId: "org-a", moduleId: "nurture.focus-timer", version: "1.0.0", slot: "secondary" });
    expect(() => service.install({ actor: orgActor, organizationId: "org-a", moduleId: "nurture.focus-timer", version: "2.0.0", slot: "secondary" })).toThrow(/controlled upgrade/);
    service.setDisabled({ actor: orgActor, organizationId: "org-a", installationId: installation.installationId, disabled: true, reason: "maintenance" });
    service.setDisabled({ actor: orgActor, organizationId: "org-a", installationId: installation.installationId, disabled: false });
    service.uninstall({ actor: orgActor, organizationId: "org-a", installationId: installation.installationId, reason: "organization choice" });
    expect(service.listHistory("org-a", installation.installationId).map((item) => item.action)).toEqual(["installed", "disabled", "enabled", "uninstalled"]);
  });

  it("accepts a version activation only through the validated upgrade handoff", () => {
    const { service } = setup();
    service.registerVersion({ actor: platformActor, record: registeredVersion("1.0.0") });
    service.registerVersion({ actor: platformActor, record: registeredVersion("2.0.0") });
    const installation = service.install({ actor: orgActor, organizationId: "org-a", moduleId: "nurture.focus-timer", version: "1.0.0", slot: "secondary" });
    const upgraded = service.activateValidatedUpgrade({
      actor: orgActor,
      organizationId: "org-a",
      installationId: installation.installationId,
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
      trustDecisionId: "trust-2.0.0",
    });
    expect(upgraded.activeVersion).toBe("2.0.0");
    expect(service.listHistory("org-a", installation.installationId).at(-1)).toMatchObject({ action: "upgraded", previousVersion: "1.0.0", moduleVersion: "2.0.0" });
  });

  it("emergency-disables active installations after the exact module version is revoked", () => {
    const { store, service } = setup();
    const trusted = registeredVersion("1.0.0");
    service.registerVersion({ actor: platformActor, record: trusted });
    const installation = service.install({ actor: orgActor, organizationId: "org-a", moduleId: trusted.moduleId, version: trusted.version, slot: "secondary" });
    store.putVersion({
      ...trusted,
      availability: "revoked",
      trustDecision: { ...trusted.trustDecision, status: "revoked", decisionId: "revoked-1" },
    });
    const disabled = service.emergencyDisableRevokedVersion({
      actor: platformActor,
      moduleId: trusted.moduleId,
      moduleVersion: trusted.version,
      trustDecisionId: "revoked-1",
      reason: "reviewed artifact revoked",
    });
    expect(disabled).toHaveLength(1);
    expect(service.getInstallation("org-a", installation.installationId)?.state).toBe("disabled");
    expect(service.listHistory("org-a", installation.installationId).at(-1)?.action).toBe("trust-revoked");
  });
});
