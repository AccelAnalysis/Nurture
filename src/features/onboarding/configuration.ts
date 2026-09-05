import type { ConfigurationExtension, ConfigurationJsonObject } from "../configuration/types";
import type { OnboardingFlowDefinitionV2 } from "../../../shared/customer/contracts";
import { validateOnboardingFlowDefinition } from "../../../shared/customer/onboarding";

export const ONBOARDING_CONFIGURATION_EXTENSION_KEY = "onboarding:customer-foundation";
export const ONBOARDING_CONFIGURATION_NAMESPACE = "nurture.onboarding";
export const ONBOARDING_CONFIGURATION_SCHEMA_VERSION = "2";

export const defaultOnboardingFlowV2: OnboardingFlowDefinitionV2 = {
  schemaVersion: 2,
  id: "nurture.default",
  version: "2.0.0",
  welcomeTitle: "Welcome",
  welcomeBody: "Complete the required setup, then continue into your Experience.",
  requiresVerifiedEmail: true,
  completionPolicy: "all-required-steps",
  steps: [
    {
      id: "profile",
      route: "profile",
      label: "Profile",
      description: "Add the minimum profile information this organization needs.",
      required: true,
      questions: [
        { id: "displayName", label: "Display name", type: "text", required: true, purpose: "Used to address you in this organization.", profileField: "displayName" },
        { id: "phone", label: "Phone", type: "tel", required: false, purpose: "Optional contact detail. This does not grant SMS marketing consent.", profileField: "phone" },
        { id: "company", label: "Company", type: "text", required: false, purpose: "Optional organization-specific profile detail.", profileField: "company" },
      ],
    },
    {
      id: "ready",
      route: "ready",
      label: "Ready",
      description: "Review setup and continue into the Experience.",
      required: true,
      questions: [],
    },
  ],
};

function asConfigurationJson(definition: OnboardingFlowDefinitionV2): ConfigurationJsonObject {
  return JSON.parse(JSON.stringify(definition)) as ConfigurationJsonObject;
}

export function createOnboardingConfigurationExtension(definition: OnboardingFlowDefinitionV2): ConfigurationExtension {
  validateOnboardingFlowDefinition(definition);
  return {
    namespace: ONBOARDING_CONFIGURATION_NAMESPACE,
    schemaVersion: ONBOARDING_CONFIGURATION_SCHEMA_VERSION,
    payload: { flow: asConfigurationJson(definition) },
  };
}

export function parseOnboardingConfigurationExtension(extension: ConfigurationExtension | null | undefined): OnboardingFlowDefinitionV2 {
  if (!extension) return defaultOnboardingFlowV2;
  if (extension.namespace !== ONBOARDING_CONFIGURATION_NAMESPACE || extension.schemaVersion !== ONBOARDING_CONFIGURATION_SCHEMA_VERSION) {
    throw new Error("Unsupported onboarding configuration extension.");
  }
  const candidate = extension.payload.flow as unknown as OnboardingFlowDefinitionV2;
  return validateOnboardingFlowDefinition(candidate);
}
