import { describe, expect, it } from "vitest";
import { createReleaseOneDefaultOffers } from "../../../shared/billing/defaults";
import { RELEASE_ONE_REFERENCE_OFFER_CAPABILITIES } from "../../../shared/experience/reference-capabilities";
import { ReadOnlyDefaultConfigurationStore } from "../../features/configuration/store";
import { organizationRoleHasCapability } from "../../../shared/platform/authorization";
import { validateLifecycleEventEnvelope } from "../../../shared/analytics/core";

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
  it("rejects browser-forged subscription authority in the shared F validator", () => {
    expect(() => validateLifecycleEventEnvelope({ eventId: "e", schemaVersion: 1, eventType: "subscription.created", organizationId: "one", occurredAt: "2026-09-05T12:00:00Z", receivedAt: "2026-09-05T12:00:00Z", source: "browser", correlationId: "c", idempotencyKey: "i", dataMode: "test", payload: {} })).toThrow();
  });
});
