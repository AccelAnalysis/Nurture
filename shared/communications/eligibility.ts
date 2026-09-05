import type { EmailEligibilityInput, EmailEligibilityResult } from "./contracts.js";

function result(outcome: EmailEligibilityResult["outcome"], reason: EmailEligibilityResult["reason"], explanation: string): EmailEligibilityResult {
  return { outcome, reason, explanation };
}

export function evaluateEmailEligibility(input: EmailEligibilityInput): EmailEligibilityResult {
  if (input.mode === "preview" || input.mode === "demo" || input.mode === "development") {
    return result("hold", "non-delivery-mode", `${input.mode} mode renders or records intent but never submits email to a provider.`);
  }
  if (input.purpose !== input.templatePurpose) {
    return result("suppress", "purpose-mismatch", "The requested purpose does not match the template's locked purpose.");
  }
  if (!input.recipientAvailable) {
    return result("hold", "recipient-unavailable", "No current eligible email recipient is available for this subject.");
  }
  if (input.sender.status !== "ready") {
    return result("hold", "sender-not-ready", input.sender.reason ?? "The organization sender is not verified and ready.");
  }
  if (input.suppression.suppressed) {
    return result("suppress", "provider-suppressed", input.suppression.reason ?? "The recipient is present on the configured provider suppression scope.");
  }

  if (input.mode === "test") {
    if (input.recipientKind !== "test") return result("suppress", "test-recipient-required", "Controlled provider tests may only target an explicit test recipient.");
    if (!input.testAllowlisted) return result("suppress", "test-recipient-not-allowlisted", "The address is not on the controlled test-send allowlist.");
    return result("eligible", "eligible", "Controlled test recipient, sender, and suppression checks passed.");
  }

  if (input.consent.decision === "denied") {
    return result("suppress", "consent-withdrawn", `Current ${input.purpose} email permission is denied or withdrawn.`);
  }
  if (input.consent.decision !== "granted") {
    return result("hold", "consent-unknown", `Current ${input.purpose} email permission is unknown; Nurture does not guess permission.`);
  }
  return result("eligible", "eligible", "Current sender, suppression, purpose, and consent checks passed.");
}
