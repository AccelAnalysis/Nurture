import { describe, expect, it } from "vitest";
import type { ExperienceModuleManifestRecord } from "./contracts.js";
import {
  certifyModuleConformance,
  certifyPortabilitySet,
  summarizeLiveEcosystemObservations,
  validateObservationProvenance,
  type EcosystemObservation,
} from "./conformance.js";

function fixture(id: string, meaningfulEvent: string): ExperienceModuleManifestRecord {
  return {
    manifestSchemaVersion: 1,
    id,
    version: "1.0.0",
    contractVersion: "1.0.0",
    name: id,
    description: "Conformance fixture",
    icon: "/brand/logo/nurture-n.svg",
    routes: [{ path: "", label: "Home", access: ["authenticated"], capability: `${id}.use` }],
    navigation: [{ path: "", label: "Home", access: ["authenticated"], capability: `${id}.use` }],
    configurationSchemaVersion: 1,
    configurationSchema: { title: { type: "string", label: "Title", required: true } },
    defaults: { title: "Fixture" },
    capabilities: [{ key: `${id}.use`, label: "Use", description: "Use the Experience", availability: ["authenticated"] }],
    eventDefinitions: [{ name: meaningfulEvent, description: "Meaningful completion", source: "browser", schemaVersion: 1 }],
    profileRequirements: [],
    onboardingRequirements: [],
    activityDefinition: { meaningfulEvent, description: "Meaningful completion", pageViewCountsAsActivity: false },
    dataContract: { scope: "session-only", retention: "Session", export: "None", migrationVersion: "1", deletionBehavior: "session-only" },
    compatibility: { hostContractRange: "1.x", minimumHostVersion: "0.1.0", unavailableBehavior: "Unavailable" },
  };
}

describe("Release 6 portability certification and observability", () => {
  it("certifies two materially different domains against the same host contract", () => {
    const certification = certifyPortabilitySet({
      candidates: [
        { domainKey: "assessment", manifest: fixture("nurture.assessment-fixture", "experience.assessment-fixture.completed") },
        { domainKey: "checklist", manifest: fixture("nurture.checklist-fixture", "experience.checklist-fixture.completed") },
      ],
      hostVersion: "0.6.0",
      evaluatedAt: "2026-09-05T00:00:00.000Z",
    });
    expect(certification.passed).toBe(true);
    expect(certification.candidates.every((candidate) => candidate.passed)).toBe(true);
  });

  it("rejects a portability claim made from duplicate module/domain semantics", () => {
    const manifest = fixture("nurture.same-fixture", "experience.same-fixture.completed");
    const certification = certifyPortabilitySet({
      candidates: [
        { domainKey: "same", manifest },
        { domainKey: "same", manifest },
      ],
      hostVersion: "0.6.0",
    });
    expect(certification.passed).toBe(false);
    expect(certification.reasons.join(" ")).toMatch(/distinct module identifiers/);
    expect(certification.reasons.join(" ")).toMatch(/materially different declared domains/);
  });

  it("fails conformance when a manifest violates the shared host contract", () => {
    const invalid = fixture("nurture.invalid-fixture", "experience.invalid-fixture.completed");
    invalid.routes[0].path = "/platform/escape";
    const result = certifyModuleConformance({ candidate: { domainKey: "invalid", manifest: invalid }, hostVersion: "0.6.0" });
    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.check === "manifest")?.passed).toBe(false);
  });

  it("groups live observations by exact module version and excludes test/preview/demo data", () => {
    const observation = (id: string, moduleVersion: string, dataMode: EcosystemObservation["provenance"]["dataMode"], outcome: EcosystemObservation["outcome"]): EcosystemObservation => ({
      observationId: id,
      occurredAt: "2026-09-05T00:00:00.000Z",
      organizationId: "org-a",
      operation: "module-event",
      outcome,
      provenance: {
        moduleId: "nurture.assessment-fixture",
        moduleVersion,
        installationId: "inst-a",
        configurationVersionId: "cfg-a",
        eventSchemaVersion: 1,
        dataMode,
      },
    });
    const summaries = summarizeLiveEcosystemObservations([
      observation("live-v1", "1.0.0", "live", "succeeded"),
      observation("live-v2", "2.0.0", "live", "failed"),
      observation("test-v2", "2.0.0", "test", "succeeded"),
      observation("preview-v2", "2.0.0", "preview", "blocked"),
    ]);
    expect(summaries).toHaveLength(2);
    expect(summaries.find((summary) => summary.moduleVersion === "1.0.0")).toMatchObject({ observations: 1, succeeded: 1 });
    expect(summaries.find((summary) => summary.moduleVersion === "2.0.0")).toMatchObject({ observations: 1, failed: 1 });
  });

  it("requires organization, installation, module, version, and event-schema provenance", () => {
    const invalid: EcosystemObservation = {
      observationId: "obs-bad",
      occurredAt: "2026-09-05T00:00:00.000Z",
      organizationId: "",
      operation: "upgrade",
      outcome: "blocked",
      provenance: {
        moduleId: "",
        moduleVersion: "",
        installationId: "",
        eventSchemaVersion: 0,
        dataMode: "live",
      },
    };
    expect(validateObservationProvenance(invalid)).toHaveLength(5);
  });
});
