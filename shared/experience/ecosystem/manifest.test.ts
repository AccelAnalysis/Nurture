import { describe, expect, it } from "vitest";
import type { ExperienceModuleManifestRecord } from "./contracts.js";
import {
  bindModuleEventProvenance,
  evaluateHostCompatibility,
  isValidExperienceReturnPath,
  satisfiesVersionRange,
  validateExperienceModuleManifest,
  validateModuleEventProperties,
} from "./manifest.js";

function fixture(overrides: Partial<ExperienceModuleManifestRecord> = {}): ExperienceModuleManifestRecord {
  return {
    manifestSchemaVersion: 1,
    id: "nurture.focus-timer",
    version: "1.2.0",
    contractVersion: "1.0.0",
    name: "Focus Timer",
    description: "A different-domain Experience fixture.",
    icon: "/brand/logo/nurture-n.svg",
    routes: [{ path: "", label: "Timer", access: ["public", "authenticated"], capability: "experience.focus-timer.use" }],
    navigation: [{ path: "", label: "Timer", access: ["public", "authenticated"], capability: "experience.focus-timer.use" }],
    configurationSchemaVersion: 1,
    configurationSchema: {
      minutes: { type: "number", label: "Minutes", required: true, min: 1, max: 120 },
      label: { type: "string", label: "Label", maxLength: 80 },
    },
    defaults: { minutes: 25, label: "Focus" },
    capabilities: [{
      key: "experience.focus-timer.use",
      label: "Use timer",
      description: "Run the timer.",
      availability: ["public", "authenticated"],
    }],
    eventDefinitions: [{
      name: "experience.focus-timer.completed",
      description: "A timer completed.",
      source: "browser",
      schemaVersion: 1,
      allowedProperties: ["minutes"],
    }],
    profileRequirements: [],
    onboardingRequirements: [],
    activityDefinition: {
      meaningfulEvent: "experience.focus-timer.completed",
      description: "A completed timer is meaningful use.",
      pageViewCountsAsActivity: false,
    },
    dataContract: {
      scope: "session-only",
      retention: "Session only.",
      export: "No durable data.",
      migrationVersion: "1",
      deletionBehavior: "session-only",
    },
    compatibility: {
      hostContractRange: "1.x",
      minimumHostVersion: "0.1.0",
      unavailableBehavior: "Show the standard unavailable state.",
    },
    ...overrides,
  };
}

describe("Release 6 Experience manifest contract", () => {
  it("accepts a valid trusted-module manifest and compatible host", () => {
    const manifest = fixture();
    expect(validateExperienceModuleManifest(manifest)).toEqual({ valid: true, errors: [] });
    const compatibility = evaluateHostCompatibility(manifest, {
      hostVersion: "0.6.0",
      evaluatedAt: "2026-09-05T00:00:00.000Z",
    });
    expect(compatibility.compatible).toBe(true);
    expect(compatibility.code).toBe("compatible");
  });

  it("fails closed on an incompatible host contract or old host version", () => {
    expect(evaluateHostCompatibility(fixture({ compatibility: {
      hostContractRange: "2.x",
      minimumHostVersion: "0.1.0",
      unavailableBehavior: "Unavailable",
    }}), { hostVersion: "0.6.0" }).code).toBe("host-contract-incompatible");

    expect(evaluateHostCompatibility(fixture({ compatibility: {
      hostContractRange: "1.x",
      minimumHostVersion: "2.0.0",
      unavailableBehavior: "Unavailable",
    }}), { hostVersion: "0.6.0" }).code).toBe("host-version-too-old");
  });

  it("rejects admin routes, undeclared capabilities, credentials, and executable configuration", () => {
    const manifest = fixture({
      routes: [{ path: "/platform/modules", label: "Bad", access: ["authenticated"], capability: "experience.missing" }],
      configurationSchema: {
        apiKey: { type: "string", label: "API key", sensitive: true },
        iframeHtml: { type: "string", label: "HTML" },
      },
      defaults: {
        apiKey: "should-never-be-here",
        iframeHtml: "<iframe src='https://example.test'></iframe>",
      },
    });
    const result = validateExperienceModuleManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/relative to the Experience host/);
    expect(result.errors.join(" ")).toMatch(/undeclared capability/);
    expect(result.errors.join(" ")).toMatch(/credentials or secrets/);
    expect(result.errors.join(" ")).toMatch(/executable/);
  });

  it("validates supported semver range forms", () => {
    expect(satisfiesVersionRange("1.4.2", "1.x")).toBe(true);
    expect(satisfiesVersionRange("1.4.2", "1.4.x")).toBe(true);
    expect(satisfiesVersionRange("1.4.2", ">=1.3.0")).toBe(true);
    expect(satisfiesVersionRange("1.4.2", "^1.2.0")).toBe(true);
    expect(satisfiesVersionRange("2.0.0", "^1.2.0")).toBe(false);
  });

  it("only permits registration returns into participant Experience routes", () => {
    expect(isValidExperienceReturnPath("/experience/focus")).toBe(true);
    expect(isValidExperienceReturnPath("/app/experience/focus?resume=1")).toBe(true);
    expect(isValidExperienceReturnPath("/platform/organizations")).toBe(false);
    expect(isValidExperienceReturnPath("//evil.example/steal")).toBe(false);
    expect(isValidExperienceReturnPath("https://evil.example/steal")).toBe(false);
  });

  it("enforces declared event properties and protects host provenance", () => {
    expect(validateModuleEventProperties({ minutes: 25 }, ["minutes"])).toEqual([]);
    expect(validateModuleEventProperties({ minutes: 25, token: "x" }, ["minutes"]).join(" ")).toMatch(/not declared|secrets/);

    const bound = bindModuleEventProvenance({
      moduleId: "nurture.focus-timer",
      moduleVersion: "1.2.0",
      installationId: "inst-1",
      configurationVersionId: "cfg-4",
      eventSchemaVersion: 2,
      dataMode: "test",
    }, {
      moduleVersion: "forged-browser-version",
      minutes: 25,
    });
    expect(bound.moduleVersion).toBe("1.2.0");
    expect(bound.installationId).toBe("inst-1");
    expect(bound.dataMode).toBe("test");
  });
});
