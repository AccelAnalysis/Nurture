import type { MessageDeliveryAttempt, MessageDeliveryRecord } from "../../../shared/communications/contracts.js";
import { db } from "../firebase.js";

export type ProviderSubmissionClaimDisposition = "claimable" | "in-flight" | "unavailable";

export function providerSubmissionClaimDisposition(record: MessageDeliveryRecord): ProviderSubmissionClaimDisposition {
  if (record.status === "submitting") return "in-flight";
  if (record.status === "planned") return "claimable";
  const last = record.attempts[record.attempts.length - 1];
  if (record.status === "failed" && last?.outcome === "retryable-failure") return "claimable";
  return "unavailable";
}

export type ProviderSubmissionClaimResult =
  | { status: "claimed"; record: MessageDeliveryRecord; attempt: number; startedAt: string }
  | { status: "in-flight" | "unavailable"; record: MessageDeliveryRecord };

/**
 * Atomically claims the one provider-submission right for a logical message.
 * Two workers may both reach eligibility/rendering, but only the transaction
 * that moves the durable record to `submitting` may cross the provider boundary.
 * A second invocation observes `submitting` and returns without changing it to
 * unknown or submitting the same logical effect again.
 */
export async function claimProviderSubmission(input: {
  organizationId: string;
  messageId: string;
  startedAt: string;
}): Promise<ProviderSubmissionClaimResult> {
  const ref = db.collection("organizations").doc(input.organizationId)
    .collection("communicationMessages").doc(input.messageId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("communication-message-not-found");
    const record = snapshot.data() as MessageDeliveryRecord;
    const disposition = providerSubmissionClaimDisposition(record);
    if (disposition !== "claimable") return { status: disposition, record };

    const attempt = record.attempts.length + 1;
    const pendingAttempt: MessageDeliveryAttempt = {
      attempt,
      startedAt: input.startedAt,
      outcome: "unknown",
    };
    const claimed: MessageDeliveryRecord = {
      ...record,
      status: "submitting",
      statusReason: `provider-attempt-${attempt}-started`,
      attempts: [...record.attempts, pendingAttempt],
      updatedAt: input.startedAt,
    };
    transaction.set(ref, claimed);
    return { status: "claimed", record: claimed, attempt, startedAt: input.startedAt };
  });
}
