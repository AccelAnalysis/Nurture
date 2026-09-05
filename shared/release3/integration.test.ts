import { describe, expect, it } from "vitest";
import { buildLogicalEffectId, modeMayCreateExternalEffect } from "./contracts";
import { sourceAllowedForRelease3Event, type Release3LifecycleEventEnvelope } from "./retention-projections";

const providerPayment: Release3LifecycleEventEnvelope = {
  eventId: "event-1",
  eventType: "payment.failed",
  schemaVersion: 1,
  organizationId: "org-a",
  subjectId: "customer-a",
  subjectKind: "customer",
  customerId: "customer-a",
  occurredAt: "2026-09-05T12:00:00.000Z",
  receivedAt: "2026-09-05T12:00:01.000Z",
  source: "provider_webhook",
  correlationId: "corr-1",
  idempotencyKey: "idem-1",
  dataMode: "test",
  payload: {},
};

describe("Release 3 integration boundaries", () => {
  it("does not permit preview, demo, or development modes to create external effects", () => {
    expect(modeMayCreateExternalEffect("live")).toBe(true);
    expect(modeMayCreateExternalEffect("test")).toBe(true);
    expect(modeMayCreateExternalEffect("preview")).toBe(false);
    expect(modeMayCreateExternalEffect("demo")).toBe(false);
    expect(modeMayCreateExternalEffect("development")).toBe(false);
  });

  it("keeps logical effects tenant-qualified so the same customer/event cannot collide across organizations", () => {
    const common = { customerId: "customer-a", automationId: "renewal", automationVersion: 2, triggerId: "event-1", branchId: "default", actionIndex: 0 };
    const orgA = buildLogicalEffectId({ organizationId: "org-a", ...common });
    const orgB = buildLogicalEffectId({ organizationId: "org-b", ...common });
    expect(orgA).not.toBe(orgB);
    expect(orgA.startsWith("org-a:")).toBe(true);
    expect(orgB.startsWith("org-b:")).toBe(true);
  });

  it("rejects browser-authored commercial state even when all other event fields are copied from a trusted event", () => {
    expect(sourceAllowedForRelease3Event(providerPayment)).toBe(true);
    expect(sourceAllowedForRelease3Event({ ...providerPayment, source: "browser" })).toBe(false);
  });
});
