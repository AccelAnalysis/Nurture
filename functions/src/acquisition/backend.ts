import { createHash, randomUUID } from "node:crypto";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { AnalyticsDataMode, LifecycleEventEnvelope } from "../../../shared/analytics/contracts.js";
import type {
  AcquisitionAutomationDefinition,
  AcquisitionCatalogId,
  AcquisitionDefinitionPort,
  AcquisitionEmailDispatchPort,
  AcquisitionEnrollment,
  AcquisitionJob,
  AcquisitionJobStatus,
  AcquisitionRuntimeStore,
  AcquisitionStatePort,
} from "../../../shared/acquisition/contracts.js";
import { createAcquisitionRuntime } from "../../../shared/acquisition/runtime.js";
import { validateAcquisitionDefinition } from "../../../shared/acquisition/catalog.js";
import { db } from "../firebase.js";

const ENROLLMENTS = "acquisitionEnrollments";
const JOBS = "acquisitionJobs";
const DEFINITIONS = "acquisitionDefinitions";
const CONTROLS = "acquisitionControls";
const MAX_DUE_SCAN = 100;
const TERMINAL = new Set<AcquisitionJobStatus>(["provider-accepted", "dry-run", "suppressed", "cancelled", "failed", "unknown-outcome"]);

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function controlId(parts: string[]) { return parts.map(encodeURIComponent).join(":"); }
function explanation(at: string, reason: AcquisitionJob["lastExplanation"]["reason"], detail?: string) {
  return { at, reason, ...(detail ? { detail } : {}) };
}

