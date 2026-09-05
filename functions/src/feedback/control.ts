import { createHash } from "node:crypto";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { sanitizeAuditMetadata, type AuditRecord } from "../../../shared/platform/audit.js";
import { assertOrganizationCapability } from "../billing/store.js";
import { db } from "../firebase.js";

interface FeedbackRuntimeControl {
  enabled: boolean;
  paused: boolean;
  outboundEnabled: boolean;
  rewardsEnabled: boolean;
  anonymousPolicyId: string | null;
  minimumAnonymousResponses: number;
  policyVersion: number;
  updatedAt?: string;
  updatedBy?: string;
}

const DEFAULT_CONTROL: FeedbackRuntimeControl = {
  enabled: false,
  paused: true,
  outboundEnabled: false,
  rewardsEnabled: false,
  anonymousPolicyId: null,
  minimumAnonymousResponses: 5,
  policyVersion: 1,
};

function organizationId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpsError("invalid-argument", "organizationId is invalid.");
  return value;
}
function actorUid(request: CallableRequest<unknown>) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  return request.auth.uid;
}
function controlRef(id: string) { return db.collection("organizations").doc(id).collection("release4FeedbackControl").doc("global"); }
function r3ControlRef(id: string) { return db.collection("organizations").doc(id).collection("release3RuntimeControl").doc("global"); }
function auditRef(id: string, key: string) { return db.collection("organizations").doc(id).collection("auditEvents").doc(`r4_${createHash("sha256").update(key).digest("hex")}`); }

export const r4GetFeedbackRuntimeControl = onCall(async request => {
  const data = request.data && typeof request.data === "object" && !Array.isArray(request.data) ? request.data as Record<string, unknown> : {};
  const orgId = organizationId(data.organizationId);
  const actor = actorUid(request);
  await assertOrganizationCapability(orgId, actor, "lifecycle.view");
  const snap = await controlRef(orgId).get();
  return snap.exists ? snap.data() as FeedbackRuntimeControl : DEFAULT_CONTROL;
});

export const r4SetFeedbackRuntimeControl = onCall(async request => {
  const data = request.data && typeof request.data === "object" && !Array.isArray(request.data) ? request.data as Record<string, unknown> : {};
  const orgId = organizationId(data.organizationId);
  const actor = actorUid(request);
  await assertOrganizationCapability(orgId, actor, "lifecycle.manage");
  if (typeof data.enabled !== "boolean" || typeof data.paused !== "boolean" || typeof data.outboundEnabled !== "boolean" || typeof data.rewardsEnabled !== "boolean") {
    throw new HttpsError("invalid-argument", "enabled, paused, outboundEnabled, and rewardsEnabled must be boolean.");
  }
  const minimumAnonymousResponses = Number(data.minimumAnonymousResponses ?? 5);
  if (!Number.isSafeInteger(minimumAnonymousResponses) || minimumAnonymousResponses < 5 || minimumAnonymousResponses > 100) throw new HttpsError("invalid-argument", "minimumAnonymousResponses must be between 5 and 100.");
  const anonymousPolicyId = data.anonymousPolicyId === null || data.anonymousPolicyId === undefined || data.anonymousPolicyId === ""
    ? null
    : typeof data.anonymousPolicyId === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(data.anonymousPolicyId) ? data.anonymousPolicyId : (() => { throw new HttpsError("invalid-argument", "anonymousPolicyId is invalid."); })();

  const [prior, r3] = await Promise.all([controlRef(orgId).get(), r3ControlRef(orgId).get()]);
  const r3Data = r3.data() ?? {};
  if ((data.enabled === true || data.paused === false) && (!r3.exists || r3Data.paused !== false || r3Data.inAppEnabled !== true)) {
    throw new HttpsError("failed-precondition", "Release 3 must be active with in-app treatment enabled before Release 4 can run.");
  }
  if (data.outboundEnabled === true && r3Data.emailEnabled !== true) throw new HttpsError("failed-precondition", "Release 3 email delivery must be enabled before Release 4 outbound invitations can run.");

  const now = new Date().toISOString();
  const next: FeedbackRuntimeControl = {
    enabled: data.enabled,
    paused: data.paused,
    outboundEnabled: data.outboundEnabled,
    // This switch enables only the non-live test-credit adapter; live rewards are rejected in domain code.
    rewardsEnabled: data.rewardsEnabled,
    anonymousPolicyId,
    minimumAnonymousResponses,
    policyVersion: Number(prior.data()?.policyVersion ?? 0) + 1,
    updatedAt: now,
    updatedBy: actor,
  };
  const auditIdempotencyKey = `${orgId}:feedback-runtime:${next.policyVersion}`;
  const audit: AuditRecord = {
    schemaVersion: 1,
    id: `r4_${createHash("sha256").update(auditIdempotencyKey).digest("hex")}`,
    action: "feedback.runtime_control.updated",
    scope: { kind: "organization", organizationId: orgId },
    target: { type: "feedback-runtime-control", id: "global", organizationId: orgId },
    metadata: sanitizeAuditMetadata({
      enabled: next.enabled,
      paused: next.paused,
      outboundEnabled: next.outboundEnabled,
      rewardsEnabled: next.rewardsEnabled,
      anonymousPolicyConfigured: Boolean(next.anonymousPolicyId),
      minimumAnonymousResponses: next.minimumAnonymousResponses,
      policyVersion: next.policyVersion,
    }),
    correlationId: auditIdempotencyKey,
    idempotencyKey: auditIdempotencyKey,
    actor: { kind: "user", id: actor },
    occurredAt: now,
    receivedAt: now,
    source: "cloud-function",
  };
  await db.runTransaction(async transaction => {
    transaction.set(controlRef(orgId), next, { merge: false });
    transaction.set(auditRef(orgId, auditIdempotencyKey), audit, { merge: false });
  });
  return next;
});
