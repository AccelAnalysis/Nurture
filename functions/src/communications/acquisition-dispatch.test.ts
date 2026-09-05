import assert from "node:assert/strict";
import test from "node:test";
import type { EmailEligibilityResult } from "../../../shared/communications/contracts.js";
import {
  adaptCurrentConsent,
  mapEligibilityForAcquisition,
  requireApprovedCommunicationTemplateId,
} from "./acquisition-dispatch.js";

test("C service consent maps to D/E transactional purpose", () => {
  const consent = adaptCurrentConsent({ purpose: "service", decision: "granted", source: "account", recordedAt: "2026-09-05T00:00:00.000Z" }, "transactional");
  assert.equal(consent.decision, "granted");
  assert.equal(consent.purpose, "transactional");
});

test("C consent withdrawal maps to denied and missing remains unknown", () => {
  assert.equal(adaptCurrentConsent({ purpose: "marketing", decision: "withdrawn", source: "preference-center", recordedAt: "2026-09-05T00:00:00.000Z" }, "marketing").decision, "denied");
  assert.equal(adaptCurrentConsent({ purpose: "marketing", decision: "unknown", source: "missing", recordedAt: "2026-09-05T00:00:00.000Z" }, "marketing").decision, "unknown");
});

test("C purpose mismatch cannot be interpreted as permission", () => {
  const consent = adaptCurrentConsent({ purpose: "service", decision: "granted", source: "account", recordedAt: "2026-09-05T00:00:00.000Z" }, "marketing");
  assert.equal(consent.decision, "unknown");
  assert.equal(consent.purpose, "marketing");
});

test("only the approved Release 2 template catalog crosses the E-to-D dispatch seam", () => {
  assert.equal(requireApprovedCommunicationTemplateId("registration-welcome"), "registration-welcome");
  assert.throws(() => requireApprovedCommunicationTemplateId("arbitrary-html-template"), /approved Release 2/);
});

test("D eligibility reasons map to E operational reason classes", () => {
  const cases: Array<[EmailEligibilityResult, string, string]> = [
    [{ outcome: "hold", reason: "sender-not-ready", explanation: "sender" }, "hold", "sender-not-ready"],
    [{ outcome: "suppress", reason: "provider-suppressed", explanation: "suppression" }, "suppress", "suppression"],
    [{ outcome: "hold", reason: "consent-unknown", explanation: "consent" }, "hold", "consent"],
    [{ outcome: "suppress", reason: "test-recipient-not-allowlisted", explanation: "test" }, "suppress", "test-recipient-not-allowlisted"],
  ];
  for (const [input, status, code] of cases) {
    const mapped = mapEligibilityForAcquisition(input, "2026-09-05T00:00:00.000Z");
    assert.equal(mapped.status, status);
    assert.equal(mapped.status === "eligible" ? undefined : mapped.code, code);
  }
});
