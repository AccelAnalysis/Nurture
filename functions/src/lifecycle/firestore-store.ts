import { createHash } from "node:crypto";
import type { AnalyticsDataMode, AnalyticsEventType, LifecycleEventEnvelope } from "../../../shared/analytics/contracts.js";
import { validateLifecycleEventEnvelope } from "../../../shared/analytics/core.js";
import type {
  CustomerLifecycleProjection,
  LifecycleCustomerAliasPort,
  LifecycleCustomerFilters,
  LifecyclePage,
  LifecycleProjectionCheckpoint,
  LifecycleProjectionCommitResult,
  LifecycleProjectionStore,
  LifecycleTimelineEventStore,
} from "../../../shared/lifecycle/contracts.js";
import { db } from "../firebase.js";

function organizationRef(organizationId: string) {
  return db.collection("organizations").doc(organizationId);
}

function scopeKey(customerId: string, dataMode: AnalyticsDataMode) {
  return `${encodeURIComponent(dataMode)}~${encodeURIComponent(customerId)}`;
}

function projectionRef(organizationId: string, customerId: string, dataMode: AnalyticsDataMode) {
  return organizationRef(organizationId).collection("lifecycleProjections").doc(scopeKey(customerId, dataMode));
}

function checkpointRef(organizationId: string, customerId: string, dataMode: AnalyticsDataMode) {
  return organizationRef(organizationId).collection("lifecycleProjectionCheckpoints").doc(scopeKey(customerId, dataMode));
}

function projectionReceiptRef(input: {
  organizationId: string;
  customerId: string;
  dataMode: AnalyticsDataMode;
  idempotencyKey: string;
}) {
  const id = createHash("sha256")
    .update(`${input.dataMode}:${input.customerId}:${input.idempotencyKey}`)
    .digest("hex");
  return organizationRef(input.organizationId).collection("lifecycleProjectionReceipts").doc(id);
}

function matchesFilters(projection: CustomerLifecycleProjection, filters?: LifecycleCustomerFilters) {
  if (!filters) return true;
  if (filters.identity?.length && !filters.identity.includes(projection.identity.state)) return false;
  if (filters.onboarding?.length && !filters.onboarding.includes(projection.onboarding.state)) return false;
  if (filters.commercial?.length && !filters.commercial.includes(projection.commercial.state)) return false;
  if (filters.experience?.length && !filters.experience.includes(projection.experience.state)) return false;
  if (filters.communicationMarketing?.length && !filters.communicationMarketing.includes(projection.communication.email.marketing.state)) return false;
  return true;
}

export class FirestoreLifecycleProjectionStore implements LifecycleProjectionStore {
  async getProjection(input: { organizationId: string; customerId: string; dataMode: AnalyticsDataMode }): Promise<CustomerLifecycleProjection | null> {
    const snapshot = await projectionRef(input.organizationId, input.customerId, input.dataMode).get();
    return snapshot.exists ? snapshot.data() as CustomerLifecycleProjection : null;
  }

  async getCheckpoint(input: { organizationId: string; customerId: string; dataMode: AnalyticsDataMode }): Promise<LifecycleProjectionCheckpoint | null> {
    const snapshot = await checkpointRef(input.organizationId, input.customerId, input.dataMode).get();
    return snapshot.exists ? snapshot.data() as LifecycleProjectionCheckpoint : null;
  }

  async listProjections(input: {
    organizationId: string;
    dataMode: AnalyticsDataMode;
    limit: number;
    cursor?: string;
    filters?: LifecycleCustomerFilters;
  }): Promise<LifecyclePage<CustomerLifecycleProjection>> {
    const collection = organizationRef(input.organizationId).collection("lifecycleProjections");
    let query = collection.where("dataMode", "==", input.dataMode).orderBy("updatedAt", "desc").limit(Math.min(250, Math.max(input.limit * 4, input.limit)));
    if (input.cursor) {
      const cursorSnapshot = await collection.doc(input.cursor).get();
      if (cursorSnapshot.exists) query = query.startAfter(cursorSnapshot);
    }
    const snapshot = await query.get();
    const matching = snapshot.docs
      .map((item) => item.data() as CustomerLifecycleProjection)
      .filter((item) => matchesFilters(item, input.filters));
    const items = matching.slice(0, input.limit);
    const last = items.length
      ? snapshot.docs.find((item) => item.id === scopeKey(items[items.length - 1].customerId, input.dataMode))
      : undefined;
    const nextCursor = items.length === input.limit && last ? last.id : undefined;
    return { items, ...(nextCursor ? { nextCursor } : {}) };
  }

