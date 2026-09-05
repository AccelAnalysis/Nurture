import type { FeedbackScope, FeedbackConfiguration, PublishedFeedbackVersion, ReferralProgramDraft, ReferralCodeRecord, ReferralAttribution, ReferralRewardEffect, ParticipantReferralView } from "../../../shared/feedback/contracts.js";
import { id, invariant } from "../../../shared/feedback/validation.js";
import { admit, audit, customerActor, event, key, mutationPolicy, requireCustomer, type FeedbackDependencies, type FeedbackTransaction, type TrustedFeedbackActor } from "./ports.js";

interface ReferralInvitation { id: string; programId: string; versionId: string; customerId: string; expiresAt: number }
export class ReferralService {
  constructor(private readonly deps: FeedbackDependencies) {}
  private async program(tx: FeedbackTransaction, programId: string, pinnedVersionId?: string) {
    const config = await tx.get<FeedbackConfiguration<ReferralProgramDraft>>("programConfigurations", id(programId));
    invariant(config && !config.archived && config.publishedVersionId, "ineligible");
    const current = await tx.get<PublishedFeedbackVersion<ReferralProgramDraft>>("programVersions", config.publishedVersionId);
    invariant(current?.value.active, "ineligible", "Referral program is inactive.");
    const version = pinnedVersionId ? await tx.get<PublishedFeedbackVersion<ReferralProgramDraft>>("programVersions", pinnedVersionId) : current;
    invariant(version?.entityId === programId && version.value.active, "ineligible"); return version;
  }
  private rawCode(scope: FeedbackScope, record: ReferralCodeRecord): string {
    return this.deps.token(record.keyId, JSON.stringify(["referral-code", scope.organizationId, scope.dataMode, record.programId, record.versionId, record.customerId, record.generationId]));
  }
  async createCode(scope: FeedbackScope, actor: TrustedFeedbackActor, programId: string): Promise<{ code: string; terms: string }> {
    const customerId = customerActor(actor); id(programId); const generationId = this.deps.randomId();
    return this.deps.store.transaction(scope, async tx => {
      await mutationPolicy(this.deps, tx, scope, true);
      const facts = await requireCustomer(this.deps, tx, scope, customerId); invariant(facts.identityId === actor.uid && facts.referralAllowed, "ineligible");
      const version = await this.program(tx, programId);
      const indexId = key(this.deps, scope, "own-code", programId, customerId);
      const existing = await tx.get<ReferralCodeRecord>("customerReferralCodes", indexId);
      if (existing?.versionId === version.id && existing.expiresAt > this.deps.now()) return { code: this.rawCode(scope, existing), terms: version.value.terms };
      const record: ReferralCodeRecord = { programId, versionId: version.id, customerId, keyId: this.deps.tokenKeyId, digest: "", generationId, expiresAt: this.deps.now() + version.value.windowDays * 86400000 };
      const code = this.rawCode(scope, record); record.digest = this.deps.digest(code);
      tx.create("referralCodes", record.digest, record); tx.put("customerReferralCodes", indexId, record);
      audit(tx, scope, "referral.code_created", programId, actor, key(this.deps, scope, record.digest, "code"));
      return { code, terms: version.value.terms };
    });
  }
  /** Opaque receipt is the sole anonymous attribution continuation. It contains no personal data. */
  async capture(scope: FeedbackScope, code: string, previousProof?: string): Promise<{ proof: string }> {
    invariant(typeof code === "string" && /^[A-Za-z0-9_-]{43}$/.test(code), "unavailable");
    if (previousProof !== undefined) invariant(/^[A-Za-z0-9_-]{43}$/.test(previousProof), "unavailable");
    const newId = this.deps.randomId();
    const newProof = this.deps.token(this.deps.tokenKeyId, JSON.stringify(["referral-proof", scope.organizationId, scope.dataMode, newId]));
    return this.deps.store.transaction(scope, async tx => {
      await mutationPolicy(this.deps, tx, scope, true);
      const record = await tx.get<ReferralCodeRecord>("referralCodes", this.deps.digest(code)); invariant(record && record.expiresAt > this.deps.now(), "unavailable");
      const version = await this.program(tx, record.programId, record.versionId);
      const referrer = await requireCustomer(this.deps, tx, scope, record.customerId); invariant(referrer.referralAllowed, "ineligible");
      const oldIndex = previousProof ? await tx.get<{ referralId: string }>("referralProofs", this.deps.digest(previousProof)) : null;
      const old = oldIndex ? await tx.get<ReferralAttribution>("referralAttributions", oldIndex.referralId) : null;
      if (previousProof) invariant(old && old.proofDigest === this.deps.digest(previousProof), "unavailable");
      if (old) {
        const oldVersion = await tx.get<PublishedFeedbackVersion<ReferralProgramDraft>>("programVersions", old.versionId); invariant(oldVersion, "unavailable");
        // The policy accepted at the first capture controls replacement, not a newly clicked program's policy.
        if (old.status !== "attributed" || old.referredCustomerId || oldVersion.value.attribution === "first-touch") return { proof: previousProof! };
        invariant(old.expiresAt > this.deps.now(), "unavailable");
        if (old.programId === record.programId && old.versionId === record.versionId && old.referrerCustomerId === record.customerId) return { proof: previousProof! };
      }
      const referralId = old?.id ?? newId; const proof = previousProof ?? newProof; const now = this.deps.now();
      const referral: ReferralAttribution = { id: referralId, programId: record.programId, versionId: version.id,
        referrerCustomerId: record.customerId, referredCustomerId: null, proofDigest: this.deps.digest(proof), createdAt: old?.createdAt ?? now,
        // A repeated click cannot extend the original attribution window.
        expiresAt: old?.expiresAt ?? now + version.value.windowDays * 86400000,
        status: "attributed", evidenceId: null, reason: null, rewardIds: [] };
      if (old) tx.put("referralAttributions", referralId, referral); else {
        tx.create("referralAttributions", referralId, referral); tx.create("referralProofs", referral.proofDigest, { referralId });
      }
      event(tx, "referral.created", key(this.deps, scope, referralId, record.digest, "attributed"), { referralId, programId: record.programId }, record.customerId);
      audit(tx, scope, "referral.attributed", referralId, null, key(this.deps, scope, referralId, record.digest, "audit"));
      return { proof };
    });
  }
  async bind(scope: FeedbackScope, actor: TrustedFeedbackActor, proof: string): Promise<{ status: ReferralAttribution["status"] }> {
    const customerId = customerActor(actor); invariant(typeof proof === "string" && /^[A-Za-z0-9_-]{43}$/.test(proof), "unavailable");
    return this.deps.store.transaction(scope, async tx => {
      await mutationPolicy(this.deps, tx, scope, true);
      const index = await tx.get<{ referralId: string }>("referralProofs", this.deps.digest(proof));
      const referral = index ? await tx.get<ReferralAttribution>("referralAttributions", index.referralId) : null; invariant(referral, "unavailable");
      if (referral.referredCustomerId) {
        const currentCustomer = await requireCustomer(this.deps, tx, scope, customerId);
        invariant(referral.referredCustomerId === customerId && currentCustomer.identityId === actor.uid, "permission-denied");
        return { status: referral.status };
      }
      invariant(referral.status === "attributed" && referral.expiresAt > this.deps.now(), "ineligible");
      await this.program(tx, referral.programId, referral.versionId);
      const referred = await requireCustomer(this.deps, tx, scope, customerId);
      const referrer = await requireCustomer(this.deps, tx, scope, referral.referrerCustomerId);
      invariant(referred.identityId === actor.uid && referred.identityId, "permission-denied");
      const uniqueId = key(this.deps, scope, "customer-attribution", customerId);
      const claimed = await tx.get<{ referralId: string }>("customerAttributions", uniqueId);
      const self = customerId === referral.referrerCustomerId || referred.identityId === referrer.identityId;
      const duplicate = claimed && claimed.referralId !== referral.id;
      const next: ReferralAttribution = { ...referral, referredCustomerId: customerId, status: self || duplicate ? "rejected" : "registered", reason: self ? "self-referral" : duplicate ? "duplicate-attribution" : null };
      tx.put("referralAttributions", referral.id, next);
      if (!self && !duplicate) tx.put("customerAttributions", uniqueId, { referralId: referral.id });
      event(tx, next.status === "rejected" ? "referral.rejected" : "referral.registered", key(this.deps, scope, referral.id, "bind"), { referralId: referral.id, programId: referral.programId, status: next.status }, referral.referrerCustomerId);
      audit(tx, scope, "referral.identity_bound", referral.id, actor, key(this.deps, scope, referral.id, "bind-audit"), { status: next.status, reason: next.reason });
      return { status: next.status };
    });
  }
  /** Trusted provider/customer evidence only; no endpoint accepts paid=true or a qualification status. */
  async qualify(scope: FeedbackScope, referralId: string, evidenceId: string): Promise<{ status: ReferralAttribution["status"] }> {
    id(referralId); id(evidenceId);
    return this.deps.store.transaction(scope, async tx => {
      await mutationPolicy(this.deps, tx, scope, true);
      const referral = await tx.get<ReferralAttribution>("referralAttributions", referralId); invariant(referral?.referredCustomerId, "ineligible");
      if (["qualified", "rejected", "reversed"].includes(referral.status)) return { status: referral.status };
      const version = await this.program(tx, referral.programId, referral.versionId);
      const facts = await this.deps.qualification(tx, scope, evidenceId);
      invariant(facts?.current && facts.evidenceId === evidenceId && facts.customerId === referral.referredCustomerId, "ineligible", "Current trusted qualification evidence is required.");
      const referrer = await requireCustomer(this.deps, tx, scope, referral.referrerCustomerId);
      const referred = await requireCustomer(this.deps, tx, scope, referral.referredCustomerId);
      const now = this.deps.now(); let reason: string | null = null;
      if (!referrer.referralAllowed || !referred.referralAllowed) reason = "customer-ineligible";
      else if (!referrer.identityId || !referred.identityId || referrer.identityId === referred.identityId) reason = "self-referral";
      else if (facts.status === "refunded") reason = "refunded-before-qualification";
      else if (facts.status === "paid" && (facts.paidAt > referral.expiresAt || facts.paidAt < referral.createdAt)) reason = "outside-attribution-window";
      const limitId = key(this.deps, scope, "qualified-limit", referral.programId, referral.referrerCustomerId);
      const limit = await tx.get<{ count: number }>("referralLimits", limitId);
      if ((limit?.count ?? 0) >= version.value.maxQualifiedPerReferrer) reason = "program-limit";
      const pending = facts.status !== "paid" || now < facts.paidAt + version.value.qualificationHoldHours * 3600000;
      const status: ReferralAttribution["status"] = reason ? "rejected" : pending ? "pending-qualification" : "qualified";
      const rewards: ReferralRewardEffect[] = status === "qualified" ? version.value.benefits.map(benefit => ({
        id: key(this.deps, scope, referral.id, version.id, benefit.beneficiary, "reward"), referralId: referral.id, programId: referral.programId, versionId: version.id,
        beneficiaryCustomerId: benefit.beneficiary === "referrer" ? referral.referrerCustomerId : referral.referredCustomerId!, benefit,
        state: "pending", attempt: 0, reversalAttempt: 0, leaseUntil: 0, providerReference: null, reversalRequested: false, reason: null,
      })) : [];
      tx.put("referralAttributions", referral.id, { ...referral, status, evidenceId, reason, rewardIds: rewards.map(r => r.id) });
      for (const reward of rewards) tx.create("referralRewards", reward.id, reward);
      if (status === "qualified") tx.put("referralLimits", limitId, { count: (limit?.count ?? 0) + 1 });
      if (status === "qualified" || status === "rejected") event(tx, status === "qualified" ? "referral.qualified" : "referral.rejected", key(this.deps, scope, referral.id, status), { referralId, programId: referral.programId, status }, referral.referrerCustomerId);
      audit(tx, scope, "referral.qualification_checked", referral.id, null, key(this.deps, scope, referral.id, evidenceId, status), { status, reason });
      return { status };
    });
  }
  async requestReversal(scope: FeedbackScope, referralId: string, evidenceId: string): Promise<void> {
    id(referralId); id(evidenceId);
    await this.deps.store.transaction(scope, async tx => {
      await mutationPolicy(this.deps, tx, scope);
      const referral = await tx.get<ReferralAttribution>("referralAttributions", referralId);
      invariant(referral && referral.evidenceId === evidenceId && referral.referredCustomerId, "ineligible");
      const facts = await this.deps.qualification(tx, scope, evidenceId);
      invariant(facts?.current && facts.customerId === referral.referredCustomerId && facts.status === "refunded", "ineligible");
      if (referral.status === "reversed") return;
      invariant(referral.status === "qualified", "ineligible");
      const rewards = await Promise.all(referral.rewardIds.map(rewardId => tx.get<ReferralRewardEffect>("referralRewards", rewardId)));
      for (const reward of rewards) {
        invariant(reward, "unavailable");
        const cancelled = reward.state === "pending" || reward.state === "failed";
        tx.put("referralRewards", reward.id, { ...reward, reversalRequested: true, ...(cancelled ? { state: "cancelled" as const } : {}), reason: "qualification-reversed" });
        if (cancelled) tx.create("referralLedger", key(this.deps, scope, reward.id, "cancelled"), { effectId: reward.id, kind: "cancelled", units: 0, occurredAt: this.deps.now() });
      }
      tx.put("referralAttributions", referralId, { ...referral, status: "reversed", reason: "qualification-reversed" });
      audit(tx, scope, "referral.qualification_reversed", referralId, null, key(this.deps, scope, referralId, "reverse"));
    });
  }
  async invite(scope: FeedbackScope, programId: string, customerId: string, sourceEventId: string): Promise<{ invitationId: string }> {
    id(programId); id(customerId); id(sourceEventId);
    const invitationId = key(this.deps, scope, "referral-invite", programId, customerId, sourceEventId);
    return this.deps.store.transaction(scope, async tx => {
      await mutationPolicy(this.deps, tx, scope, true);
      const existing = await tx.get<ReferralInvitation>("referralInvitations", invitationId); if (existing) return { invitationId };
      const version = await this.program(tx, programId);
      const customer = await requireCustomer(this.deps, tx, scope, customerId); invariant(customer.referralAllowed, "ineligible");
      const treatment = await tx.get<{ recoveryOpen: boolean; positiveFeedback: boolean }>("feedbackTreatment", key(this.deps, scope, "treatment", customerId));
      invariant(!treatment?.recoveryOpen, "ineligible", "Service recovery suppresses referral promotion.");
      invariant(await this.deps.referralSignal(tx, scope, customerId, sourceEventId), "ineligible", "A trusted eligible feedback, milestone or renewal signal is required.");
      const capId = key(this.deps, scope, "referral-cap", customerId);
      const cap = await tx.get<{ nextAt: number }>("feedbackCooldowns", capId); const now = this.deps.now();
      invariant(!cap || cap.nextAt <= now, "ineligible", "Referral cooldown is active.");
      await admit(this.deps, tx, scope, customerId, "referral");
      tx.create("referralInvitations", invitationId, { id: invitationId, programId, versionId: version.id, customerId, expiresAt: now + version.value.invitationExpiryHours * 3600000 });
      tx.put("feedbackCooldowns", capId, { nextAt: now + version.value.cooldownHours * 3600000 });
      tx.enqueue({ kind: "referral-invitation", effectId: key(this.deps, scope, invitationId, "dispatch"), customerId, referenceId: invitationId });
      event(tx, "referral.invitation_created", key(this.deps, scope, invitationId, "created"), { programId, versionId: version.id }, customerId);
      return { invitationId };
    });
  }
  async prepareDelivery(scope: FeedbackScope, invitationId: string): Promise<{ customerId: string; programId: string }> {
    id(invitationId);
    return this.deps.store.transaction(scope, async tx => {
      const policy = await mutationPolicy(this.deps, tx, scope, true); invariant(policy.outboundEnabled, "paused");
      const invite = await tx.get<ReferralInvitation>("referralInvitations", invitationId); invariant(invite && invite.expiresAt > this.deps.now(), "ineligible");
      await this.program(tx, invite.programId, invite.versionId);
      const customer = await requireCustomer(this.deps, tx, scope, invite.customerId); invariant(customer.referralAllowed, "ineligible");
      const treatment = await tx.get<{ recoveryOpen: boolean }>("feedbackTreatment", key(this.deps, scope, "treatment", invite.customerId));
      invariant(!treatment?.recoveryOpen, "ineligible");
      return { customerId: invite.customerId, programId: invite.programId };
    });
  }
  async own(scope: FeedbackScope, actor: TrustedFeedbackActor, programId: string, after?: string): Promise<ParticipantReferralView> {
    const customerId = customerActor(actor); id(programId);
    const state = await this.deps.store.transaction(scope, async tx => {
      const facts = await requireCustomer(this.deps, tx, scope, customerId); invariant(facts.identityId === actor.uid, "permission-denied");
      const policy = await this.deps.policy(tx, scope);
      const config = await tx.get<FeedbackConfiguration<ReferralProgramDraft>>("programConfigurations", programId); invariant(config?.publishedVersionId, "unavailable");
      const version = await tx.get<PublishedFeedbackVersion<ReferralProgramDraft>>("programVersions", config.publishedVersionId); invariant(version, "unavailable");
      const code = await tx.get<ReferralCodeRecord>("customerReferralCodes", key(this.deps, scope, "own-code", programId, customerId));
      const shareAvailable = policy.enabled && !policy.paused && !config.archived && version.value.active && facts.referralAllowed;
      const codeVersion = code ? await tx.get<PublishedFeedbackVersion<ReferralProgramDraft>>("programVersions", code.versionId) : null;
      return { programId, title: version.value.title, terms: codeVersion?.value.terms ?? version.value.terms,
        code: shareAvailable && code && code.expiresAt > this.deps.now() ? this.rawCode(scope, code) : null, shareAvailable, reason: shareAvailable ? null : "Sharing is currently unavailable." };
    });
    const page = await this.deps.store.page<ReferralAttribution>(scope, "referralAttributions", { equal: ["referrerCustomerId", customerId], limit: 50, after });
    const progress: ParticipantReferralView["progress"] = [];
    for (const referral of page.rows.filter(row => row.programId === programId)) {
      const rewards = await this.deps.store.transaction(scope, tx => Promise.all(referral.rewardIds.map(rewardId => tx.get<ReferralRewardEffect>("referralRewards", rewardId))));
      progress.push({ referralId: referral.id, status: referral.status, rewards: rewards.filter((r): r is ReferralRewardEffect => !!r && r.beneficiaryCustomerId === customerId).map(r => ({ state: r.state, units: r.benefit.units, kind: r.benefit.kind })) });
    }
    return { ...state, progress, cursor: page.cursor };
  }
}
