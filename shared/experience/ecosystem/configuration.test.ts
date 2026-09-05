import { describe, expect, it } from "vitest";
import type { ExperienceModuleManifestRecord, ModuleInstallation } from "./contracts.js";
import {
  InMemoryExperienceConfigurationService,
  InMemoryExperienceTemplateCatalog,
  resolveEffectiveExperienceConfiguration,
  validateCapabilityMappings,
  validateConfigurationValues,
  validateOnboardingMappings,
  type ExperienceConfigurationClock,
} from "./configuration.js";

function manifest(): ExperienceModuleManifestRecord {
  return {
    manifestSchemaVersion: 1,
    id: "nurture.focus-timer",
    version: "1.0.0",
    contractVersion: "1.0.0",
    name: "Focus Timer",
    description: "Different-domain fixture",
    icon: "/brand/logo/nurture-n.svg",
    routes: [{ path: "", label: "Timer", access: ["public", "authenticated"], capability: "experience.focus-timer.use" }],
    navigation: [{ path: "", label: "Timer", access: ["public", "authenticated"], capability: "experience.focus-timer.use" }],
    configurationSchemaVersion: 1,
    configurationSchema: {
      title: { type: "string", label: "Title", required: true, maxLength: 80 },
      minutes: { type: "number", label: "Minutes", required: true, min: 1, max: 120 },
      appearance: { type: "object", label: "Appearance" },
    },
    defaults: { title: "Focus", minutes: 25, appearance: { sound: true, density: "comfortable" } },
    capabilities: [{ key: "experience.focus-timer.use", label: "Use", description: "Use timer", availability: ["public", "authenticated"] }],
    eventDefinitions: [{ name: "experience.focus-timer.completed", description: "Completed", source: "browser", schemaVersion: 1 }],
    profileRequirements: [],
    onboardingRequirements: [{ id: "timer-intent", label: "Timer intent", completion: "Select an intent" }],
    activityDefinition: { meaningfulEvent: "experience.focus-timer.completed", description: "Completed timer", pageViewCountsAsActivity: false },
    dataContract: { scope: "session-only", retention: "Session", export: "None", migrationVersion: "1", deletionBehavior: "session-only" },
    compatibility: { hostContractRange: "1.x", minimumHostVersion: "0.1.0", unavailableBehavior: "Unavailable" },
  };
}

const installation: ModuleInstallation = {
  installationId: "inst-focus",
  organizationId: "org-a",
  moduleId: "nurture.focus-timer",
  activeVersion: "1.0.0",
  state: "installed",
  slot: "secondary",
  installedAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
  trustDecisionId: "trusted-1",
  hostContractVersion: "1.0.0",
};

function clock(): ExperienceConfigurationClock {
  let sequence = 0;
  return {
    now: () => `2026-09-05T00:00:0${sequence}.000Z`,
    id: (prefix) => `${prefix}-${++sequence}`,
  };
}

describe("Release 6 Experience templates and configuration", () => {
  it("resolves default -> pinned template -> organization override", () => {
    const catalog = new InMemoryExperienceTemplateCatalog(clock());
    const template = catalog.createVersion({
      templateId: "deep-work",
      manifest: manifest(),
      compatibleModuleVersions: ["1.0.0"],
      values: { minutes: 50, appearance: { density: "compact" } },
      actorId: "platform-author",
    });
    const effective = resolveEffectiveExperienceConfiguration({
      manifest: manifest(),
      template,
      organizationOverrides: { title: "Studio Focus", appearance: { sound: false } },
    });
    expect(effective).toEqual({ title: "Studio Focus", minutes: 50, appearance: { sound: false, density: "compact" } });
    expect(template.templateVersionId).toBeTruthy();
  });

  it("keeps draft separate from published and supersedes only on explicit publish", () => {
    const service = new InMemoryExperienceConfigurationService(clock());
    const first = service.saveDraft({ installation, manifest: manifest(), organizationId: "org-a", actorId: "admin", values: manifest().defaults });
    expect(service.getPublished(installation.installationId)).toBeNull();
    expect(service.publish(installation, first.configurationVersionId).status).toBe("published");

    const second = service.saveDraft({ installation, manifest: manifest(), organizationId: "org-a", actorId: "admin", values: { ...manifest().defaults, minutes: 45 } });
    expect(service.getPublished(installation.installationId)?.values.minutes).toBe(25);
    service.publish(installation, second.configurationVersionId);
    expect(service.getPublished(installation.installationId)?.values.minutes).toBe(45);
    expect(service.listVersions(installation.installationId).find((item) => item.configurationVersionId === first.configurationVersionId)?.status).toBe("superseded");
  });

  it("applies a template into a new draft and pins that exact template version", () => {
    const sharedClock = clock();
    const catalog = new InMemoryExperienceTemplateCatalog(sharedClock);
    const service = new InMemoryExperienceConfigurationService(sharedClock);
    const template = catalog.createVersion({
      templateId: "quick-start",
      manifest: manifest(),
      compatibleModuleVersions: ["1.0.0"],
      values: { minutes: 15 },
      capabilityMappings: [{ capabilityKey: "experience.focus-timer.use", offerIds: ["offer-entry"] }],
      onboardingMappings: [{ requirementId: "timer-intent", enabled: true, order: 0 }],
      actorId: "platform-author",
    });
    const draft = service.applyTemplate({ installation, manifest: manifest(), organizationId: "org-a", actorId: "admin", template, overrides: { title: "Sprint" } });
    expect(draft.values).toMatchObject({ title: "Sprint", minutes: 15 });
    expect(draft.baseTemplateVersionId).toBe(template.templateVersionId);
    expect(draft.status).toBe("draft");
  });

  it("rejects wrong-tenant/version writes and unsafe configuration data", () => {
    const service = new InMemoryExperienceConfigurationService(clock());
    expect(() => service.saveDraft({ installation, manifest: manifest(), organizationId: "org-b", actorId: "admin", values: manifest().defaults })).toThrow(/organization/);
    expect(() => service.saveDraft({ installation: { ...installation, activeVersion: "2.0.0" }, manifest: manifest(), organizationId: "org-a", actorId: "admin", values: manifest().defaults })).toThrow(/active installed/);
    expect(validateConfigurationValues(manifest(), { ...manifest().defaults, arbitraryScript: "<script>alert(1)</script>" }).valid).toBe(false);
    expect(validateConfigurationValues(manifest(), { ...manifest().defaults, apiKey: "secret" }).valid).toBe(false);
  });

  it("rejects mappings that reference capabilities or onboarding requirements the module did not declare", () => {
    expect(validateCapabilityMappings(manifest(), [{ capabilityKey: "experience.other.premium", offerIds: ["offer-x"] }]).join(" ")).toMatch(/undeclared capability/);
    expect(validateOnboardingMappings(manifest(), [{ requirementId: "unknown-step", enabled: true, order: 0 }]).join(" ")).toMatch(/undeclared requirement/);
  });

  it("does not silently reapply deprecated templates", () => {
    const sharedClock = clock();
    const catalog = new InMemoryExperienceTemplateCatalog(sharedClock);
    const service = new InMemoryExperienceConfigurationService(sharedClock);
    const template = catalog.createVersion({ templateId: "starter", manifest: manifest(), compatibleModuleVersions: ["1.0.0"], values: { minutes: 20 }, actorId: "author" });
    catalog.deprecate(template.templateVersionId);
    const deprecated = catalog.getVersion(template.templateVersionId)!;
    expect(() => service.applyTemplate({ installation, manifest: manifest(), organizationId: "org-a", actorId: "admin", template: deprecated })).toThrow(/Deprecated templates/);
  });
});
