import type { CommunicationPurpose, EmailSuppressionSnapshot } from "../../../shared/communications/contracts.js";
import { db } from "../firebase.js";
import { getEmailSuppression } from "./store.js";

function organizationSuppressionRef(organizationId: string, recipientHash: string) {
  return db.collection("organizations").doc(organizationId)
    .collection("communicationSuppressions").doc(recipientHash);
}

/**
 * Provider account suppressions remain platform-wide. Organization marketing
 * suppressions (for example SendGrid ASM group unsubscribe) are intentionally
 * narrower and must not block another tenant or transactional/service mail.
 */
export async function getEffectiveEmailSuppression(input: {
  organizationId: string;
  recipientHash: string;
  purpose: CommunicationPurpose;
}): Promise<EmailSuppressionSnapshot> {
  const global = await getEmailSuppression(input.recipientHash);
  if (global.suppressed || input.purpose !== "marketing") return global;

  const snapshot = await organizationSuppressionRef(input.organizationId, input.recipientHash).get();
  if (!snapshot.exists) return global;
  const data = snapshot.data() as { reason?: string; observedAt?: string; purpose?: CommunicationPurpose };
  if (data.purpose !== "marketing") return global;
  return {
    suppressed: true,
    scope: "organization",
    reason: data.reason ?? "Recipient unsubscribed from this organization's marketing group.",
    observedAt: data.observedAt ?? new Date().toISOString(),
  };
}

export async function recordOrganizationMarketingSuppression(input: {
  organizationId: string;
  recipientHash: string;
  reason: string;
  observedAt: string;
  providerEventId: string;
}) {
  await organizationSuppressionRef(input.organizationId, input.recipientHash).set({
    scope: "organization",
    purpose: "marketing",
    provider: "sendgrid",
    reason: input.reason,
    observedAt: input.observedAt,
    providerEventId: input.providerEventId,
  }, { merge: true });
}
