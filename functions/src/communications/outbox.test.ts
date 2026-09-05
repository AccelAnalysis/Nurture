import assert from "node:assert/strict";
import test from "node:test";
import type { MessageDeliveryRecord } from "../../../shared/communications/contracts.js";
import { communicationEventTypeForStatus, createCommunicationEventOutboxRecord } from "./outbox.js";

function message(kind: "customer" | "lead" | "test" = "customer", mode: "live" | "test" = "live"): MessageDeliveryRecord {
  return {
    intent: {
      schemaVersion: 1,
      messageId: "message-1",
      organizationId: "org-a",
      mode,
      purpose: "marketing",
      recipient: { kind, id: kind === "customer" ? "customer-1" : kind === "lead" ? "lead-1" : "test-recipient-1" },
      recipientHash: "opaque-recipient-hash",
      templateId: "lead-follow-up",
      templateVersion: 2,
      variables: { "organization.name": "Harbor & Pine" },
      trigger: { eventId: "event-1", runId: "run-1" },
      effectId: "effect-1",
      createdAt: "2026-09-05T12:00:00.000Z",
    },
    status: "accepted",
    statusReason: "provider-accepted",
    attempts: [],
    provider: "sendgrid",
    providerMessageId: "provider-1",
    acceptedAt: "2026-09-05T12:00:01.000Z",
    updatedAt: "2026-09-05T12:00:01.000Z",
  };
}

test("D delivery statuses map only to F's registered communication lifecycle outcomes", () => {
  assert.equal(communicationEventTypeForStatus("accepted"), "communication.provider_accepted");
  assert.equal(communicationEventTypeForStatus("delivered"), "communication.delivered");
  assert.equal(communicationEventTypeForStatus("bounced"), "communication.bounced");
  assert.equal(communicationEventTypeForStatus("dropped"), "communication.dropped");
  assert.equal(communicationEventTypeForStatus("complained"), "communication.complained");
  assert.equal(communicationEventTypeForStatus("unsubscribed"), "communication.unsubscribed");
  assert.equal(communicationEventTypeForStatus("suppressed"), "communication.suppressed");
  assert.equal(communicationEventTypeForStatus("failed"), "communication.failed");
  assert.equal(communicationEventTypeForStatus("unknown"), "communication.outcome_unknown");
  assert.equal(communicationEventTypeForStatus("deferred"), null);
  assert.equal(communicationEventTypeForStatus("held"), null);
});

test("ad-hoc controlled test recipients do not manufacture customer lifecycle events", () => {
  assert.equal(createCommunicationEventOutboxRecord({
    record: message("test", "test"),
    eventType: "communication.provider_accepted",
    source: "trusted_server",
    occurredAt: "2026-09-05T12:00:01.000Z",
  }), null);
});

test("test-mode acquisition preserves the real customer subject while remaining mode isolated", () => {
  const outbox = createCommunicationEventOutboxRecord({
    record: message("customer", "test"),
    eventType: "communication.delivered",
    source: "provider_webhook",
    occurredAt: "2026-09-05T12:00:05.000Z",
    idempotencySuffix: "sendgrid-event-1",
  });
  assert.ok(outbox);
  assert.equal(outbox.dataMode, "test");
  assert.equal(outbox.subjectKind, "customer");
  assert.equal(outbox.customerId, "customer-1");
  assert.equal(outbox.eventType, "communication.delivered");
});

test("outbox identity is stable for duplicate provider callback evidence", () => {
  const input = {
    record: message("customer", "live"),
    eventType: "communication.delivered" as const,
    source: "provider_webhook" as const,
    occurredAt: "2026-09-05T12:00:05.000Z",
    idempotencySuffix: "sendgrid-event-1",
  };
  const first = createCommunicationEventOutboxRecord(input);
  const second = createCommunicationEventOutboxRecord(input);
  assert.ok(first && second);
  assert.equal(first.outboxId, second.outboxId);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
});

test("outbox payload contains opaque references rather than recipient email or rendered variables", () => {
  const outbox = createCommunicationEventOutboxRecord({
    record: message("lead", "live"),
    eventType: "communication.suppressed",
    source: "trusted_server",
    occurredAt: "2026-09-05T12:00:02.000Z",
    reason: "consent-withdrawn",
  });
  assert.ok(outbox);
  const serialized = JSON.stringify(outbox);
  assert.ok(!serialized.includes("Harbor & Pine"));
  assert.ok(!serialized.includes("recipientHash"));
  assert.ok(!serialized.includes("@"));
});
