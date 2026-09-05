import type { CommunicationPurpose, EmailSuppressionSnapshot } from "../../../shared/communications/contracts.js";
import { db } from "../firebase.js";

function scopedSuppressionRef(organizationId: string, recipientHash: string, purpose: CommunicationPurpose) {
  return db.collection("organizations").doc(organizationId)
    .collection("communicationSuppressions").doc(`${recipientHash}~${purpose}`);
}

export async function getOrganizationEmailSuppression(
  organizationId: string,
  recipientHash: string,
  purpose: CommunicationPurpose,
): Promise<EmailSuppressionSnapshot> {
  const snapshot = await scopedSuppressionRef(organizationId, recipientHash, purpose).get();
  if (!snapshot.exists) return { suppressed: false, scope: "none", observedAt: new Date().toISOString() };
  const data = snapshot.data() ?? {};
  return {
    suppressed: true,
    scope: "organization",
    reason: typeof data.reason === "string" ? data.reason : "Organization communication suppression is active.",
    observedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  };
}

export async function setOrganizationEmailSuppression(input: {
  organizationId: string;
  recipientHash: string;
  purpose: CommunicationPurpose;
  reason: string;
  observedAt?: string;
}) {
  const updatedAt = input.observedAt ?? new Date().toISOString();
  await scopedSuppressionRef(input.organizationId, input.recipientHash, input.purpose).set({
    scope: "organization",
    purpose: input.purpose,
    reason: input.reason,
    updatedAt,
  }, { merge: true });
}

export function strongestSuppression(
  provider: EmailSuppressionSnapshot,
  organization: EmailSuppressionSnapshot,
): EmailSuppressionSnapshot {
  if (provider.suppressed) return provider;
  return organization.suppressed ? organization : provider;
}