class FirestoreAcquisitionRuntimeStore implements AcquisitionRuntimeStore {
  async createEnrollmentIfAbsent(input: { enrollment: AcquisitionEnrollment; jobs: readonly AcquisitionJob[] }) {
    const ref = db.collection(ENROLLMENTS).doc(input.enrollment.enrollmentId);
    return db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) return { status: "duplicate" as const, enrollment: existing.data() as AcquisitionEnrollment };
      tx.create(ref, input.enrollment);
      for (const job of input.jobs) tx.create(db.collection(JOBS).doc(job.jobId), job);
      return { status: "created" as const, enrollment: input.enrollment, jobs: input.jobs };
    });
  }

  async getEnrollment(enrollmentId: string) {
    const snap = await db.collection(ENROLLMENTS).doc(enrollmentId).get();
    return snap.exists ? snap.data() as AcquisitionEnrollment : null;
  }

  async listDueJobs(input: { beforeOrAt: string; limit: number; dataMode?: AnalyticsDataMode }) {
    let query = db.collection(JOBS)
      .where("status", "in", ["scheduled", "held", "retrying"])
      .where("dueAt", "<=", input.beforeOrAt)
      .orderBy("dueAt")
      .limit(Math.min(Math.max(input.limit, 1), MAX_DUE_SCAN));
    if (input.dataMode) query = query.where("dataMode", "==", input.dataMode);
    return (await query.get()).docs.map((doc) => doc.data() as AcquisitionJob);
  }

  async tryLeaseJob(input: { jobId: string; workerId: string; leaseToken: string; leasedAt: string; leaseExpiresAt: string }) {
    const ref = db.collection(JOBS).doc(input.jobId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { status: "unavailable" as const, reason: "missing" as const };
      const job = snap.data() as AcquisitionJob;
      if (TERMINAL.has(job.status)) return { status: "unavailable" as const, reason: "terminal" as const };
      if (Date.parse(job.dueAt) > Date.parse(input.leasedAt)) return { status: "unavailable" as const, reason: "not-due" as const };
      if (job.lease && Date.parse(job.lease.expiresAt) > Date.parse(input.leasedAt)) return { status: "unavailable" as const, reason: "active-lease" as const };
      if (job.providerSubmissionStartedAt) {
        const updated: AcquisitionJob = { ...job, status: "unknown-outcome", lease: undefined, updatedAt: input.leasedAt, lastExplanation: explanation(input.leasedAt, "provider-unknown-outcome", "Expired lease crossed the provider ambiguity barrier.") };
        tx.set(ref, updated, { merge: false });
        return { status: "unknown-outcome" as const, job: updated };
      }
      const leased: AcquisitionJob = { ...job, status: "leased", lease: { leaseToken: input.leaseToken, workerId: input.workerId, leasedAt: input.leasedAt, expiresAt: input.leaseExpiresAt }, updatedAt: input.leasedAt, lastExplanation: explanation(input.leasedAt, "scheduled") };
      tx.set(ref, leased, { merge: false });
      return { status: "leased" as const, job: leased };
    });
  }

  async markProviderSubmissionStarted(input: Parameters<AcquisitionRuntimeStore["markProviderSubmissionStarted"]>[0]) {
    const ref = db.collection(JOBS).doc(input.jobId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Acquisition job is missing.");
      const job = snap.data() as AcquisitionJob & { providerPurpose?: string };
      if (job.status !== "leased" || job.lease?.leaseToken !== input.leaseToken) throw new Error("Acquisition job lease was lost.");
      const reservations = await tx.get(db.collection(JOBS)
        .where("organizationId", "==", input.frequencyAdmission.organizationId)
        .where("subjectId", "==", input.frequencyAdmission.subjectId)
        .where("dataMode", "==", input.frequencyAdmission.dataMode)
        .where("providerPurpose", "==", input.frequencyAdmission.purpose)
        .where("providerSubmissionStartedAt", ">=", input.frequencyAdmission.since)
        .limit(input.frequencyAdmission.maxProviderAcceptedEffects));
      if (reservations.size >= input.frequencyAdmission.maxProviderAcceptedEffects) {
        const suppressed: AcquisitionJob = { ...job, status: "suppressed", lease: undefined, updatedAt: input.at, lastExplanation: explanation(input.at, "frequency-cap-reached") };
        tx.set(ref, suppressed, { merge: false });
        return suppressed;
      }
      const marked = { ...job, providerSubmissionStartedAt: input.at, providerSubmissionAttemptId: input.attemptId, providerPurpose: input.frequencyAdmission.purpose, providerAttemptCount: job.providerAttemptCount + 1, updatedAt: input.at };
      tx.set(ref, marked, { merge: false });
      return marked as AcquisitionJob;
    });
  }

  async transitionLeasedJob(input: Parameters<AcquisitionRuntimeStore["transitionLeasedJob"]>[0]) {
    const ref = db.collection(JOBS).doc(input.jobId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Acquisition job is missing.");
      const current = snap.data() as AcquisitionJob & { providerPurpose?: string };
      if (current.lease?.leaseToken !== input.leaseToken) throw new Error("Acquisition job lease was lost.");
      const next: Record<string, unknown> = { ...current, status: input.status, lease: null, updatedAt: input.at, lastExplanation: explanation(input.at, input.reason, input.detail) };
      if (input.dueAt) next.dueAt = input.dueAt;
      if (input.providerAttemptCount !== undefined) next.providerAttemptCount = input.providerAttemptCount;
      if (input.providerMessageId) next.providerMessageId = input.providerMessageId;
      if (input.providerRequestId) next.providerRequestId = input.providerRequestId;
      if (input.clearProviderSubmissionMarker) { next.providerSubmissionStartedAt = null; next.providerSubmissionAttemptId = null; next.providerPurpose = null; }
      tx.set(ref, next, { merge: false });
      return { ...current, ...next, lease: undefined } as unknown as AcquisitionJob;
    });
  }

  async getPauseState(input: { organizationId: string; automationId: AcquisitionCatalogId; dataMode: AnalyticsDataMode }) {
    const [platform, organization, automation] = await Promise.all([
      db.collection(CONTROLS).doc("platform").get(),
      db.collection(CONTROLS).doc(controlId(["organization", input.organizationId, input.dataMode])).get(),
      db.collection(CONTROLS).doc(controlId(["automation", input.organizationId, input.automationId, input.dataMode])).get(),
    ]);
    return { platformPaused: platform.data()?.paused !== false, organizationPaused: organization.data()?.paused === true, automationPaused: automation.data()?.paused === true, checkedAt: new Date().toISOString() };
  }

  async countProviderAcceptedEffects(input: { organizationId: string; subjectId: string; dataMode: AnalyticsDataMode; purpose: string; since: string }) {
    return (await db.collection(JOBS).where("organizationId", "==", input.organizationId).where("subjectId", "==", input.subjectId).where("dataMode", "==", input.dataMode).where("providerPurpose", "==", input.purpose).where("providerSubmissionStartedAt", ">=", input.since).get()).size;
  }

  async cancelPending(input: { organizationId: string; subjectId: string; dataMode: AnalyticsDataMode; automationId?: AcquisitionCatalogId; at: string; reason: AcquisitionJob["lastExplanation"]["reason"]; detail?: string }) {
    let query = db.collection(JOBS).where("organizationId", "==", input.organizationId).where("subjectId", "==", input.subjectId).where("dataMode", "==", input.dataMode).where("status", "in", ["scheduled", "held", "retrying", "leased"]);
    if (input.automationId) query = query.where("automationId", "==", input.automationId);
    const snap = await query.limit(200).get();
    const batch = db.batch();
    for (const doc of snap.docs) batch.update(doc.ref, { status: "cancelled", lease: null, updatedAt: input.at, lastExplanation: explanation(input.at, input.reason, input.detail) });
    if (!snap.empty) await batch.commit();
    return snap.size;
  }

  async finalizeEnrollmentIfSettled(input: { enrollmentId: string; at: string }) {
    const ref = db.collection(ENROLLMENTS).doc(input.enrollmentId);
    const [enrollment, jobs] = await Promise.all([ref.get(), db.collection(JOBS).where("enrollmentId", "==", input.enrollmentId).get()]);
    if (!enrollment.exists) return null;
    const current = enrollment.data() as AcquisitionEnrollment;
    if (jobs.docs.some((doc) => !TERMINAL.has((doc.data() as AcquisitionJob).status))) return current;
    const statuses = jobs.docs.map((doc) => (doc.data() as AcquisitionJob).status);
    const status = statuses.some((s) => s === "failed" || s === "unknown-outcome") ? "failed" : statuses.every((s) => s === "cancelled") ? "cancelled" : "completed";
    const updated: AcquisitionEnrollment = { ...current, status, lastExplanation: { at: input.at, reason: status === "failed" ? "runtime-error" : status === "cancelled" ? "expired" : "provider-accepted" } };
    await ref.set(updated, { merge: false });
    return updated;
  }

  async getOperationsSnapshot(input: { organizationId?: string; dataMode?: AnalyticsDataMode; limit: number }) {
    const snap = await db.collection(JOBS).orderBy("updatedAt", "desc").limit(Math.min(Math.max(input.limit, 1), 100)).get();
    const recentJobs = snap.docs.map((doc) => doc.data() as AcquisitionJob).filter((j) => !input.organizationId || j.organizationId === input.organizationId).filter((j) => !input.dataMode || j.dataMode === input.dataMode);
    const counts: Partial<Record<AcquisitionJobStatus, number>> = {};
    for (const job of recentJobs) counts[job.status] = (counts[job.status] ?? 0) + 1;
    const platform = await db.collection(CONTROLS).doc("platform").get();
    return { generatedAt: new Date().toISOString(), platformPaused: platform.data()?.paused !== false, counts, recentJobs, backendPersistence: "ready" as const, scheduler: "ready" as const, note: platform.data()?.paused === false ? "Runtime is explicitly enabled." : "Runtime is deployed fail-closed; outbound acquisition remains paused." };
  }
}

