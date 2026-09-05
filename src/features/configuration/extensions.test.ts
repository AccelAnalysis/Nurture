import { describe, expect, it } from "vitest";
import { CONFIGURATION_EXTENSION_KEYS, removeConfigurationExtension, setConfigurationExtension } from "./extensions";
import type { ConfigurationExtensionMap } from "./types";

describe("configuration extension independence",()=>{
 const communicationKey="communications:track-d-owned";
 const initial:ConfigurationExtensionMap={
  [CONFIGURATION_EXTENSION_KEYS.onboardingCustomerFoundation]:{namespace:"nurture.onboarding",schemaVersion:"2",payload:{welcome:"Keep me"}},
  [communicationKey]:{namespace:"nurture.communications",schemaVersion:"1",payload:{sender:"Keep me too"}},
 };
 it("uses Track C's actual onboarding extension key",()=>{expect(CONFIGURATION_EXTENSION_KEYS.onboardingCustomerFoundation).toBe("onboarding:customer-foundation");});
 it("adds lifecycle configuration without erasing C or a D-owned draft",()=>{const next=setConfigurationExtension(initial,CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition,{namespace:"nurture.lifecycle.acquisition",schemaVersion:"1",payload:{enabled:false}});expect(next[CONFIGURATION_EXTENSION_KEYS.onboardingCustomerFoundation]).toEqual(initial[CONFIGURATION_EXTENSION_KEYS.onboardingCustomerFoundation]);expect(next[communicationKey]).toEqual(initial[communicationKey]);expect(next[CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition]?.payload.enabled).toBe(false);});
 it("removes only the selected extension",()=>{const withLifecycle=setConfigurationExtension(initial,CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition,{namespace:"nurture.lifecycle.acquisition",schemaVersion:"1",payload:{enabled:false}});const next=removeConfigurationExtension(withLifecycle,CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition);expect(next[CONFIGURATION_EXTENSION_KEYS.lifecycleAcquisition]).toBeUndefined();expect(next[CONFIGURATION_EXTENSION_KEYS.onboardingCustomerFoundation]).toBeDefined();expect(next[communicationKey]).toBeDefined();});
});
