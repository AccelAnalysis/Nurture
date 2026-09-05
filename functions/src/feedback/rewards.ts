import type { FeedbackScope, ReferralRewardEffect, ReferralAttribution, FeedbackConfiguration, ReferralProgramDraft, PublishedFeedbackVersion } from "../../../shared/feedback/contracts.js";
import { id, invariant } from "../../../shared/feedback/validation.js";
import { audit, event, key, mutationPolicy, requireCustomer, type FeedbackDependencies } from "./ports.js";

export type RewardProviderResult = { outcome: "succeeded"; reference: string } | { outcome: "not-applied" | "unknown" };
/** A provider may return not-applied ONLY when it can prove no effect happened. */
export interface RewardProvider {
  apply(scope: FeedbackScope, effect: ReferralRewardEffect, operation: "issue" | "reverse", idempotencyKey: string): Promise<RewardProviderResult>;
  lookup(scope: FeedbackScope, idempotencyKey: string): Promise<RewardProviderResult>;
}
type Operation = "issue" | "reverse";
export class ReferralRewardService {
  constructor(private readonly deps: FeedbackDependencies, private readonly provider: RewardProvider) {}
  private providerKey(effectId: string, operation: Operation) { return `${effectId}:${operation}`; }
  async execute(scope: FeedbackScope, effectId: string, operation: Operation = "issue"): Promise<ReferralRewardEffect> {
    id(effectId); invariant(operation === "issue" || operation === "reverse", "invalid-input");
    // Only a non-monetary test-credit adapter is implemented. No approved live economics are inferred.
    invariant(scope.dataMode === "test" || scope.dataMode === "development", "policy-required", "Live incentives remain disabled.");
    const claim = await this.deps.store.transaction(scope, async tx => {
      const policy = await mutationPolicy(this.deps, tx, scope, operation === "issue");
      if (operation === "issue") invariant(policy.rewardsEnabled, "paused", "Reward fulfillment is paused.");
      const effect = await tx.get<ReferralRewardEffect>("referralRewards", effectId); invariant(effect, "unavailable");
      const referral = await tx.get<ReferralAttribution>("referralAttributions", effect.referralId); invariant(referral?.evidenceId, "ineligible");
      const facts = await this.deps.qualification(tx, scope, referral.evidenceId);
      invariant(facts?.current && facts.customerId === referral.referredCustomerId, "ineligible");
      if (operation === "issue") {
        if (effect.reversalRequested || referral.status === "reversed" || facts.status === "refunded") {
          if (effect.state === "pending" || effect.state === "failed") {
            const cancelled = { ...effect, state: "cancelled" as const, reversalRequested: true, reason: "qualification-reversed" };
            tx.put("referralRewards", effectId, cancelled);
            const ledgerId = key(this.deps, scope, effectId, "cancelled");
            if (!(await tx.get("referralLedger", ledgerId))) tx.create("referralLedger", ledgerId, { effectId, kind: "cancelled", units: 0, occurredAt: this.deps.now() });
            return { effect: cancelled, dispatch: false };
          }
          return { effect, dispatch: false };
        }
        invariant(referral.status === "qualified" && facts.status === "paid", "ineligible");
        const referrer = await requireCustomer(this.deps, tx, scope, referral.referrerCustomerId);
        const referred = await requireCustomer(this.deps, tx, scope, referral.referredCustomerId!);
        invariant(referrer.referralAllowed && referred.referralAllowed && referrer.identityId && referred.identityId && referrer.identityId !== referred.identityId, "ineligible");
        const config = await tx.get<FeedbackConfiguration<ReferralProgramDraft>>("programConfigurations", effect.programId);
        invariant(config?.publishedVersionId && !config.archived, "ineligible");
        const current = await tx.get<PublishedFeedbackVersion<ReferralProgramDraft>>("programVersions", config.publishedVersionId);
        invariant(current?.value.active, "ineligible");
      } else invariant(effect.reversalRequested && referral.status === "reversed" && facts.status === "refunded", "ineligible");
      const running = operation === "issue" ? "executing" : "reversing";
      const unknown = operation === "issue" ? "unknown" : "reversal-unknown";
      if (effect.state === running) {
        if (effect.leaseUntil <= this.deps.now()) { const next = { ...effect, state: unknown as ReferralRewardEffect["state"], reason: "expired-lease-reconcile-before-retry" }; tx.put("referralRewards", effectId, next); return { effect: next, dispatch: false }; }
        return { effect, dispatch: false };
      }
      const allowedState = operation === "issue" ? effect.state === "pending" || effect.state === "failed" : effect.state === "issued";
      if (!allowedState) return { effect, dispatch: false };
      const attempts = operation === "issue" ? effect.attempt : effect.reversalAttempt;
      invariant(attempts < 3, "ineligible", "Retry limit reached; review is required.");
      const next: ReferralRewardEffect = { ...effect, state: running, leaseUntil: this.deps.now() + 300000,
        ...(operation === "issue" ? { attempt: attempts + 1 } : { reversalAttempt: attempts + 1 }) };
      tx.put("referralRewards", effectId, next);
      audit(tx, scope, `referral.reward_${operation}_claimed`, effectId, null, key(this.deps, scope, effectId, operation, String(attempts + 1), "claim"));
      return { effect: next, dispatch: true };
    });
    if (!claim.dispatch) return claim.effect;
    let result: RewardProviderResult;
    try { result = await this.provider.apply(scope, claim.effect, operation, this.providerKey(effectId, operation)); }
    catch { result = { outcome: "unknown" }; }
    return this.finish(scope, claim.effect, operation, result);
  }
  private async finish(scope: FeedbackScope, claim: ReferralRewardEffect, operation: Operation, result: RewardProviderResult): Promise<ReferralRewardEffect> {
    return this.deps.store.transaction(scope, async tx => {
      const current = await tx.get<ReferralRewardEffect>("referralRewards", claim.id); invariant(current, "unavailable");
      const activeStates = operation === "issue" ? ["executing", "unknown"] : ["reversing", "reversal-unknown"];
      const counter = operation === "issue" ? "attempt" : "reversalAttempt";
      if (current[counter] !== claim[counter] || !activeStates.includes(current.state)) return current;
      const successful = result.outcome === "succeeded" && typeof result.reference === "string" && result.reference.length > 0 && result.reference.length <= 256;
      const next: ReferralRewardEffect = { ...current, leaseUntil: 0, reason: successful ? null : result.outcome === "not-applied" ? "provider-confirmed-not-applied" : "provider-outcome-unknown",
        state: successful ? operation === "issue" ? "issued" : "reversed" : result.outcome === "not-applied" ? operation === "issue" ? "failed" : "issued" : operation === "issue" ? "unknown" : "reversal-unknown",
        providerReference: successful && result.outcome === "succeeded" && operation === "issue" ? result.reference : current.providerReference };
      tx.put("referralRewards", current.id, next);
      if (successful) {
        const ledgerId = key(this.deps, scope, current.id, operation);
        if (!(await tx.get("referralLedger", ledgerId))) {
          tx.create("referralLedger", ledgerId, { effectId: current.id, referralId: current.referralId, beneficiaryCustomerId: current.beneficiaryCustomerId,
            kind: operation, units: operation === "issue" ? current.benefit.units : -current.benefit.units, dataMode: scope.dataMode, occurredAt: this.deps.now() });
          // Release 3 owns any status communication triggered by these events.
          event(tx, operation === "issue" ? "referral.reward_issued" : "referral.reward_reversed", ledgerId,
            { referralId: current.referralId, programId: current.programId, effectId: current.id, rewardKind: current.benefit.kind }, current.beneficiaryCustomerId);
        }
      }
      audit(tx, scope, `referral.reward_${operation}_result`, current.id, null, key(this.deps, scope, current.id, operation, String(current[counter]), next.state), { status: next.state });
      return next;
    });
  }
  /** No blind retries: unknown/expired leases first query the SAME provider operation identity. */
  async reconcile(scope: FeedbackScope, effectId: string, operation: Operation = "issue"): Promise<ReferralRewardEffect> {
    id(effectId); invariant(operation === "issue" || operation === "reverse", "invalid-input");
    invariant(scope.dataMode === "test" || scope.dataMode === "development", "policy-required");
    const effect = await this.deps.store.transaction(scope, async tx => {
      const row = await tx.get<ReferralRewardEffect>("referralRewards", effectId); invariant(row, "unavailable");
      const running = operation === "issue" ? "executing" : "reversing";
      invariant(row.state === (operation === "issue" ? "unknown" : "reversal-unknown") || (row.state === running && row.leaseUntil <= this.deps.now()), "ineligible");
      return row;
    });
    let result: RewardProviderResult;
    try { result = await this.provider.lookup(scope, this.providerKey(effectId, operation)); } catch { result = { outcome: "unknown" }; }
    return this.finish(scope, effect, operation, result);
  }
}

