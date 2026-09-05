import assert from "node:assert/strict";
import test from "node:test";
import type { EmailEligibilityInput } from "../../../shared/communications/contracts.js";
import { evaluateEmailEligibility } from "../../../shared/communications/eligibility.js";

function input(overrides: Partial<EmailEligibilityInput> = {}): EmailEligibilityInput {
  return {
    mode: "live",
    purpose: "marketing",
    templatePurpose: "marketing",
    recipientKind: "customer",
    recipientAvailable: true,
    sender: { organizationId: "org-a", provider: "sendgrid", status: "ready", fromAddress: "hello@example.test", fromName: "Example", authenticatedDomain: "example.test", verifiedAt: "2026-09-05T00:00:00.000Z" },
    consent: { decision: "granted", purpose: "marketing", source: "test", observedAt: "2026-09-05T00:00:00.000Z" },
    suppression: { suppressed: false, scope: "none", observedAt: "2026-09-05T00:00:00.000Z" },
    ...overrides,
  };
}

test("preview never sends", () => {
  const result = evaluateEmailEligibility(input({ mode: "preview" }));
  assert.equal(result.outcome, "hold");
  assert.equal(result.reason, "non-delivery-mode");
});

test("unknown permission is held rather than guessed eligible", () => {
  const result = evaluateEmailEligibility(input({ consent: { decision: "unknown", purpose: "marketing", source: "missing", observedAt: "2026-09-05T00:00:00.000Z" } }));
  assert.equal(result.outcome, "hold");
  assert.equal(result.reason, "consent-unknown");
});

test("withdrawal suppresses a queued promotional message", () => {
  const result = evaluateEmailEligibility(input({ consent: { decision: "denied", purpose: "marketing", source: "preference-center", observedAt: "2026-09-05T00:00:00.000Z" } }));
  assert.equal(result.outcome, "suppress");
  assert.equal(result.reason, "consent-withdrawn");
});

test("provider-account suppression outranks consent", () => {
  const result = evaluateEmailEligibility(input({ suppression: { suppressed: true, scope: "platform", reason: "complaint", observedAt: "2026-09-05T00:00:00.000Z" } }));
  assert.equal(result.outcome, "suppress");
  assert.equal(result.reason, "provider-suppressed");
});

test("unverified sender blocks dispatch", () => {
  const result = evaluateEmailEligibility(input({ sender: { organizationId: "org-a", provider: "sendgrid", status: "pending", reason: "domain authentication pending" } }));
  assert.equal(result.outcome, "hold");
  assert.equal(result.reason, "sender-not-ready");
});

test("controlled test mode requires an explicit allowlisted test recipient", () => {
  const result = evaluateEmailEligibility(input({ mode: "test", recipientKind: "test", testAllowlisted: false, consent: { decision: "not-required", purpose: "marketing", source: "controlled-test", observedAt: "2026-09-05T00:00:00.000Z" } }));
  assert.equal(result.outcome, "suppress");
  assert.equal(result.reason, "test-recipient-not-allowlisted");
});

test("template purpose cannot be relabeled", () => {
  const result = evaluateEmailEligibility(input({ purpose: "transactional", templatePurpose: "marketing", consent: { decision: "granted", purpose: "transactional", source: "test", observedAt: "2026-09-05T00:00:00.000Z" } }));
  assert.equal(result.outcome, "suppress");
  assert.equal(result.reason, "purpose-mismatch");
});
