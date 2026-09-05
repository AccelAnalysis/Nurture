import { describe, expect, it } from "vitest";
import { CONFIGURATION_EXTENSION_KEYS, removeConfigurationExtension, setConfigurationExtension } from "./extensions";
import type { ConfigurationExtensionMap } from "./types";

describe("configuration extension independence", () => {
  const initial: ConfigurationExtensionMap = {
    [CONFIGURATION_EXTENSION_KEYS.onboardingFlow]: { namespace: "nurture.onboarding", schemaVersion: "2", payload: { welcome: "Keep me" } },
    [CONFIGURATION_EXTENSION_KEYS.communicationsEmail]: { namespace: "nurture.communications.email", schemaVersion: "1", payload: { sender: "Keep me too" } },
  };

  it("adds lifecycle configuration without erasing C or D drafts", () => {
    const next = setConfigurationExtension(initial, CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition, { namespace: "nurture.lifecycle.acquisition", schemaVersion: "1", payload: { enabled: false } });
    expect(next[CONFIGURATION_EXTENSION_KEYS.onboardingFlow]).toEqual(initial[CONFIGURATION_EXTENSION_KEYS.onboardingFlow]);
    expect(next[CONFIGURATION_EXTENSION_KEYS.communicationsEmail]).toEqual(initial[CONFIGURATION_EXTENSION_KEYS.communicationsEmail]);
    expect(next[CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition]?.payload.enabled).toBe(false);
  });

  it("removes only the selected extension", () => {
    const withLifecycle = setConfigurationExtension(initial, CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition, { namespace: "nurture.lifecycle.acquisition", schemaVersion: "1", payload: { enabled: false } });
    const next = removeConfigurationExtension(withLifecycle, CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition);
    expect(next[CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition]).toBeUndefined();
    expect(next[CONFIGURATION_EXTENSION_KEYS.onboardingFlow]).toBeDefined();
    expect(next[CONFIGURATION_EXTENSION_KEYS.communicationsEmail]).toBeDefined();
  });
});