/** Durable provider simulator, isolated by mode. It never modifies a balance or calls a payment provider. */
export class TestCreditProvider implements RewardProvider {
  constructor(private readonly deps: FeedbackDependencies) {}
  async apply(scope: FeedbackScope, effect: ReferralRewardEffect, operation: Operation, idempotencyKey: string): Promise<RewardProviderResult> {
    invariant(scope.dataMode === "test" || scope.dataMode === "development", "policy-required");
    const receiptId = key(this.deps, scope, "test-provider", idempotencyKey);
    return this.deps.store.transaction(scope, async tx => {
      const existing = await tx.get<{ reference: string }>("testCreditEffects", receiptId); if (existing) return { outcome: "succeeded" as const, reference: existing.reference };
      if (operation === "reverse") invariant(await tx.get("testCreditEffects", key(this.deps, scope, "test-provider", `${effect.id}:issue`)), "ineligible");
      const reference = `test-credit-${receiptId}`;
      tx.create("testCreditEffects", receiptId, { reference, effectId: effect.id, operation, units: effect.benefit.units });
      return { outcome: "succeeded" as const, reference };
    });
  }
  async lookup(scope: FeedbackScope, idempotencyKey: string): Promise<RewardProviderResult> {
    invariant(scope.dataMode === "test" || scope.dataMode === "development", "policy-required");
    return this.deps.store.transaction(scope, async tx => {
      const row = await tx.get<{ reference: string }>("testCreditEffects", key(this.deps, scope, "test-provider", idempotencyKey));
      return row ? { outcome: "succeeded" as const, reference: row.reference } : { outcome: "not-applied" as const };
    });
  }
}
