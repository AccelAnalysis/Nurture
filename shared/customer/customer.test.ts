import { describe, expect, it } from "vitest";
import { consentState } from "./consent";
import { stableCustomerIdForIdentity } from "./identity";
import { completeOnboardingStep, createOnboardingProgress, migrateLegacyIdentityOnboarding, onboardingProgressId, resumeOnboardingProgress } from "./onboarding";
import type { LegacyIdentityOnboardingState, OnboardingFlowDefinitionV2, OnboardingProgressScope } from "./contracts";

const definition: OnboardingFlowDefinitionV2 = {
  schemaVersion: 2,
  id: "nurture.default",
  version: "2.0.0",
  welcomeTitle: "Welcome",
  welcomeBody: "Complete setup.",
  requiresVerifiedEmail: true,
  completionPolicy: "all-required-steps",
  steps: [
    { id: "profile", route: "profile", label: "Profile", description: "Profile", required: true, questions: [{ id: "displayName", label: "Display name", type: "text", required: true, purpose: "Address the customer." }] },
    { id: "terms", route: "terms", label: "Terms", description: "Terms", required: true, questions: [], agreement: { id: "terms", version: "2026-09", label: "Terms", required: true } },
  ],
};
function scope(organizationId: string): OnboardingProgressScope {
  return { organizationId, customerId: "customer_uid-1", dataMode: "test", flowId: definition.id, experienceId: "reference" };
}

describe("Release 2 Track C customer foundation", () => {
  it("preserves the stable Release 1 customer ID while tenant progress stays independent", () => {
    expect(stableCustomerIdForIdentity("uid-1")).toBe("customer_uid-1");
    expect(onboardingProgressId(scope("org-a"))).not.toBe(onboardingProgressId(scope("org-b")));
    const a = createOnboardingProgress(scope("org-a"), definition, "2026-09-05T12:00:00.000Z");
    const b = createOnboardingProgress(scope("org-b"), definition, "2026-09-05T12:00:00.000Z");
    expect(a.scope.organizationId).toBe("org-a");
    expect(b.scope.organizationId).toBe("org-b");
  });
  it("keeps missing consent unknown rather than permission", () => expect(consentState(null)).toBe("unknown"));
  it("pins an in-progress flow and records logical completion only once", () => {
    const started = createOnboardingProgress(scope("org-a"), definition, "2026-09-05T12:00:00.000Z");
    const first = completeOnboardingStep(definition, started, { stepId: "profile", answers: { displayName: "Casey" } }, "2026-09-05T12:05:00.000Z");
    const second = completeOnboardingStep(definition, first.progress, { stepId: "terms", answers: {}, agreementAccepted: true }, "2026-09-05T12:10:00.000Z");
    const replay = completeOnboardingStep(definition, second.progress, { stepId: "terms", answers: {}, agreementAccepted: true }, "2026-09-05T12:11:00.000Z");
    expect(first.stepCompletedNow).toBe(true);
    expect(second.onboardingCompletedNow).toBe(true);
    expect(replay.stepCompletedNow).toBe(false);
    expect(replay.onboardingCompletedNow).toBe(false);
    expect(replay.progress.completedAt).toBe(second.progress.completedAt);
  });
  it("resumption clears abandonment without changing the pinned version", () => {
    const started = createOnboardingProgress(scope("org-a"), definition, "2026-09-01T12:00:00.000Z");
    const resumed = resumeOnboardingProgress({ ...started, status: "abandoned", abandonedAt: "2026-09-05T12:00:00.000Z" }, "2026-09-05T13:00:00.000Z");
    expect(resumed.status).toBe("in-progress");
    expect(resumed.abandonedAt).toBeUndefined();
    expect(resumed.flowVersion).toBe("2.0.0");
  });
  it("migrates legacy onboarding only into the explicitly selected tenant scope", () => {
    const legacy: LegacyIdentityOnboardingState = {
      identityId: "uid-1", customerId: "customer_uid-1", definitionId: "nurture.release-1.default", definitionVersion: "1.0.0", status: "complete",
      steps: { profile: "complete", terms: "complete" }, answers: { displayName: "Casey" },
      acceptedAgreements: { terms: { agreementId: "terms", version: "2026-09", acceptedAt: "2026-08-01T12:00:00.000Z" } },
      startedAt: "2026-08-01T12:00:00.000Z", lastActivityAt: "2026-08-01T12:10:00.000Z", completedAt: "2026-08-01T12:10:00.000Z",
    };
    const migrated = migrateLegacyIdentityOnboarding(legacy, scope("org-a"), definition, "2026-09-05T12:00:00.000Z");
    expect(migrated.scope.organizationId).toBe("org-a");
    expect(migrated.migration?.source).toBe("identityOnboarding");
    expect(migrated.status).toBe("complete");
  });
});
