import { createHash } from "node:crypto";
import type { AnalyticsEventType, EventPayload, LifecycleEventEnvelope, LifecycleSubjectKind } from "../../../shared/analytics/contracts.js";
import { validateLifecycleEventEnvelope } from "../../../shared/analytics/core.js";
import type { AuthoritativeCustomerDataMode } from "../../../shared/customer/contracts.js";

export function stableCustomerEventId(organizationId: string, idempotencyKey: string) {
  return `idem-${createHash("sha256").update(`${organizationId}:${idempotencyKey}`).digest("hex")}`;
}
export function buildTrustedCustomerLifecycleEvent(input: {
  eventType: AnalyticsEventType;
  organizationId: string;
  subjectKind: LifecycleSubjectKind;
  subjectId: string;
  identityId?: string;
  customerId?: string;
  dataMode: AuthoritativeCustomerDataMode;
  correlationId: string;
  idempotencyKey: string;
  occurredAt: string;
  payload?: EventPayload;
}): LifecycleEventEnvelope {
  const eventId = stableCustomerEventId(input.organizationId, input.idempotencyKey);
  return validateLifecycleEventEnvelope({
    eventId,
    eventType: input.eventType,
    schemaVersion: 1,
    organizationId: input.organizationId,
    subjectId: input.subjectId,
    subjectKind: input.subjectKind,
    ...(input.identityId ? { identityId: input.identityId } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}),
    occurredAt: input.occurredAt,
    receivedAt: input.occurredAt,
    source: "trusted_server",
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    dataMode: input.dataMode,
    payload: input.payload ?? {},
  });
}
