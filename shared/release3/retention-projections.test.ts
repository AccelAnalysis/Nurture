import { describe, expect, it } from "vitest";
import type { EventPayload, LifecycleEventSource } from "../analytics/contracts";
import {
  initialRetentionProjection,
  projectRetentionEvents,
  segmentFactsFromProjection,
  sourceAllowedForRelease3Event,
  type Release3LifecycleEventEnvelope,
  type Release3ProjectedEventType,
} from "./retention-projections";

function event(input: {
  id: string;
  type: Release3ProjectedEventType;
  source: LifecycleEventSource;
  occurredAt: string;
  payload?: EventPayload;
}): Release3LifecycleEventEnvelope {
  return {
    eventId: input.id,
    eventType: input.type,
    schemaVersion: 1,
    organizationId: "org-a",
    subjectId: "customer-a",
    subjectKind: "customer",
    customerId: "customer-a",
    occurredAt: input.occurredAt,
    receivedAt: input.occurredAt,
    source: input.source,
    correlationId: `corr-${input.id}`,
    idempotencyKey: `idem-${input.id}`,
    dataMode: "test",
    payload: input.payload ?? {},
  };
}

const inactive = event({ id: "inactive", type: "experience.inactive", source: "scheduler", occurredAt: "2026-09-05T10:00:00.000Z", payload: { inactiveSince: "2026-09-01T10:00:00.000Z", lastMeaningfulActivityAt: "2026-09-01T09:00:00.000Z", thresholdHours: 72 } });
const reactivated = event({ id: "reactivated", type: "experience.reactivated", source: "domain_action", occurredAt: "2026-09-05T11:00:00.000Z" });
const failed = event({ id: "failed", type: "payment.failed", source: "provider_webhook", occurredAt: "2026-09-05T09:00:00.000Z" });
const recovered = event({ id: "recovered", type: "payment.recovered", source: "provider_webhook", occurredAt: "2026-09-05T12:00:00.000Z" });

describe("Release 3 retention projections", () => {
  it("starts engagement and payment facts as unknown instead of inventing inactivity", () => {
    const state = initialRetentionProjection("org-a", "customer-a", "test");
    expect(state.engagement.state).toBe("unknown");
    expect(state.commercial.paymentHealth).toBe("unknown");
  });

  it("rejects browser authority for inactivity and payment failure", () => {
    expect(sourceAllowedForRelease3Event({ ...inactive, source: "browser" })).toBe(false);
    expect(sourceAllowedForRelease3Event({ ...failed, source: "browser" })).toBe(false);
  });

  it("converges under duplicate and out-of-order events", () => {
    const initial = initialRetentionProjection("org-a", "customer-a", "test");
    const first = projectRetentionEvents(initial, [recovered, inactive, failed, reactivated, failed]);
    const second = projectRetentionEvents(initial, [failed, reactivated, recovered, inactive]);
    expect(first.engagement.state).toBe("active");
    expect(first.engagement.reactivatedAt).toBe("2026-09-05T11:00:00.000Z");
    expect(first.commercial.paymentHealth).toBe("recovered");
    expect(first.engagement).toEqual(second.engagement);
    expect(first.commercial).toEqual(second.commercial);
    expect(new Set(first.seenEventIds).size).toBe(first.seenEventIds.length);
  });

  it("does not let an older inactivity event regress a newer reactivation", () => {
    const projected = projectRetentionEvents(initialRetentionProjection("org-a", "customer-a", "test"), [reactivated]);
    const withLateArrival = projectRetentionEvents(projected, [inactive]);
    expect(withLateArrival.engagement.state).toBe("active");
  });

  it("keeps cancellation request distinct from provider-confirmed cancellation", () => {
    const requested = event({ id: "cancel-request", type: "subscription.cancellation_requested", source: "domain_action", occurredAt: "2026-09-05T10:00:00.000Z" });
    const cancelled = event({ id: "cancelled", type: "subscription.cancelled", source: "provider_webhook", occurredAt: "2026-09-06T10:00:00.000Z", payload: { accessEndsAt: "2026-09-06T10:00:00.000Z" } });
    const state = projectRetentionEvents(initialRetentionProjection("org-a", "customer-a", "test"), [cancelled, requested]);
    expect(state.commercial.cancellation.status).toBe("completed");
    expect(state.commercial.cancellation.requestedAt).toBe("2026-09-05T10:00:00.000Z");
    expect(state.commercial.cancellation.completedAt).toBe("2026-09-06T10:00:00.000Z");
  });

  it("produces only approved segment facts with provenance", () => {
    const state = projectRetentionEvents(initialRetentionProjection("org-a", "customer-a", "test"), [inactive, failed]);
    const facts = segmentFactsFromProjection(state, "2026-09-05T12:00:00.000Z");
    expect(facts.find((fact) => fact.key === "engagement.state")?.value).toBe("inactive");
    expect(facts.find((fact) => fact.key === "payment.health")?.value).toBe("failed");
    expect(facts.every((fact) => Boolean(fact.provenance.occurredAt))).toBe(true);
  });
});
