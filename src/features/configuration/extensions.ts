import type { ConfigurationExtension, ConfigurationExtensionMap } from "./types";

export const CONFIGURATION_EXTENSION_KEYS = {
  lifecycleAcquisition: "lifecycle:acquisition",
  onboardingFlow: "onboarding:flow",
  communicationsEmail: "communications:email",
} as const;

export type RegisteredConfigurationExtensionKey = typeof CONFIGURATION_EXTENSION_KEYS[keyof typeof CONFIGURATION_EXTENSION_KEYS];

export const configurationExtensionOwners: Readonly<Record<RegisteredConfigurationExtensionKey, "A" | "C" | "D">> = {
  [CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition]: "A",
  [CONFIGURATION_EXTENSION_KEYS.onboardingFlow]: "C",
  [CONFIGURATION_EXTENSION_KEYS.communicationsEmail]: "D",
};

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

/** Add or replace one opaque feature configuration without changing any sibling draft. */
export function setConfigurationExtension(current: ConfigurationExtensionMap, extensionKey: string, extension: ConfigurationExtension): ConfigurationExtensionMap {
  return { ...clone(current), [extensionKey]: clone(extension) };
}

/** Remove only the requested extension. Unrelated domain drafts survive. */
export function removeConfigurationExtension(current: ConfigurationExtensionMap, extensionKey: string): ConfigurationExtensionMap {
  const next = clone(current);
  delete next[extensionKey];
  return next;
}

export function isRegisteredConfigurationExtensionKey(value: string): value is RegisteredConfigurationExtensionKey {
  return Object.values(CONFIGURATION_EXTENSION_KEYS).includes(value as RegisteredConfigurationExtensionKey);
}
