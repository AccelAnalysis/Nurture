import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FeedbackScope, ReferralAttribution } from "../../../shared/feedback/contracts.js";
import { defaultReferralProgram, defaultSurvey } from "../../../shared/feedback/defaults.js";
import { FeedbackConfigurationService } from "./configuration.js";
import type {
  Collection,
  CustomerFeedbackFacts,
  FeedbackDependencies,
  FeedbackEventIntent,
  FeedbackPolicy,
  FeedbackStore,
  FeedbackTransaction,
  QualificationFacts,
  TrustedFeedbackActor,
} from "./ports.js";
import { ReferralService } from "./referrals.js";
import { ReferralRewardService, TestCreditProvider } from "./rewards.js";
import { SurveyService } from "./surveys.js";

const scope: FeedbackScope = { organizationId: "org-test", dataMode: "test" };

class MemoryFeedbackStore implements FeedbackStore {
  readonly data = new Map<Collection, Map<string, unknown>>();
  readonly events: FeedbackEventIntent[] = [];
  private bucket(collection: Collection) {
    let bucket = this.data.get(collection);
    if (!bucket) { bucket = new Map(); this.data.set(collection, bucket); }
    return bucket;
  }
  async transaction<T>(_scope: FeedbackScope, work: (tx: FeedbackTransaction) => Promise<T>): Promise<T> {
    const staged = new Map<Collection, Map<string, { value: object; create: boolean }>>();
    const events: FeedbackEventIntent[] = [];
    const stagedBucket = (collection: Collection) => {
      let bucket = staged.get(collection);
      if (!bucket) { bucket = new Map(); staged.set(collection, bucket); }
      return bucket;
    };
    const thisStore = this;
    const tx: FeedbackTransaction = {
      stage: write => write(),
      async get<V>(collection: Collection, key: string): Promise<V | null> {
        const local = staged.get(collection)?.get(key);
        if (local) return structuredClone(local.value) as V;
        const value = (thisStore.bucket(collection).get(key) ?? null) as V | null;
        return value === null ? null : structuredClone(value);
      },
      put: (collection, key, value) => stagedBucket(collection).set(key, { value: structuredClone(value), create: false }),
      create: (collection, key, value) => {
        assert.equal(this.bucket(collection).has(key) || stagedBucket(collection).has(key), false, `duplicate create ${collection}/${key}`);
        stagedBucket(collection).set(key, { value: structuredClone(value), create: true });
      },
      event: event => events.push(structuredClone(event)),
      audit: () => undefined,
      enqueue: () => undefined,
    };
    const result = await work(tx);
    for (const [collection, writes] of staged) for (const [key, write] of writes) {
      if (write.create) assert.equal(this.bucket(collection).has(key), false, `duplicate commit ${collection}/${key}`);
      this.bucket(collection).set(key, structuredClone(write.value));
    }
    this.events.push(...events);
    return result;
  }
  async page<T>(_scope: FeedbackScope, collection: Collection, query: { equal?: [string, string]; after?: string; limit: number }) {
    let rows = [...this.bucket(collection).entries()].sort(([a], [b]) => a.localeCompare(b));
    if (query.after) rows = rows.filter(([key]) => key > query.after!);
    if (query.equal) rows = rows.filter(([, value]) => (value as Record<string, unknown>)[query.equal![0]] === query.equal![1]);
    const selected = rows.slice(0, query.limit);
    return { rows: selected.map(([, value]) => structuredClone(value) as T), cursor: rows.length > query.limit ? selected.at(-1)![0] : null };
  }
  entries<T>(collection: Collection): T[] { return [...this.bucket(collection).values()].map(value => structuredClone(value) as T); }
  get<T>(collection: Collection, key: string): T | null { const value = this.bucket(collection).get(key); return value === undefined ? null : structuredClone(value) as T; }
}

function fixture() {
  const store = new MemoryFeedbackStore();
  let now = Date.parse("2026-09-05T12:00:00Z");
  let ids = 0;
  const customers = new Map<string, CustomerFeedbackFacts>([
    ["c1", { exists: true, identityId: "u1", feedbackAllowed: true, referralAllowed: true }],
    ["c2", { exists: true, identityId: "u2", feedbackAllowed: true, referralAllowed: true }],
  ]);
  const qualifications = new Map<string, QualificationFacts>();
  const policy: FeedbackPolicy = {
    release3AcceptedSha: "a".repeat(40), enabled: true, paused: false, outboundEnabled: false, rewardsEnabled: true,
    anonymousPolicyId: "privacy-v1", minimumAnonymousResponses: 5,
  };
  const deps: FeedbackDependencies = {
    store,
    now: () => now,
    randomId: () => `id-${++ids}`,
    digest: value => createHash("sha256").update(value).digest("hex"),
    tokenKeyId: "test-key",
    token: (keyId, purpose) => createHash("sha256").update(`${keyId}:${purpose}`).digest("base64url"),
    policy: async () => policy,
    customer: async (_tx, _scope, customerId) => customers.get(customerId) ?? { exists: false, identityId: null, feedbackAllowed: false, referralAllowed: false },
    admit: async () => ({ allowed: true, reason: "allowed" }),
    referralSignal: async () => true,
    qualification: async (_tx, _scope, evidenceId) => qualifications.get(evidenceId) ?? null,
    syncAutomation: async () => undefined,
  };
  const staff: TrustedFeedbackActor = { uid: "staff", capabilities: new Set(["surveys.view", "surveys.manage", "referrals.view", "referrals.manage"]) };
  const c1: TrustedFeedbackActor = { uid: "u1", customerId: "c1", capabilities: new Set() };
  const c2: TrustedFeedbackActor = { uid: "u2", customerId: "c2", capabilities: new Set() };
  return { store, deps, staff, c1, c2, qualifications, advance(ms: number) { now += ms; } };
}

