import { describe, expect, it } from "vitest";
import { replayLifecycleProjection } from "./replay";
import { lifecycleEvent } from "./test-fixtures";

describe("projection-only replay", () => {
  it("deduplicates events and structurally disables lifecycle side effects", () => {
    const event = lifecycleEvent({
      eventId: "registration-1", eventType: "registration.completed", customerId: "customer-1", identityId: "identity-1",
      occurredAt: "2026-09-05T12:10:00.000Z", source: "domain_action", idempotencyKey: "registration-effect-1",
    });
    const duplicate = { ...event, eventId: "registration-duplicate" };
    const result = replayLifecycleProjection({
      organizationId: "org-a", customerId: "customer-1", dataMode: "live", events: [duplicate, event],
      currentStateBackfill: {
        organizationId: "org-a", customerId: "customer-1", version: "r1-current", asOf: "2026-09-05T12:30:00.000Z",
        identity: { state: "lead" },
        onboarding: { state: "completed", flowVersion: "r1-flow", completedAt: "2026-09-05T12:20:00.000Z" },
      },
      now: "2026-09-05T16:00:00.000Z",
    });

    expect(result.mode).toBe("projection_only");
    expect(result.sideEffects).toEqual({ automationEnrollments: 0, communicationEffects: 0, syntheticEventsCreated: 0 });
    expect(result.projection.identity.state).toBe("registered");
    expect(result.projection.identity.metadata.provenance).toBe("event");
    expect(result.projection.onboarding.state).toBe("completed");
    expect(result.projection.onboarding.metadata.provenance).toBe("backfill_snapshot");
    expect(result.diagnostics.some((item) => item.code === "duplicate")).toBe(true);
  });
});
