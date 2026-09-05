import { describe, expect, it } from "vitest";
import type { CustomerLifecycleProjection, LifecycleProjectionCheckpoint, LifecycleProjectionStore } from "./contracts";
import { createLifecycleProjectionProcessor } from "./processor";
import { lifecycleEvent } from "./test-fixtures";

class MemoryProjectionStore implements LifecycleProjectionStore {
  projection: CustomerLifecycleProjection | null = null;
  checkpoint: LifecycleProjectionCheckpoint | null = null;
  receipts = new Set<string>();
  conflictOnce = false;

  async getProjection() { return this.projection; }
  async getCheckpoint() { return this.checkpoint; }
  async listProjections() { return { items: this.projection ? [this.projection] : [] }; }
  async commitProjection(input: Parameters<LifecycleProjectionStore["commitProjection"]>[0]) {
    if (this.conflictOnce) { this.conflictOnce = false; return "conflict" as const; }
    if (this.receipts.has(input.sourceIdempotencyKey)) return "duplicate" as const;
    if ((this.checkpoint?.revision ?? 0) !== input.expectedRevision) return "conflict" as const;
    this.receipts.add(input.sourceIdempotencyKey);
    this.projection = input.projection;
    this.checkpoint = input.checkpoint;
    return "committed" as const;
  }
}

describe("lifecycle projection processor", () => {
  it("requires an atomic idempotency receipt and retries compare-and-set conflicts", async () => {
    const store = new MemoryProjectionStore();
    store.conflictOnce = true;
    const process = createLifecycleProjectionProcessor(store, { now: () => "2026-09-05T16:00:00.000Z" });
    const event = lifecycleEvent({
      eventId: "registration", eventType: "registration.completed", customerId: "customer-1", identityId: "identity-1",
      occurredAt: "2026-09-05T12:00:00.000Z", source: "domain_action", idempotencyKey: "registration-1",
    });

    expect((await process(event)).status).toBe("committed");
    expect((await process({ ...event, eventId: "duplicate-envelope" })).status).toBe("duplicate");
    expect(store.projection?.identity.state).toBe("registered");
    expect(store.checkpoint?.processedCount).toBe(1);
    expect(store.checkpoint?.revision).toBe(1);
  });
});