describe("Release 4 feedback backend", () => {
  it("pins survey responses to the invitation version and processes retries once", async () => {
    const f = fixture(); const configuration = new FeedbackConfigurationService(f.deps); const surveys = new SurveyService(f.deps);
    const draft = await configuration.save(scope, f.staff, "survey", "survey-1", 0, defaultSurvey("nps"));
    const version = await configuration.publish(scope, f.staff, "survey", draft.id, draft.revision);
    const { invitationId } = await surveys.invite(scope, draft.id, "c1", "trigger-1");
    const invitation = f.store.get<{ keyId: string }>("surveyInvitations", invitationId)!;
    const token = f.deps.token(invitation.keyId, JSON.stringify(["survey-invitation", scope.organizationId, scope.dataMode, invitationId]));

    assert.deepEqual(await surveys.submit(scope, token, { recommendation: 10 }, f.c1), { state: "completed" });
    assert.deepEqual(await surveys.submit(scope, token, { recommendation: 0 }, f.c1), { state: "already-completed" });
    const responses = f.store.entries<{ versionId: string; answers: Record<string, number> }>("surveyResponses");
    assert.equal(responses.length, 1);
    assert.equal(responses[0].versionId, version.id);
    assert.equal(responses[0].answers.recommendation, 10);
    assert.equal(f.store.events.filter(event => event.type === "survey.completed").length, 1);
    assert.equal(f.store.events.filter(event => event.type === "survey.nps.promoter").length, 1);
  });

  it("rejects a self-referral while allowing a distinct customer attribution", async () => {
    const f = fixture(); const configuration = new FeedbackConfigurationService(f.deps); const referrals = new ReferralService(f.deps);
    const program = { ...defaultReferralProgram(), active: true, qualificationHoldHours: 0 };
    const draft = await configuration.save(scope, f.staff, "program", "primary-referral-program", 0, program);
    await configuration.publish(scope, f.staff, "program", draft.id, draft.revision);
    const { code } = await referrals.createCode(scope, f.c1, draft.id);

    const first = await referrals.capture(scope, code);
    assert.deepEqual(await referrals.bind(scope, f.c2, first.proof), { status: "registered" });

    const second = await referrals.capture(scope, code);
    assert.deepEqual(await referrals.bind(scope, f.c1, second.proof), { status: "rejected" });
    const rows = f.store.entries<ReferralAttribution>("referralAttributions");
    assert.equal(rows.filter(row => row.status === "registered").length, 1);
    assert.equal(rows.filter(row => row.status === "rejected" && row.reason === "self-referral").length, 1);
  });

  it("qualifies from trusted paid evidence, issues one test reward, and reverses it once", async () => {
    const f = fixture(); const configuration = new FeedbackConfigurationService(f.deps); const referrals = new ReferralService(f.deps);
    const program = { ...defaultReferralProgram(), active: true, qualificationHoldHours: 0 };
    const draft = await configuration.save(scope, f.staff, "program", "primary-referral-program", 0, program);
    await configuration.publish(scope, f.staff, "program", draft.id, draft.revision);
    const { code } = await referrals.createCode(scope, f.c1, draft.id);
    const captured = await referrals.capture(scope, code);
    await referrals.bind(scope, f.c2, captured.proof);
    const referral = f.store.entries<ReferralAttribution>("referralAttributions").find(row => row.referredCustomerId === "c2")!;

    f.qualifications.set("subscription-1", { evidenceId: "subscription-1", customerId: "c2", status: "paid", paidAt: f.deps.now(), current: true });
    assert.deepEqual(await referrals.qualify(scope, referral.id, "subscription-1"), { status: "qualified" });
    const qualified = f.store.get<ReferralAttribution>("referralAttributions", referral.id)!;
    assert.equal(qualified.rewardIds.length, 1);

    const rewards = new ReferralRewardService(f.deps, new TestCreditProvider(f.deps));
    const issued = await rewards.execute(scope, qualified.rewardIds[0]);
    assert.equal(issued.state, "issued");
    const issuedAgain = await rewards.execute(scope, qualified.rewardIds[0]);
    assert.equal(issuedAgain.state, "issued");
    assert.equal(f.store.entries("referralLedger").length, 1);

    f.qualifications.set("subscription-1", { evidenceId: "subscription-1", customerId: "c2", status: "refunded", paidAt: f.deps.now(), current: true });
    await referrals.requestReversal(scope, referral.id, "subscription-1");
    const reversed = await rewards.execute(scope, qualified.rewardIds[0], "reverse");
    assert.equal(reversed.state, "reversed");
    const reversedAgain = await rewards.execute(scope, qualified.rewardIds[0], "reverse");
    assert.equal(reversedAgain.state, "reversed");
    assert.equal(f.store.entries("referralLedger").length, 2);
    assert.equal(f.store.events.filter(event => event.type === "referral.reward_issued").length, 1);
    assert.equal(f.store.events.filter(event => event.type === "referral.reward_reversed").length, 1);
  });
});