const definitions: AcquisitionDefinitionPort = {
  async listPublishedForTrigger(input) {
    const snap = await db.collection(DEFINITIONS).where("organizationId", "==", input.organizationId).where("triggerEventType", "==", input.eventType).where("enabled", "==", true).get();
    return snap.docs.map((doc) => validateAcquisitionDefinition(doc.data() as AcquisitionAutomationDefinition));
  },
  async getVersion(input) {
    const snap = await db.collection(DEFINITIONS).doc(hash(`${input.organizationId}:${input.automationId}:${input.versionId}`)).get();
    return snap.exists ? validateAcquisitionDefinition(snap.data() as AcquisitionAutomationDefinition) : null;
  },
};

const state: AcquisitionStatePort = {
  async readCurrentState(input) {
    const now = new Date().toISOString();
    const org = await db.collection("organizations").doc(input.organizationId).get();
    if (!org.exists) return { checkedAt: now, organization: "missing", subject: "missing", registration: "unknown", onboarding: { status: "unknown" }, activation: "unknown", trial: { status: "unknown" }, purchase: "unknown", commercialEligibility: "unknown" };
    const subjectRef = input.subjectKind === "customer" ? db.collection("organizations").doc(input.organizationId).collection("customers").doc(input.subjectId) : db.collection("organizations").doc(input.organizationId).collection("leads").doc(input.subjectId);
    const subject = await subjectRef.get();
    const projection = input.customerId ? await db.collection("lifecycleProjections").doc(hash(`${input.organizationId}:${input.customerId}:${input.dataMode}`)).get() : null;
    const p = projection?.data();
    return {
      checkedAt: now,
      organization: org.data()?.status === "active" ? "active" : org.data()?.status === "paused" ? "paused" : "unknown",
      subject: !subject.exists ? "missing" : subject.data()?.status === "deleted" ? "deleted" : "active",
      registration: p?.identity?.state === "registered" || p?.identity?.state === "verified" ? "completed" : input.subjectKind === "lead" ? "incomplete" : "unknown",
      onboarding: { status: p?.onboarding?.state === "completed" ? "completed" : p?.onboarding?.state === "in_progress" ? "incomplete" : p?.onboarding?.state === "not_started" ? "not-started" : "unknown", ...(p?.onboarding?.flowVersion ? { flowVersionId: p.onboarding.flowVersion } : {}) },
      activation: p?.experience?.state === "activated" ? "completed" : p?.experience?.state === "started" || p?.experience?.state === "not_started" ? "missing" : "unknown",
      trial: { status: p?.commercial?.state === "trialing" ? "active" : p?.commercial?.state === "cancelled" || p?.commercial?.state === "inactive" ? "ended" : p?.commercial?.state === "none" ? "none" : "unknown", ...(p?.commercial?.trialEnd ? { endsAt: p.commercial.trialEnd } : {}) },
      purchase: p?.commercial?.state === "active" ? "completed" : p?.commercial?.state === "none" || p?.commercial?.state === "trialing" ? "absent" : "unknown",
      commercialEligibility: p?.commercial?.metadata?.stale === false && ["none", "trialing", "active"].includes(p?.commercial?.state) ? "eligible" : "unknown",
    };
  },
};

const email: AcquisitionEmailDispatchPort = {
  async evaluate() { return { status: "hold", checkedAt: new Date().toISOString(), reason: "Outbound acquisition email is not activated.", code: "sender-not-ready" }; },
  async submit() { return { status: "suppressed", reason: "Outbound acquisition email is not activated." }; },
};

const store = new FirestoreAcquisitionRuntimeStore();
const runtime = createAcquisitionRuntime({ definitions, store, state, email, id: randomUUID });

export const enrollAcquisitionFromLifecycle = onDocumentCreated("organizations/{organizationId}/lifecycleEvents/{eventId}", async (event) => {
  const envelope = event.data?.data() as LifecycleEventEnvelope | undefined;
  if (!envelope) return;
  await runtime.enroll({ event: envelope });
});

export const drainAcquisitionJobs = onSchedule({ schedule: "every 5 minutes", timeZone: "Etc/UTC" }, async () => {
  const platform = await db.collection(CONTROLS).doc("platform").get();
  if (platform.data()?.paused !== false) return;
  await runtime.drain({ workerId: `scheduler:${randomUUID()}`, limit: 50, dataMode: "live" });
});

export { store as acquisitionRuntimeStore };
