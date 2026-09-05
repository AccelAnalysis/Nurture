import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsDataMode,
  type AnalyticsEventType,
  type EventPayload,
  type LifecycleEventEnvelope,
  type LifecycleEventSource,
} from "../analytics/contracts.js";

export function lifecycleEvent(input: {
  eventId: string;
  eventType: AnalyticsEventType;
  organizationId?: string;
  customerId?: string;
  identityId?: string;
  occurredAt: string;
  receivedAt?: string;
  source: LifecycleEventSource;
  dataMode?: AnalyticsDataMode;
  idempotencyKey?: string;
  payload?: EventPayload;
}): LifecycleEventEnvelope {
  return {
    eventId: input.eventId,
    eventType: input.eventType,
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    organizationId: input.organizationId ?? "org-a",
    subjectKind: input.customerId === undefined ? undefined : "customer",
    subjectId: input.customerId,
    customerId: input.customerId,
    identityId: input.identityId,
    occurredAt: input.occurredAt,
    receivedAt: input.receivedAt ?? input.occurredAt,
    source: input.source,
    correlationId: "corr-1",
    idempotencyKey: input.idempotencyKey ?? input.eventId,
    dataMode: input.dataMode ?? "live",
    payload: input.payload ?? {},
  };
}
