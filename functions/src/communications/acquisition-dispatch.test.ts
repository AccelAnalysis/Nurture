import assert from "node:assert/strict";
import test from "node:test";
import type { EmailEligibilityResult } from "../../../shared/communications/contracts.js";
import {
  adaptCurrentConsent,
  mapAcquisitionPurpose,
  mapEligibilityForAcquisition,
  parseCommunicationTemplateVersionId,
  requireApprovedCommunicationTemplateId,
} from "./acquisition-dispatch.js";

test("Track E service/promotional purposes map to D transactional/marketing purposes", () => {
  assert.equal(mapAcquisitionPurpose("service"), "transactional");
  assert.equal(mapAcquisitionPurpose("promotional"), "marketing");
});

test("C consent withdrawal maps to denied and missing remains unknown", () => {
  assert.equal(adaptCurrentConsent({ purpose: "marketing", decision: "withdrawn", source: "preference-center", recordedAt: "2026-09-05T00:00:00.000Z" }, "promotional").decision, "denied");
  assert.equal(adaptCurrentConsent({ purpose: "marketing", decision: "unknown", source: "missing", recordedAt: "2026-09-05T00:00:00.000Z" }, "promotional").decision, "unknown");
});

test("C purpose mismatch cannot be interpreted as permission", () => {
  const consent = adaptCurrentConsent({ purpose: "service", decision: "granted", source: "account", recordedAt: "2026-09-05T00:00:00.000Z" }, "promotional");
  assert.equal(consent.decision, "unknown");
  assert.equal(consent.purpose, "marketing");
});

test("Track D immutable version IDs are strict positive decimal versions", () => {
  assert.equal(parseCommunicationTemplateVersionId("12"), 12);
  assert.throws(() => parseCommunicationTemplateVersionId("v12"), /decimal immutable published version/);
  assert.throws(() => parseCommunicationTemplateVersionId("0"), /decimal immutable published version/);
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
