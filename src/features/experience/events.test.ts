import { describe, expect, it } from "vitest";
import { referenceAssessmentModule } from "./modules/referenceAssessment";
import { referenceChecklistModule } from "./modules/referenceChecklist";
import {
  validateExperienceHostEvent,
  validateExperienceManifestLifecycle,
  validateExperienceModuleEvent,
} from "./events";

describe("Experience lifecycle declarations", () => {
  it("accepts both reference manifests on the same lifecycle contract", () => {
    expect(validateExperienceManifestLifecycle(referenceAssessmentModule.manifest)).toEqual([]);
    expect(validateExperienceManifestLifecycle(referenceChecklistModule.manifest)).toEqual([]);
  });

  it("accepts a declared ordinary module interaction", () => {
    expect(validateExperienceModuleEvent(
      referenceAssessmentModule.manifest,
      "experience.reference-assessment.answer_selected",
      { questionId: "clarity", step: 1 },
    )).toEqual({ ok: true, properties: { questionId: "clarity", step: 1 } });
  });

  it("rejects undeclared or malformed browser activity", () => {
    const undeclared = validateExperienceModuleEvent(
      referenceAssessmentModule.manifest,
      "experience.reference-assessment.checkout_completed",
      {},
    );
    expect(undeclared.ok).toBe(false);

    const malformed = validateExperienceModuleEvent(
      referenceAssessmentModule.manifest,
      "experience.reference-assessment.answer_selected",
      { questionId: "not-a-question", step: 99 },
    );
    expect(malformed.ok).toBe(false);
  });

  it("reuses Track F payload safety and rejects secret-bearing fields", () => {
    const result = validateExperienceModuleEvent(
      referenceAssessmentModule.manifest,
      "experience.reference-assessment.answer_selected",
      { questionId: "clarity", step: 1, access_token: "must-not-leak" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/secret-bearing|not declared/);
  });

  it("keeps host start and premium-request semantics separate", () => {
    expect(validateExperienceHostEvent("experience.started", {
      accessMode: "public",
      slot: "primary",
    }).ok).toBe(true);

    expect(validateExperienceHostEvent("experience.premium_feature_requested", {
      capabilityKey: "nurture.reference-assessment.deep-dive",
    }).ok).toBe(true);

    expect(validateExperienceHostEvent("experience.started", {
      accessMode: "paid",
      slot: "primary",
    }).ok).toBe(false);
  });
});