  async commitProjection(input: {
    projection: CustomerLifecycleProjection;
    checkpoint: LifecycleProjectionCheckpoint;
    expectedRevision: number;
    sourceEventId: string;
    sourceIdempotencyKey: string;
  }): Promise<LifecycleProjectionCommitResult> {
    const scope = {
      organizationId: input.projection.organizationId,
      customerId: input.projection.customerId,
      dataMode: input.projection.dataMode,
    };
    const pRef = projectionRef(scope.organizationId, scope.customerId, scope.dataMode);
    const cRef = checkpointRef(scope.organizationId, scope.customerId, scope.dataMode);
    const rRef = projectionReceiptRef({ ...scope, idempotencyKey: input.sourceIdempotencyKey });
    return db.runTransaction(async (transaction) => {
      const receipt = await transaction.get(rRef);
      if (receipt.exists) return "duplicate";
      const checkpoint = await transaction.get(cRef);
      const currentRevision = checkpoint.exists ? Number(checkpoint.data()?.revision ?? -1) : 0;
      if (currentRevision !== input.expectedRevision) return "conflict";
      transaction.set(pRef, JSON.parse(JSON.stringify(input.projection)), { merge: false });
      transaction.set(cRef, JSON.parse(JSON.stringify(input.checkpoint)), { merge: false });
      transaction.create(rRef, {
        organizationId: scope.organizationId,
        customerId: scope.customerId,
        dataMode: scope.dataMode,
        sourceEventId: input.sourceEventId,
        sourceIdempotencyKey: input.sourceIdempotencyKey,
        revision: input.checkpoint.revision,
        processedAt: input.checkpoint.updatedAt,
      });
      return "committed";
    });
  }
}

async function queryCustomerEvents(input: {
  organizationId: string;
  customerId: string;
  dataMode: AnalyticsDataMode;
  limit: number;
}) {
  return organizationRef(input.organizationId)
    .collection("lifecycleEvents")
    .where("customerId", "==", input.customerId)
    .where("dataMode", "==", input.dataMode)
    .orderBy("occurredAt", "desc")
    .limit(input.limit)
    .get();
}

async function querySubjectEvents(input: {
  organizationId: string;
  subjectKind: "lead" | "identity";
  subjectId: string;
  dataMode: AnalyticsDataMode;
  limit: number;
}) {
  return organizationRef(input.organizationId)
    .collection("lifecycleEvents")
    .where("subjectKind", "==", input.subjectKind)
    .where("subjectId", "==", input.subjectId)
    .where("dataMode", "==", input.dataMode)
    .orderBy("occurredAt", "desc")
    .limit(input.limit)
    .get();
}

function timelineCursor(event: LifecycleEventEnvelope) {
  return Buffer.from(JSON.stringify({ occurredAt: event.occurredAt, eventId: event.eventId }), "utf8").toString("base64url");
}

function decodeTimelineCursor(cursor?: string): { occurredAt: string; eventId: string } | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    return typeof value.occurredAt === "string" && typeof value.eventId === "string" ? { occurredAt: value.occurredAt, eventId: value.eventId } : null;
  } catch {
    return null;
  }
}

export class FirestoreLifecycleTimelineEventStore implements LifecycleTimelineEventStore {
  async listCustomerEvents(input: {
    organizationId: string;
    customerId: string;
    identityIds: readonly string[];
    leadIds: readonly string[];
    dataMode: AnalyticsDataMode;
    limit: number;
    cursor?: string;
    eventTypes?: readonly AnalyticsEventType[];
  }): Promise<LifecyclePage<LifecycleEventEnvelope>> {
    const perQuery = Math.min(100, Math.max(input.limit * 2, 25));
    const snapshots = await Promise.all([
      queryCustomerEvents({ ...input, limit: perQuery }),
      ...input.identityIds.slice(0, 5).map((identityId) => querySubjectEvents({ organizationId: input.organizationId, subjectKind: "identity", subjectId: identityId, dataMode: input.dataMode, limit: perQuery })),
      ...input.leadIds.slice(0, 10).map((leadId) => querySubjectEvents({ organizationId: input.organizationId, subjectKind: "lead", subjectId: leadId, dataMode: input.dataMode, limit: perQuery })),
    ]);
    const byId = new Map<string, LifecycleEventEnvelope>();
    for (const snapshot of snapshots) {
      for (const item of snapshot.docs) {
        const event = validateLifecycleEventEnvelope(item.data());
        if (event.organizationId !== input.organizationId || event.dataMode !== input.dataMode) continue;
        byId.set(event.eventId, event);
      }
    }
    const allowedTypes = input.eventTypes?.length ? new Set(input.eventTypes) : null;
    const cursor = decodeTimelineCursor(input.cursor);
    const candidates = [...byId.values()]
      .filter((event) => !allowedTypes || allowedTypes.has(event.eventType))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.receivedAt.localeCompare(left.receivedAt) || right.eventId.localeCompare(left.eventId))
      .filter((event) => !cursor || event.occurredAt < cursor.occurredAt || (event.occurredAt === cursor.occurredAt && event.eventId < cursor.eventId));
    const items = candidates.slice(0, input.limit);
    return {
      items,
      ...(candidates.length > items.length && items.length ? { nextCursor: timelineCursor(items[items.length - 1]) } : {}),
    };
  }
}

export class FirestoreLifecycleCustomerAliasPort implements LifecycleCustomerAliasPort {
  async resolveAliases(input: { organizationId: string; customerId: string }): Promise<{ identityIds: readonly string[]; leadIds: readonly string[] }> {
    const snapshot = await organizationRef(input.organizationId).collection("customers").doc(input.customerId).get();
    if (!snapshot.exists) return { identityIds: [], leadIds: [] };
    const data = snapshot.data() ?? {};
    return {
      identityIds: typeof data.identityId === "string" ? [data.identityId] : [],
      leadIds: typeof data.linkedLeadId === "string" ? [data.linkedLeadId] : [],
    };
  }
}

export const lifecycleProjectionStore = new FirestoreLifecycleProjectionStore();
export const lifecycleTimelineEventStore = new FirestoreLifecycleTimelineEventStore();
export const lifecycleCustomerAliasPort = new FirestoreLifecycleCustomerAliasPort();
