import { describe, expect, it } from "vitest";
import type { AutomationDefinitionV3 } from "../../../shared/release3/contracts";
import { explainDefinition, validateDefinition } from "./model";

const base: AutomationDefinitionV3 = {
  id: "r3-upsell-premium",
  organizationId: "org-a",
  version: 3,
  name: "Premium capability offer",
  kind: "upsell",
  trigger: { eventType: "experience.premium_feature_requested", schemaVersion: 1 },
  audience: { mode: "all", predicates: [{ fact: "capability.absent", operator: "eq", value: true }] },
  branches: [{ id: "eligible", actions: [{ type: "in-app", templateId: "premium-offer", templateVersion: 2, placementId: "experience.contextual", purpose: "promotional" }] }],
  delayMinutes: 0,
  reentry: { kind: "after-cooldown", cooldownHours: 72 },
  conflict: { group: "commercial-promotion", priority: "promotion", caps: { customerPerDay: 1, customerPerWeek: 3 } },
  mode: "test",
  enabled: true,
};

describe("Release 3 lifecycle studio model", () => {
  it("accepts an approved bounded definition", () => {
    expect(validateDefinition(base)).toEqual({ valid: true, errors: [] });
  });

  it("requires a positive cooldown for cooldown re-entry", () => {
    const result = validateDefinition({ ...base, reentry: { kind: "after-cooldown", cooldownHours: 0 } });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Cooldown re-entry requires a positive cooldown.");
  });

  it("explains trigger, audience, action, re-entry and conflict policy", () => {
    const explanation = explainDefinition(base);
    expect(explanation).toContain("experience.premium_feature_requested");
    expect(explanation).toContain("capability absent");
    expect(explanation).toContain("in-app");
    expect(explanation).toContain("72 hours");
    expect(explanation).toContain("commercial-promotion");
    expect(explanation).toContain("rechecked before every effect");
  });

  it("never treats a disabled live draft as publish-ready", () => {
    expect(validateDefinition({ ...base, mode: "live", enabled: false }).valid).toBe(false);
  });
});
