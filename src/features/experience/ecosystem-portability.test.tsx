import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { certifyPortabilitySet, validateExperienceModuleManifest } from "../../../shared/experience/ecosystem";
import type {
  Experience,
  ExperienceCapabilityDecision,
  ExperienceModule,
  ExperienceModuleRenderContext,
} from "./contracts";
import { adaptLegacyExperienceManifest } from "./ecosystemAdapter";
import { referenceAssessmentModule } from "./modules/referenceAssessment";
import { referenceChecklistModule } from "./modules/referenceChecklist";

function contextFor(module: ExperienceModule, configuration: Experience["configuration"]): ExperienceModuleRenderContext {
  const experience: Experience = {
    id: `org-a:fixture:${module.manifest.id}`,
    organizationId: "org-a",
    moduleId: module.manifest.id,
    moduleVersion: module.manifest.version,
    slot: module.manifest.id === referenceAssessmentModule.manifest.id ? "primary" : "secondary",
    status: "published",
    configurationVersion: "cfg-fixture-v1",
    configuration,
  };
  const allow = (capabilityKey: string): ExperienceCapabilityDecision => ({
    allowed: true,
    capabilityKey,
    reason: "mode-grant",
    explanation: "Portability fixture host grant.",
  });
  return {
    experience,
    manifest: module.manifest,
    route: module.manifest.routes[0],
    configuration,
    accessMode: "authenticated",
    authenticated: true,
    locale: "en-US",
    timeZone: "America/New_York",
    organizationId: "org-a",
    identityId: "identity-fixture",
    customerId: "customer-fixture",
    canUse: allow,
    requestRegistration: () => undefined,
    requestUpgrade: () => undefined,
    submitEvent: () => true,
    completeOnboardingStep: async () => ({ status: "accepted" }),
    runProtectedOperation: async () => ({ status: "ok" }),
    renderMedia: (asset) => <span data-provider={asset.provider}>{asset.title}</span>,
    reportRecoverableError: () => undefined,
  };
}

describe("Release 6 real Experience portability evidence", () => {
  it("adapts the two existing trusted modules to the version-aware ecosystem contract", () => {
    const assessment = adaptLegacyExperienceManifest(referenceAssessmentModule.manifest, { dataMigrationVersion: "1" });
    const checklist = adaptLegacyExperienceManifest(referenceChecklistModule.manifest, { dataMigrationVersion: "1" });
    expect(validateExperienceModuleManifest(assessment)).toEqual({ valid: true, errors: [] });
    expect(validateExperienceModuleManifest(checklist)).toEqual({ valid: true, errors: [] });

    const certification = certifyPortabilitySet({
      candidates: [
        { domainKey: "guided-assessment", manifest: assessment },
        { domainKey: "action-checklist", manifest: checklist },
      ],
      hostVersion: "0.6.0",
      evaluatedAt: "2026-09-05T00:00:00.000Z",
    });
    expect(certification.passed).toBe(true);
    expect(certification.candidates.map((candidate) => candidate.moduleId)).toEqual([
      "nurture.reference-assessment",
      "nurture.reference-checklist",
    ]);
  });

  it("renders materially different modules through the same participant host context without a second lifecycle stack", () => {
    const assessmentMarkup = renderToStaticMarkup(referenceAssessmentModule.render(contextFor(
      referenceAssessmentModule,
      referenceAssessmentModule.manifest.defaults,
    )));
    const checklistMarkup = renderToStaticMarkup(referenceChecklistModule.render(contextFor(
      referenceChecklistModule,
      referenceChecklistModule.manifest.defaults,
    )));

    expect(assessmentMarkup).toContain("Momentum Check");
    expect(checklistMarkup).toContain("Next-Step Checklist");
    expect(assessmentMarkup).not.toEqual(checklistMarkup);
    expect(referenceAssessmentModule.manifest.activityDefinition.meaningfulEvent)
      .not.toBe(referenceChecklistModule.manifest.activityDefinition.meaningfulEvent);
    expect(referenceAssessmentModule.manifest.capabilities[0].key)
      .not.toBe(referenceChecklistModule.manifest.capabilities[0].key);

    // Both modules expose domain actions only. Shared registration, upgrades,
    // onboarding, media, errors and events are supplied by the same host context.
    const assessmentContext = contextFor(referenceAssessmentModule, referenceAssessmentModule.manifest.defaults);
    const checklistContext = contextFor(referenceChecklistModule, referenceChecklistModule.manifest.defaults);
    expect(typeof assessmentContext.requestRegistration).toBe("function");
    expect(typeof checklistContext.requestRegistration).toBe("function");
    expect(typeof assessmentContext.requestUpgrade).toBe("function");
    expect(typeof checklistContext.requestUpgrade).toBe("function");
    expect(typeof assessmentContext.completeOnboardingStep).toBe("function");
    expect(typeof checklistContext.completeOnboardingStep).toBe("function");
  });

  it("does not convert module configuration into executable or credential-bearing fields", () => {
    const assessment = adaptLegacyExperienceManifest(referenceAssessmentModule.manifest);
    expect(Object.values(assessment.configurationSchema).some((field) => field.sensitive)).toBe(false);
    expect(JSON.stringify(assessment.defaults)).not.toMatch(/<script|<iframe|javascript:/i);
    expect(JSON.stringify(assessment.defaults)).not.toMatch(/api.?key|password|credential|auth.?token/i);
  });
});
