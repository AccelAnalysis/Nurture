import assert from "node:assert/strict";
import test from "node:test";
import type { MessageDeliveryRecord } from "../../../shared/communications/contracts.js";
import { providerSubmissionClaimDisposition } from "./provider-claim.js";

function record(status: MessageDeliveryRecord["status"], outcome?: MessageDeliveryRecord["attempts"][number]["outcome"]): MessageDeliveryRecord {
  return {
    intent: {
      schemaVersion: 1,
      messageId: "message-1",
      organizationId: "org-a",
      mode: "test",
      purpose: "marketing",
      recipient: { kind: "test", id: "recipient-1" },
      recipientHash: "hash",
      templateId: "lead-follow-up",
      templateVersion: 1,
      variables: {},
      effectId: "effect-1",
      createdAt: "2026-09-05T13:00:00.000Z",
    },
    status,
    attempts: outcome ? [{ attempt: 1, startedAt: "2026-09-05T13:00:00.000Z", outcome }] : [],
    updatedAt: "2026-09-05T13:00:00.000Z",
  };
}

test("only planned or explicitly retryable failures may claim provider submission", () => {
  assert.equal(providerSubmissionClaimDisposition(record("planned")), "claimable");
  assert.equal(providerSubmissionClaimDisposition(record("failed", "retryable-failure")), "claimable");
  assert.equal(providerSubmissionClaimDisposition(record("failed", "terminal-failure")), "unavailable");
  assert.equal(providerSubmissionClaimDisposition(record("accepted", "accepted")), "unavailable");
});

test("an in-flight logical effect is never claimed by a concurrent invocation", () => {
  assert.equal(providerSubmissionClaimDisposition(record("submitting", "unknown")), "in-flight");
});
