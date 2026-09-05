import type { ExperienceRequirementVerificationPort, OnboardingFlowDefinitionV2 } from "../../../shared/customer/contracts.js";
import { defaultOnboardingFlowV2 } from "../../../shared/customer/defaults.js";

export interface OnboardingDefinitionSource {
  getPublished(input: { organizationId: string; flowId: string }): Promise<OnboardingFlowDefinitionV2 | null>;
  getVersion(input: { organizationId: string; flowId: string; version: string }): Promise<OnboardingFlowDefinitionV2 | null>;
}
const defaultSource: OnboardingDefinitionSource = {
  async getPublished({ flowId }) { return flowId === defaultOnboardingFlowV2.id ? defaultOnboardingFlowV2 : null; },
  async getVersion({ flowId, version }) { return flowId === defaultOnboardingFlowV2.id && version === defaultOnboardingFlowV2.version ? defaultOnboardingFlowV2 : null; },
};
const unavailableExperienceVerifier: ExperienceRequirementVerificationPort = {
  async verify() { return { status: "unverified", reason: "The Experience requirement validator is not composed." }; },
};
let definitionSource: OnboardingDefinitionSource = defaultSource;
let experienceVerifier: ExperienceRequirementVerificationPort = unavailableExperienceVerifier;

/** Release finisher composes Track A's published extension reader here. */
export function configureOnboardingDefinitionSource(source: OnboardingDefinitionSource) { definitionSource = source; }
/** Release finisher composes Track B's trusted Experience requirement validator here. */
export function configureExperienceRequirementVerifier(port: ExperienceRequirementVerificationPort) { experienceVerifier = port; }
export function getOnboardingDefinitionSource() { return definitionSource; }
export function getExperienceRequirementVerifier() { return experienceVerifier; }
