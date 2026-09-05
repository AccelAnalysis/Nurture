import type { ConfigurationExtension, ConfigurationJsonObject } from "../configuration/types";
import type { OnboardingFlowDefinitionV2 } from "../../../shared/customer/contracts";
import { defaultOnboardingFlowV2 } from "../../../shared/customer/defaults";
import { validateOnboardingFlowDefinition } from "../../../shared/customer/onboarding";

export { defaultOnboardingFlowV2 } from "../../../shared/customer/defaults";
export const ONBOARDING_CONFIGURATION_EXTENSION_KEY = "onboarding:customer-foundation";
export const ONBOARDING_CONFIGURATION_NAMESPACE = "nurture.onboarding";
export const ONBOARDING_CONFIGURATION_SCHEMA_VERSION = "2";

function asConfigurationJson(definition: OnboardingFlowDefinitionV2): ConfigurationJsonObject {
  return JSON.parse(JSON.stringify(definition)) as ConfigurationJsonObject;
}
export function createOnboardingConfigurationExtension(definition: OnboardingFlowDefinitionV2): ConfigurationExtension {
  validateOnboardingFlowDefinition(definition);
  return { namespace: ONBOARDING_CONFIGURATION_NAMESPACE, schemaVersion: ONBOARDING_CONFIGURATION_SCHEMA_VERSION, payload: { flow: asConfigurationJson(definition) } };
}
export function parseOnboardingConfigurationExtension(extension: ConfigurationExtension | null | undefined): OnboardingFlowDefinitionV2 {
  if (!extension) return defaultOnboardingFlowV2;
  if (extension.namespace !== ONBOARDING_CONFIGURATION_NAMESPACE || extension.schemaVersion !== ONBOARDING_CONFIGURATION_SCHEMA_VERSION) throw new Error("Unsupported onboarding configuration extension.");
  return validateOnboardingFlowDefinition(extension.payload.flow as unknown as OnboardingFlowDefinitionV2);
}
