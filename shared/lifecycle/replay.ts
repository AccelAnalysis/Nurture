import type { AnalyticsDataMode, LifecycleEventEnvelope } from "../analytics/contracts.js";
import type {
  AuthoritativeCommercialSnapshot,
  AuthoritativeCommunicationEligibilitySnapshot,
  CustomerLifecycleProjection,
  LifecycleCurrentStateBackfillSnapshot,
  LifecycleProjectionCheckpoint,
} from "./contracts.js";
import {
  advanceLifecycleProjectionCheckpoint,
  applyAuthoritativeCommercialSnapshot,
  applyAuthoritativeCommunicationSnapshot,
  applyCurrentStateBackfillSnapshot,
  applyLifecycleEventToProjection,
  createEmptyCustomerLifecycleProjection,
  createLifecycleProjectionCheckpoint,
} from "./projection.js";

export interface LifecycleReplayDiagnostic {
  eventId?: string;
  code: "duplicate" | "rejected" | "wrong_scope" | "wrong_mode" | "not_projected" | "not_customer_scoped";
  message: string;
}

export interface LifecycleProjectionReplayInput {
  organizationId: string;
  customerId: string;
  dataMode: AnalyticsDataMode;
  events: readonly LifecycleEventEnvelope[];
  currentStateBackfill?: LifecycleCurrentStateBackfillSnapshot;
  commercialSnapshot?: AuthoritativeCommercialSnapshot;
  communicationSnapshot?: AuthoritativeCommunicationEligibilitySnapshot;
  now?: string;
}

export interface LifecycleProjectionReplayResult {
  projection: CustomerLifecycleProjection;
  checkpoint: LifecycleProjectionCheckpoint;
  diagnostics: readonly LifecycleReplayDiagnostic[];
  mode: "projection_only";
  sideEffects: {
    automationEnrollments: 0;
    communicationEffects: 0;
    syntheticEventsCreated: 0;
  };
}

function compareEventsAscending(a: LifecycleEventEnvelope, b: LifecycleEventEnvelope): number {
  const occurred = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
  if (occurred) return occurred;
  const received = Date.parse(a.receivedAt) - Date.parse(b.receivedAt);
  if (received) return received;
  return a.eventId.localeCompare(b.eventId);
}

/**
 * Rebuilds only F-owned projection state. This function has no automation or
 * communication ports by design, so historical replay cannot enroll or send.
 */
export function replayLifecycleProjection(input: LifecycleProjectionReplayInput): LifecycleProjectionReplayResult {
  const now = input.now ?? new Date().toISOString();
  let projection = createEmptyCustomerLifecycleProjection({
    organizationId: input.organizationId,
    customerId: input.customerId,
    dataMode: input.dataMode,
    now,
  });
  let checkpoint = createLifecycleProjectionCheckpoint({
    organizationId: input.organizationId,
    customerId: input.customerId,
    dataMode: input.dataMode,
    now,
  });
  const diagnostics: LifecycleReplayDiagnostic[] = [];
  const seen = new Set<string>();

  for (const event of [...input.events].sort(compareEventsAscending)) {
    const dedupeKey = `${event.organizationId}\u0000${event.dataMode}\u0000${event.idempotencyKey}`;
    if (seen.has(dedupeKey)) {
      diagnostics.push({ eventId: event.eventId, code: "duplicate", message: "Duplicate logical event ignored during projection replay." });
      continue;
    }
    seen.add(dedupeKey);

    try {
      const result = applyLifecycleEventToProjection(projection, event);
      projection = result.projection;
      checkpoint = advanceLifecycleProjectionCheckpoint(checkpoint, event, { applied: result.applied, processedAt: now });
      if (result.ignoredReason) {
        diagnostics.push({
          eventId: event.eventId,
          code: result.ignoredReason,
          message: `Event did not change this projection: ${result.ignoredReason}.`,
        });
      }
    } catch (error) {
      checkpoint = { ...checkpoint, rejectedCount: checkpoint.rejectedCount + 1, updatedAt: now };
      diagnostics.push({
        eventId: event.eventId,
        code: "rejected",
        message: error instanceof Error ? error.message : "Lifecycle event rejected during projection replay.",
      });
    }
  }

  if (input.currentStateBackfill) projection = applyCurrentStateBackfillSnapshot(projection, input.currentStateBackfill, now);
  if (input.commercialSnapshot) projection = applyAuthoritativeCommercialSnapshot(projection, input.commercialSnapshot, now);
  if (input.communicationSnapshot) projection = applyAuthoritativeCommunicationSnapshot(projection, input.communicationSnapshot, now);

  return {
    projection,
    checkpoint,
    diagnostics,
    mode: "projection_only",
    sideEffects: { automationEnrollments: 0, communicationEffects: 0, syntheticEventsCreated: 0 },
  };
}
