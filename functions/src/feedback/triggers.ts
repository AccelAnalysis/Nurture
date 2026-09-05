import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FeedbackError, type FeedbackScope } from "../../../shared/feedback/contracts.js";
import type { StoredSubscription } from "../billing/model.js";
import { createRelease4FeedbackComposition } from "./bootstrap.js";
import { key } from "./ports.js";
import { ReferralService } from "./referrals.js";

/**
 * Qualification observes the server-written subscription projection. A client
 * cannot create qualification by clicking a share link, posting a purchase flag,
 * or reaching a checkout-return page.
 */
export const r4QualifyReferralOnSubscription = onDocumentWritten(
  "organizations/{organizationId}/subscriptions/{subscriptionId}",
  async event => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const subscription = after.data() as Partial<StoredSubscription>;
    if (subscription.organizationId !== event.params.organizationId || typeof subscription.customerId !== "string") return;
    if (subscription.status !== "active" || Number(subscription.unitAmountMinor ?? 0) <= 0) return;

    const scope: FeedbackScope = { organizationId: event.params.organizationId, dataMode: "live" };
    const { deps } = createRelease4FeedbackComposition();
    const attribution = await deps.store.transaction(scope, tx => tx.get<{ referralId: string }>(
      "customerAttributions",
      key(deps, scope, "customer-attribution", subscription.customerId!),
    ));
    if (!attribution?.referralId) return;

    try {
      await new ReferralService(deps).qualify(scope, attribution.referralId, event.params.subscriptionId);
    } catch (error) {
      // Paused/disabled policy is a deliberate hold, not a provider retry storm.
      // An authorized operator can cause a trusted subscription reconciliation
      // after activation; all other unexpected failures retain function retry/error visibility.
      if (error instanceof FeedbackError && ["paused", "release-blocked", "ineligible", "policy-required"].includes(error.code)) return;
      throw error;
    }
  },
);
