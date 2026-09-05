import { createHash } from "node:crypto";
import type { MessageDeliveryRecord, MessageDeliveryStatus } from "../../../shared/communications/contracts.js";

export type CommunicationLifecycleEventType =
  | "communication.provider_accepted"
  | "communication.delivered"
  | "communication.bounced"
  | "communication.dropped"
  | "communication.complained"
  | "communication.unsubscribed"
  | "communication.suppressed"
  | "communication.failed"
  | "communication.outcome_unknown";

export type CommunicationLifecycleEventSource = "provider_webhook" | "trusted_server";

export interface CommunicationEventOutboxRecord {
  schemaVersion: 1;
  outboxId: string;
  organizationId: string;
  eventType: CommunicationLifecycleEventType;
  source: CommunicationLifecycleEventSource;
  dataMode: MessageDeliveryRecord["intent"]["mode"];
  subjectKind: "lead" | "customer";
  subjectId: string;
  customerId?: string;
  messageId: string;
  effectId: string;
  purpose: MessageDeliveryRecord["intent"]["purpose"];
  templateId: MessageDeliveryRecord["intent"]["templateId"];
  templateVersion: number;
  occurredAt: string;
  correlationId: string;
  idempotencyKey: string;
  providerMessageId?: string;
  reason?: string;
  state: "pending" | "appended" | "failed";
  createdAt: string;
  appendedEventId?: string;
  appendedAt?: string;
  failureReason?: string;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function communicationEventTypeForStatus(status: MessageDeliveryStatus): CommunicationLifecycleEventType | null {
  switch (status) {
    case "accepted": return "communication.provider_accepted";
    case "delivered": return "communication.delivered";
    case "bounced": return "communication.bounced";
    case "dropped": return "communication.dropped";
    case "complained": return "communication.complained";
    case "unsubscribed": return "communication.unsubscribed";
    case "suppressed": return "communication.suppressed";
    case "unknown": return "communication.outcome_unknown";
    case "failed": return "communication.failed";
    default: return null;
  }
}

/**
 * Builds the durable D-owned outbox fact that E/F later append canonically.
 * `test` recipient records from ad-hoc provider tests deliberately do not become
 * customer/lead lifecycle events. Test-mode acquisition customers can still be
 * represented as customer/lead subjects and remain isolated by dataMode.
 */
export function createCommunicationEventOutboxRecord(input: {
  record: MessageDeliveryRecord;
  eventType: CommunicationLifecycleEventType;
  source: CommunicationLifecycleEventSource;
  occurredAt: string;
  idempotencySuffix?: string;
  reason?: string;
}): CommunicationEventOutboxRecord | null {
  const { record } = input;
  if (record.intent.recipient.kind !== "lead" && record.intent.recipient.kind !== "customer") return null;
  const rawId = [
    record.intent.organizationId,
    record.intent.mode,
    record.intent.messageId,
    input.eventType,
    input.idempotencySuffix ?? "logical-outcome",
  ].join(":");
  const outboxId = hash(rawId);
  const correlationId = record.intent.trigger?.eventId ?? record.intent.messageId;
  return {
    schemaVersion: 1,
    outboxId,
    organizationId: record.intent.organizationId,
    eventType: input.eventType,
    source: input.source,
    dataMode: record.intent.mode,
    subjectKind: record.intent.recipient.kind,
    subjectId: record.intent.recipient.id,
    ...(record.intent.recipient.kind === "customer" ? { customerId: record.intent.recipient.id } : {}),
    messageId: record.intent.messageId,
    effectId: record.intent.effectId,
    purpose: record.intent.purpose,
    templateId: record.intent.templateId,
    templateVersion: record.intent.templateVersion,
    occurredAt: input.occurredAt,
    correlationId,
    idempotencyKey: outboxId,
    ...(record.providerMessageId ? { providerMessageId: record.providerMessageId } : {}),
    ...(input.reason ? { reason: input.reason.slice(0, 500) } : {}),
    state: "pending",
    createdAt: new Date().toISOString(),
  };
}
