import { describe, expect, it } from "vitest";
import type { CommunicationConsentFact } from "../customer/contracts";
import { consentStateFor, evaluateContactability, validQuietHours, validTimeZone } from "./customer-control";

function fact(decision: CommunicationConsentFact["decision"], recordedAt: string): CommunicationConsentFact {
  return {
    schemaVersion: 1,
    organizationId: "org-a",
    subjectKind: "customer",
    subjectId: "customer-a",
    dataMode: "test",
    channel: "email",
    purpose: "marketing",
    decision,
    source: "test",
    policyVersion: "v1",
    recordedAt,
    ...(decision === "withdrawn" ? { withdrawnAt: recordedAt } : {}),
  };
}

describe("Release 3 customer lifecycle control", () => {
  it("treats missing promotional consent as unknown and ineligible", () => {
    expect(consentStateFor([], "email", "marketing")).toBe("unknown");
    const result = evaluateContactability({ organizationId: "org-a", customerId: "customer-a", channel: "email", purpose: "promotional", consentFacts: [], channelReady: true, checkedAt: "2026-09-05T12:00:00.000Z" });
    expect(result.state).toBe("ineligible");
    expect(result.reasons).toContain("consent-missing");
  });

  it("uses the newest consent fact and withdrawal blocks future promotion", () => {
    const facts = [fact("granted", "2026-09-05T10:00:00.000Z"), fact("withdrawn", "2026-09-05T11:00:00.000Z")];
    expect(consentStateFor(facts, "email", "marketing")).toBe("withdrawn");
    expect(evaluateContactability({ organizationId: "org-a", customerId: "customer-a", channel: "email", purpose: "promotional", consentFacts: facts, channelReady: true, checkedAt: "2026-09-05T12:00:00.000Z" }).reasons).toContain("consent-withdrawn");
  });

  it("does not require marketing consent for service email, while provider suppression still wins", () => {
    const result = evaluateContactability({ organizationId: "org-a", customerId: "customer-a", channel: "email", purpose: "transactional", consentFacts: [], providerSuppressed: true, channelReady: true, checkedAt: "2026-09-05T12:00:00.000Z" });
    expect(result.state).toBe("ineligible");
    expect(result.reasons).toEqual(["provider-suppressed"]);
  });

  it("validates timezone and quiet-hour preferences", () => {
    expect(validTimeZone("America/New_York")).toBe(true);
    expect(validTimeZone("Mars/Olympus")).toBe(false);
    expect(validQuietHours({ startLocal: "21:00", endLocal: "08:00" })).toBe(true);
    expect(validQuietHours({ startLocal: "21:00", endLocal: "21:00" })).toBe(false);
  });
});
