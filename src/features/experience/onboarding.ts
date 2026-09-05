import type {
  ExperienceModuleManifest,
  ExperienceOnboardingExtension,
  ExperienceOnboardingStepDefinition,
} from "./contracts";

/**
 * Produces the exact public shape consumed by Track C's `OnboardingExtension`.
 * Track C remains authoritative for definition reconciliation, persistence,
 * completion, verification policy, and route gating.
 */
export function createExperienceOnboardingExtension(
  manifest: ExperienceModuleManifest,
): ExperienceOnboardingExtension | null {
  if (manifest.onboardingRequirements.length === 0) return null;

  const steps: ExperienceOnboardingStepDefinition[] = manifest.onboardingRequirements.map((requirement) => ({
    id: requirement.id,
    route: requirement.route,
    label: requirement.label,
    description: requirement.description,
    optional: requirement.optional,
    ...(requirement.fields ? { fields: requirement.fields } : {}),
    ...(requirement.agreement ? { agreement: requirement.agreement } : {}),
  }));

  return {
    source: "experience",
    namespace: manifest.id,
    steps,
  };
}
