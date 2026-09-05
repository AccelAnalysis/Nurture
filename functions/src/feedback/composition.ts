import { createHash } from "node:crypto";
import { type CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { type Transaction } from "firebase-admin/firestore";
import { validateLifecycleEventEnvelope } from "../../../shared/analytics/core.js";
import { sanitizeAuditMetadata, type AuditRecord } from "../../../shared/platform/audit.js";
import { isOrganizationRole, organizationCapabilitiesForRole } from "../../../shared/platform/authorization.js";
import { stableCustomerIdForIdentity } from "../../../shared/customer/identity.js";
import type { FeedbackScope } from "../../../shared/feedback/contracts.js";
import { id, invariant } from "../../../shared/feedback/validation.js";
import type { StoredSubscription } from "../billing/model.js";
import { db } from "../firebase.js";
import { feedbackCrypto } from "./crypto.js";
import { FirestoreFeedbackStore, type FeedbackAtomicEffects, type FeedbackAtomicHooks } from "./firestore-store.js";
import { key, type FeedbackDependencies, type FeedbackPolicy, type FeedbackTransaction, type TrustedFeedbackActor } from "./ports.js";
import type { FeedbackBoundary, FeedbackRequestContext } from "./callable.js";

function hash(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function organizationRef(organizationId: string) { return db.collection("organizations").doc(organizationId); }
function native(tx: FeedbackTransaction): Transaction {
  invariant(tx.native && typeof tx.native === "object", "unavailable", "A transactional backend is required.");
  return tx.native as Transaction;
}
function r4ControlRef(organizationId: string) { return organizationRef(organizationId).collection("release4FeedbackControl").doc("global"); }
function r3ControlRef(organizationId: string) { return organizationRef(organizationId).collection("release3RuntimeControl").doc("global"); }

function eventDocumentId(effectId: string) { return `r4_${hash(effectId)}`; }
function auditDocumentId(idempotencyKey: string) { return `r4_${hash(idempotencyKey)}`; }

class CanonicalFeedbackHooks implements FeedbackAtomicHooks {
  async prepare(scope: FeedbackScope, tx: Transaction, effects: FeedbackAtomicEffects): Promise<(() => void)[]> {
    // Feedback actions MUST be dispatched by the accepted R3 worker. A domain
    // service silently creating its own queue would violate the release contract.
    invariant(effects.actions.length === 0, "release-blocked", "Feedback actions must be composed through the Release 3 lifecycle worker.");
    const now = new Date().toISOString();
    const writes: (() => void)[] = [];

    for (const intent of effects.events) {
      const eventId = eventDocumentId(intent.id);
      const ref = organizationRef(scope.organizationId).collection("lifecycleEvents").doc(eventId);
      const existing = await tx.get(ref);
      if (existing.exists) continue;
      const event = validateLifecycleEventEnvelope({
        eventId,
        eventType: intent.type,
        schemaVersion: 1,
        organizationId: scope.organizationId,
        ...(intent.customerId ? { subjectId: intent.customerId, subjectKind: "customer", customerId: intent.customerId } : { subjectId: scope.organizationId, subjectKind: "organization" }),
        occurredAt: now,
        receivedAt: now,
        source: "trusted_server",
        correlationId: intent.id,
        idempotencyKey: intent.id,
        dataMode: scope.dataMode,
        payload: intent.payload,
      });
      writes.push(() => tx.create(ref, JSON.parse(JSON.stringify(event))));
    }

    for (const entry of effects.audits) {
      const idempotencyKey = entry.request.idempotencyKey ?? entry.request.correlationId;
      invariant(idempotencyKey, "invalid-input", "Audited feedback mutations require an idempotency key.");
      const auditId = auditDocumentId(idempotencyKey);
      const ref = organizationRef(scope.organizationId).collection("auditEvents").doc(auditId);
      const existing = await tx.get(ref);
      if (existing.exists) continue;
      const record: AuditRecord = {
        ...entry.request,
        id: auditId,
        actor: entry.actor,
        occurredAt: now,
        receivedAt: now,
        source: "cloud-function",
        ...(entry.request.metadata ? { metadata: sanitizeAuditMetadata(entry.request.metadata as Record<string, unknown>) } : {}),
      };
      writes.push(() => tx.create(ref, JSON.parse(JSON.stringify(record))));
    }
    return writes;
  }
}

export interface FeedbackCompositionOptions {
  /** Exact merged Release 3 commit. Keep null/absent until Release 3 actually lands. */
  release3AcceptedSha: string | null;
  tokenKeyId: string;
  tokenSecret(keyId: string): Uint8Array;
}

export function createFeedbackComposition(options: FeedbackCompositionOptions) {
  if (options.release3AcceptedSha !== null) invariant(/^[a-f0-9]{40}$/.test(options.release3AcceptedSha), "invalid-input");
  const crypto = feedbackCrypto(options.tokenKeyId, options.tokenSecret);
  const store = new FirestoreFeedbackStore(db, new CanonicalFeedbackHooks());
  let deps!: FeedbackDependencies;

  const policy = async (tx: FeedbackTransaction, scope: FeedbackScope): Promise<FeedbackPolicy> => {
    const transaction = native(tx);
    const [r4, r3] = await Promise.all([transaction.get(r4ControlRef(scope.organizationId)), transaction.get(r3ControlRef(scope.organizationId))]);
    const r4data = r4.data() ?? {}; const r3data = r3.data() ?? {};
    const r3Paused = !r3.exists || r3data.paused !== false;
    const minimumAnonymousResponses = Number(r4data.minimumAnonymousResponses ?? 5);
    return {
      release3AcceptedSha: options.release3AcceptedSha,
      enabled: r4.exists && r4data.enabled === true && !r3Paused,
      paused: r3Paused || r4data.paused !== false,
      outboundEnabled: !r3Paused && r4data.outboundEnabled === true,
      rewardsEnabled: scope.dataMode !== "live" && !r3Paused && r4data.rewardsEnabled === true,
      anonymousPolicyId: typeof r4data.anonymousPolicyId === "string" && r4data.anonymousPolicyId.length > 0 ? r4data.anonymousPolicyId : null,
      minimumAnonymousResponses: Number.isSafeInteger(minimumAnonymousResponses) && minimumAnonymousResponses >= 5 && minimumAnonymousResponses <= 100 ? minimumAnonymousResponses : 5,
    };
  };

  deps = {
    store,
    ...crypto,
    policy,
    async customer(tx, scope, customerId) {
      const transaction = native(tx);
      const snap = await transaction.get(organizationRef(scope.organizationId).collection("customers").doc(id(customerId)));
      if (!snap.exists) return { exists: false, identityId: null, feedbackAllowed: false, referralAllowed: false };
      const data = snap.data() ?? {};
      const correctMode = data.dataMode === undefined ? scope.dataMode === "live" : data.dataMode === scope.dataMode;
      const active = data.status === "active" && correctMode;
      return { exists: active, identityId: active && typeof data.identityId === "string" ? data.identityId : null, feedbackAllowed: active, referralAllowed: active };
    },
    async admit(tx, scope, customerId, treatment) {
      const transaction = native(tx);
      const control = await transaction.get(r3ControlRef(scope.organizationId));
      if (!control.exists || control.data()?.paused !== false) return { allowed: false, reason: "Release 3 lifecycle runtime is paused." };
      if (treatment === "service-recovery") return { allowed: true, reason: "service-recovery" };
      const now = new Date(); const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
      const runs = await transaction.get(organizationRef(scope.organizationId).collection("release3Runs")
        .where("customerId", "==", customerId).where("dataMode", "==", scope.dataMode).limit(100));
      const activeRuns = runs.docs.map(doc => doc.data()).filter(run => ["scheduled", "eligible", "executing"].includes(String(run.state)));
      const daily = runs.docs.map(doc => doc.data()).filter(run => typeof run.createdAt === "string" && run.createdAt >= dayStart && !["suppressed", "cancelled"].includes(String(run.state))).length;
      const dailyCap = Number(control.data()?.customerDailyCap ?? 3);
      if (daily >= (Number.isSafeInteger(dailyCap) && dailyCap > 0 ? dailyCap : 3)) return { allowed: false, reason: "Release 3 cross-cycle daily cap reached." };
      if (treatment === "referral" && activeRuns.some(run => ["critical-service", "service"].includes(String(run.definition?.conflict?.priority)))) {
        return { allowed: false, reason: "An active service treatment takes priority over referral promotion." };
      }
      return { allowed: true, reason: "allowed" };
    },
    async referralSignal(tx, scope, customerId, eventId) {
      const transaction = native(tx);
      const eventSnap = await transaction.get(organizationRef(scope.organizationId).collection("lifecycleEvents").doc(id(eventId)));
      if (!eventSnap.exists) return false;
      let event;
      try { event = validateLifecycleEventEnvelope(eventSnap.data()); } catch { return false; }
      if (event.organizationId !== scope.organizationId || event.dataMode !== scope.dataMode || event.customerId !== customerId) return false;
      if (event.eventType === "survey.nps.promoter" || event.eventType === "experience.milestone_reached" || event.eventType === "subscription.renewed") return true;
      if (event.eventType !== "survey.completed") return false;
      const treatment = await tx.get<{ customerId: string; positiveFeedback?: boolean; recoveryOpen?: boolean }>("feedbackTreatment", key(deps, scope, "treatment", customerId));
      return treatment?.customerId === customerId && treatment.positiveFeedback === true && treatment.recoveryOpen !== true;
    },
    async qualification(tx, scope, evidenceId) {
      const transaction = native(tx);
      const snap = await transaction.get(organizationRef(scope.organizationId).collection("subscriptions").doc(id(evidenceId)));
      if (!snap.exists) return null;
      const data = snap.data() as Partial<StoredSubscription>;
      if (data.organizationId !== scope.organizationId || typeof data.customerId !== "string" || typeof data.trustedAt !== "string") return null;
      const paid = data.status === "active" && Number(data.unitAmountMinor ?? 0) > 0;
      const paidAt = Date.parse(data.trustedAt);
      return { evidenceId, customerId: data.customerId, status: paid ? "paid" as const : "pending" as const, paidAt: Number.isFinite(paidAt) ? paidAt : 0, current: true };
    },
  };

  return { deps, store };
}

function parseOrganizationSelector(value: unknown) {
  invariant(typeof value === "string" && value.startsWith("org:"), "invalid-input");
  return id(value.slice(4));
}

export function createFeedbackBoundary(): FeedbackBoundary {
  return {
    async resolve(request: CallableRequest<unknown>, applicationKey: unknown): Promise<FeedbackRequestContext> {
      const organizationId = parseOrganizationSelector(applicationKey);
      const organization = await organizationRef(organizationId).get();
      if (!organization.exists || organization.data()?.status !== "active") throw new HttpsError("failed-precondition", "Feedback is unavailable.");
      if (!request.auth?.uid) return { scope: { organizationId, dataMode: "live" }, actor: null };

      const uid = request.auth.uid;
      const [membership, customer] = await Promise.all([
        organizationRef(organizationId).collection("memberships").doc(uid).get(),
        organizationRef(organizationId).collection("customers").doc(stableCustomerIdForIdentity(uid)).get(),
      ]);
      const membershipData = membership.data() ?? {};
      const role = membershipData.status === "active" && isOrganizationRole(membershipData.role) ? membershipData.role : null;
      const capabilities = role ? organizationCapabilitiesForRole(role) : organizationCapabilitiesForRole("member");
      const customerData = customer.data() ?? {};
      const customerId = customer.exists && customerData.status === "active" && customerData.identityId === uid && (customerData.dataMode === undefined || customerData.dataMode === "live") ? customer.id : undefined;
      const actor: TrustedFeedbackActor = { uid, capabilities, ...(customerId ? { customerId } : {}) };
      return { scope: { organizationId, dataMode: "live" }, actor };
    },
    async rateLimit(request, context) {
      const subject = request.auth?.uid ?? request.rawRequest.ip ?? "anonymous";
      const minute = Math.floor(Date.now() / 60_000);
      const ref = db.collection("_feedbackCallRateLimits").doc(hash(`${context.scope.organizationId}:${subject}:${minute}`));
      const limit = request.auth?.uid ? 120 : 30;
      const result = await db.runTransaction(async transaction => {
        const snap = await transaction.get(ref); const count = Number(snap.data()?.count ?? 0);
        if (count >= limit) return false;
        transaction.set(ref, { organizationId: context.scope.organizationId, subjectHash: hash(subject), minute, count: count + 1, expiresAt: new Date((minute + 2) * 60_000).toISOString() }, { merge: false });
        return true;
      });
      if (!result) throw new HttpsError("resource-exhausted", "Too many feedback requests. Try again later.");
    },
  };
}
