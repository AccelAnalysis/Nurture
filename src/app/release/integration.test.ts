import { describe, expect, it } from "vitest";
import { createReleaseOneDefaultOffers } from "../../../shared/billing/defaults";
import { RELEASE_ONE_REFERENCE_OFFER_CAPABILITIES } from "../../../shared/experience/reference-capabilities";
import { ReadOnlyDefaultConfigurationStore } from "../../features/configuration/store";
import { organizationRoleHasCapability } from "../../../shared/platform/authorization";
import { validateLifecycleEventEnvelope } from "../../../shared/analytics/core";

import { createReleaseExperienceDefinitionSource } from "./experienceDefinition";

describe("Release 1 convergence", () => {
  it("maps all default offer tiers to B's declared reference keys", () => {
    for (const tier of ["entry", "primary", "premium"] as const) {
      const offer = createReleaseOneDefaultOffers("test-org").find((item) => item.id === tier || item.id.endsWith(`-${tier}`));
      expect(offer?.capabilityKeys).toEqual([...RELEASE_ONE_REFERENCE_OFFER_CAPABILITIES[tier]]);
    }
  });
  it("uses E's read/edit/publish separation", () => {
    expect(organizationRoleHasCapability("manager", "offers.manage")).toBe(true);
    expect(organizationRoleHasCapability("manager", "offers.publish")).toBe(false);
    expect(organizationRoleHasCapability("member", "brand.publish")).toBe(false);
  });
  it("production configuration does not manufacture a publication", () => {
    const store = new ReadOnlyDefaultConfigurationStore();
    expect(store.getRecord("one").publication).toBeNull();
    expect(store.getPublished("one").organizationId).toBe("one");
    expect(store.getPublished("two").organizationId).toBe("two");
    expect(() => store.publish()).toThrow("No changes were published");
  });
  it("serves only a registered, scoped reference definition during Hosting-only preparation", async () => {
    const unavailable = { async loadPublishedExperience() { return null; } };
    const request = { organizationId: "nurture-demo", slot: "primary" as const, moduleId: "nurture.reference-assessment", moduleVersion: "1.0.0" };
    const source = createReleaseExperienceDefinitionSource(unavailable, true);
    const result = await source.loadPublishedExperience(request);
    expect(result?.configurationVersion).toBe("reference-defaults-v1");
    expect(result?.organizationId).toBe("nurture-demo");
    expect(result?.configuration.title).toBe("Momentum Check");
    expect(await source.loadPublishedExperience({ ...request, organizationId: undefined })).toBeNull();
    expect(await source.loadPublishedExperience({ ...request, moduleId: "untrusted.module" })).toBeNull();
    expect(await source.loadPublishedExperience({ ...request, moduleVersion: "99.0.0" })).toBeNull();
  });
  it("does not turn missing backend publications into reference fallback", async () => {
    const unavailable = { async loadPublishedExperience() { return null; } };
    const source = createReleaseExperienceDefinitionSource(unavailable, false);
    expect(source).toBe(unavailable);
    expect(await source.loadPublishedExperience({ organizationId: "nurture-demo", slot: "primary", moduleId: "nurture.reference-assessment", moduleVersion: "1.0.0" })).toBeNull();
  });
  it("rejects browser-forged subscription authority in the shared F validator", () => {
    expect(() => validateLifecycleEventEnvelope({ eventId: "e", schemaVersion: 1, eventType: "subscription.created", organizationId: "one", occurredAt: "2026-09-05T12:00:00Z", receivedAt: "2026-09-05T12:00:00Z", source: "browser", correlationId: "c", idempotencyKey: "i", dataMode: "test", payload: {} })).toThrow();
  });
});
