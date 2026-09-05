import type { ConfigurationExtension, ConfigurationExtensionMap } from "./types";

/**
 * Known extension keys are registered only after the owning track defines them.
 * Track C's onboarding key is consumed verbatim; Track D can register its own
 * communications key without changing Track A's generic map helpers.
 */
export const CONFIGURATION_EXTENSION_KEYS = {
  lifecycleAcquisition: "lifecycle:acquisition",
  onboardingCustomerFoundation: "onboarding:customer-foundation",
} as const;

export type RegisteredConfigurationExtensionKey = typeof CONFIGURATION_EXTENSION_KEYS[keyof typeof CONFIGURATION_EXTENSION_KEYS];
export const configurationExtensionOwners: Readonly<Record<RegisteredConfigurationExtensionKey, "A" | "C">> = {
  [CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition]: "A",
  [CONFIGURATION_EXTENSION_KEYS.onboardingCustomerFoundation]: "C",
};
function clone<T>(value:T):T{return JSON.parse(JSON.stringify(value)) as T;}
/** Add or replace one opaque feature configuration without changing sibling drafts. */
export function setConfigurationExtension(current:ConfigurationExtensionMap,extensionKey:string,extension:ConfigurationExtension):ConfigurationExtensionMap{return{...clone(current),[extensionKey]:clone(extension)};}
/** Remove only the requested extension. Unrelated domain drafts survive. */
export function removeConfigurationExtension(current:ConfigurationExtensionMap,extensionKey:string):ConfigurationExtensionMap{const next=clone(current);delete next[extensionKey];return next;}
export function isRegisteredConfigurationExtensionKey(value:string):value is RegisteredConfigurationExtensionKey{return Object.values(CONFIGURATION_EXTENSION_KEYS).includes(value as RegisteredConfigurationExtensionKey);}
