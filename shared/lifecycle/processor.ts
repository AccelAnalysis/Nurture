import type { LifecycleEventEnvelope } from "../analytics/contracts.js";
import type {
  CustomerLifecycleProjection,
  LifecycleProjectionApplyResult,
  LifecycleProjectionCheckpoint,
  LifecycleProjectionStore,
} from "./contracts.js";
import {
  advanceLifecycleProjectionCheckpoint,
  applyLifecycleEventToProjection,
  createEmptyCustomerLifecycleProjection,
  createLifecycleProjectionCheckpoint,
} from "./projection.js";
import { validateLifecycleProjectionEvent } from "./registrations.js";

export type LifecycleProjectionProcessStatus = "committed" | "duplicate" | "ignored" | "conflict";

export interface LifecycleProjectionProcessResult {
  status: LifecycleProjectionProcessStatus;
  event: LifecycleEventEnvelope;
  projection?: CustomerLifecycleProjection;
  checkpoint?: LifecycleProjectionCheckpoint;
  apply?: LifecycleProjectionApplyResult;
}

export interface LifecycleProjectionProcessorOptions {
  maxConflictRetries?: number;
  now?: () => string;
}

/**
 * Processes an envelope that has already crossed E's canonical trusted append
 * boundary. The store adapter must implement atomic compare-and-set + an event
 * idempotency receipt; this processor never writes a second event record.
 */
export function createLifecycleProjectionProcessor(
  store: LifecycleProjectionStore,
  options: LifecycleProjectionProcessorOptions = {},
) {
  const maxConflictRetries = options.maxConflictRetries ?? 4;
  const now = options.now ?? (() => new Date().toISOString());

  return async function processLifecycleEnvelope(value: unknown): Promise<LifecycleProjectionProcessResult> {
    const { event, registration } = validateLifecycleProjectionEvent(value);
    if (!event.customerId || registration.projectionPolicy === "none") {
      return { status: "ignored", event };
    }

    for (let attempt = 0; attempt <= maxConflictRetries; attempt += 1) {
      const scope = { organizationId: event.organizationId, customerId: event.customerId, dataMode: event.dataMode };
      const [existingProjection, existingCheckpoint] = await Promise.all([
        store.getProjection(scope),
        store.getCheckpoint(scope),
      ]);
      const projection = existingProjection ?? createEmptyCustomerLifecycleProjection({ ...scope, now: event.receivedAt });
      const checkpoint = existingCheckpoint ?? createLifecycleProjectionCheckpoint({ ...scope, now: event.receivedAt });
      const apply = applyLifecycleEventToProjection(projection, event);
      const nextCheckpoint = advanceLifecycleProjectionCheckpoint(checkpoint, event, {
        applied: apply.applied,
        processedAt: now(),
      });

      const commit = await store.commitProjection({
        projection: apply.projection,
        checkpoint: nextCheckpoint,
        expectedRevision: checkpoint.revision,
        sourceEventId: event.eventId,
        sourceIdempotencyKey: event.idempotencyKey,
      });
      if (commit === "committed") {
        return { status: "committed", event, projection: apply.projection, checkpoint: nextCheckpoint, apply };
      }
      if (commit === "duplicate") {
        return { status: "duplicate", event, projection, checkpoint, apply };
      }
    }

    return { status: "conflict", event };
  };
}
