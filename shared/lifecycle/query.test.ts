import { describe, expect, it, vi } from "vitest";
import type { LifecycleProjectionReadStore, LifecycleReadAuthorizationPort, LifecycleTimelineEventStore } from "./contracts";
import { createLifecycleQueryService, LifecycleQueryError } from "./query";
import { createEmptyCustomerLifecycleProjection } from "./projection";
import { lifecycleEvent } from "./test-fixtures";

function projectionStore(): LifecycleProjectionReadStore {
  const projection = createEmptyCustomerLifecycleProjection({ organizationId: "org-a", customerId: "customer-1", dataMode: "live" });
  return {
    async getProjection(input) { return input.organizationId === "org-a" && input.customerId === "customer-1" ? projection : null; },
    async getCheckpoint() { return null; },
    async listProjections(input) { return input.organizationId === "org-a" ? { items: [projection] } : { items: [] }; },
  };
}

const events: LifecycleTimelineEventStore = {
  async listCustomerEvents() {
    return {
      items: [
        lifecycleEvent({
          eventId: "delivered", eventType: "communication.delivered", customerId: "customer-1",
          occurredAt: "2026-09-05T14:00:00.000Z", source: "provider_webhook",
          payload: { messageId: "message-1", providerEventType: "delivered", email: "private@example.com" },
        }),
        lifecycleEvent({
          eventId: "milestone", eventType: "experience.milestone_reached", customerId: "customer-1",
          occurredAt: "2026-09-05T13:00:00.000Z", source: "domain_action",
          payload: { milestoneKey: "meaningful-use", activation: true, milestoneLabel: "Meaningful use", privateAnswer: "do not expose" },
        }),
      ],
    };
  },
};

describe("tenant-safe lifecycle queries", () => {
  it("authorizes before resolving customer aliases or reading timeline events", async () => {
    const resolveAliases = vi.fn(async () => ({ identityIds: [], leadIds: [] }));
    const listCustomerEvents = vi.fn(events.listCustomerEvents);
    const authorization: LifecycleReadAuthorizationPort = { async authorize() { return { allowed: false, reason: "forbidden" }; } };
    const service = createLifecycleQueryService({
      authorization, projections: projectionStore(), events: { listCustomerEvents }, aliases: { resolveAliases },
    });
    await expect(service.getCustomerTimeline({ organizationId: "org-b", customerId: "customer-1", actorIdentityId: "actor" }))
      .rejects.toBeInstanceOf(LifecycleQueryError);
    expect(resolveAliases).not.toHaveBeenCalled();
    expect(listCustomerEvents).not.toHaveBeenCalled();
  });

  it("isolates modes, strips arbitrary payload fields, and attaches bounded operational links", async () => {
    const authorization: LifecycleReadAuthorizationPort = {
      async authorize() { return { allowed: true, detailLevel: "sensitive", allowedModes: ["live"] }; },
    };
    const service = createLifecycleQueryService({
      authorization,
      projections: projectionStore(),
      events,
      aliases: { async resolveAliases() { return { identityIds: ["identity-1"], leadIds: ["lead-1"] }; } },
      links: { async resolveLinks() { return { delivered: { communication: { messageId: "message-1", status: "delivered" } } }; } },
    });
    const timeline = await service.getCustomerTimeline({ organizationId: "org-a", customerId: "customer-1", actorIdentityId: "actor" });
    expect(timeline.items.map((item) => item.eventId)).toEqual(["delivered", "milestone"]);
    expect(timeline.items[0]?.details).toEqual({ messageId: "message-1", providerEventType: "delivered" });
    expect(timeline.items[0]?.details).not.toHaveProperty("email");
    expect(timeline.items[1]?.details).not.toHaveProperty("privateAnswer");
    expect(timeline.items[0]?.communication?.status).toBe("delivered");

    await expect(service.getCustomerTimeline({ organizationId: "org-a", customerId: "customer-1", actorIdentityId: "actor", dataMode: "test" }))
      .rejects.toMatchObject({ code: "mode-forbidden" });
  });
});
