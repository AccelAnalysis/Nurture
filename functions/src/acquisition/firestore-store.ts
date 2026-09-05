import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { AnalyticsDataMode } from "../../../shared/analytics/contracts.js";
import type {
  AcquisitionCatalogId,
  AcquisitionEnrollment,
  AcquisitionJob,
  AcquisitionJobStatus,
  AcquisitionMessagePurpose,
  AcquisitionOperationsSnapshot,
  AcquisitionPauseState,
  AcquisitionReasonCode,
  AcquisitionRuntimeStore,
  CreateEnrollmentInput,
  CreateEnrollmentResult,
  LeaseJobInput,
  LeaseJobResult,
  MarkProviderSubmissionStartedInput,
  TransitionLeasedJobInput,
} from "../../../shared/acquisition/contracts.js";
import { db } from "../firebase.js";

const terminalStatuses = new Set<AcquisitionJobStatus>([
  "provider-accepted",
  "dry-run",
  "suppressed",
  "cancelled",
  "failed",
  "unknown-outcome",
]);
const runnableStatuses: AcquisitionJobStatus[] = ["scheduled", "held", "retrying", "leased"];

function organizationRef(organizationId: string) {
  return db.collection("organizations").doc(organizationId);
}
function opaque(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function enrollmentRef(organizationId: string, enrollmentId: string) {
  return organizationRef(organizationId).collection("acquisitionEnrollments").doc(opaque(enrollmentId));
}
function jobRef(organizationId: string, jobId: string) {
  return organizationRef(organizationId).collection("acquisitionJobs").doc(opaque(jobId));
}
function platformControlRef() {
  return db.collection("_platformRuntime").doc("acquisition");
}
function organizationControlRef(organizationId: string) {
  return organizationRef(organizationId).collection("acquisitionControl").doc("runtime");
}
function automationControlRef(organizationId: string, automationId: AcquisitionCatalogId) {
  return organizationRef(organizationId).collection("acquisitionControl").doc(`automation~${automationId}`);
}
function asJob(snapshot: FirebaseFirestore.DocumentSnapshot): AcquisitionJob {
  return snapshot.data() as AcquisitionJob;
}
function asEnrollment(snapshot: FirebaseFirestore.DocumentSnapshot): AcquisitionEnrollment {
  return snapshot.data() as AcquisitionEnrollment;
}
function leaseMatches(job: AcquisitionJob, leaseToken: string) {
  return job.status === "leased" && job.lease?.leaseToken === leaseToken;
}
function persistWithoutLease(job: AcquisitionJob) {
  const { lease: _lease, ...rest } = job;
  return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
}
function explanation(at: string, reason: AcquisitionReasonCode, detail?: string) {
  return { at, reason, ...(detail !== undefined ? { detail } : {}) };
}

export class FirestoreAcquisitionRuntimeStore implements AcquisitionRuntimeStore {
  async createEnrollmentIfAbsent(input: CreateEnrollmentInput): Promise<CreateEnrollmentResult> {
    const ref = enrollmentRef(input.enrollment.organizationId, input.enrollment.enrollmentId);
    return db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists) return { status: "duplicate", enrollment: asEnrollment(existing) };
      transaction.create(ref, JSON.parse(JSON.stringify(input.enrollment)));
      for (const job of input.jobs) {
        if (job.organizationId !== input.enrollment.organizationId || job.enrollmentId !== input.enrollment.enrollmentId) {
          throw new Error("Acquisition enrollment/job scope mismatch.");
        }
        transaction.create(jobRef(job.organizationId, job.jobId), JSON.parse(JSON.stringify(job)));
      }
      return { status: "created", enrollment: input.enrollment, jobs: input.jobs };
    });
  }

  async getEnrollment(enrollmentId: string): Promise<AcquisitionEnrollment | null> {
    const matches = await db.collectionGroup("acquisitionEnrollments").where("enrollmentId", "==", enrollmentId).limit(2).get();
    if (matches.empty) return null;
    if (matches.size !== 1) throw new Error("Acquisition enrollment identity is ambiguous.");
    return matches.docs[0].data() as AcquisitionEnrollment;
  }

  async listDueJobs(input: { beforeOrAt: string; limit: number; dataMode?: AnalyticsDataMode }): Promise<readonly AcquisitionJob[]> {
    let query: FirebaseFirestore.Query = db.collectionGroup("acquisitionJobs")
      .where("status", "in", ["scheduled", "held", "retrying"])
      .where("dueAt", "<=", input.beforeOrAt)
      .orderBy("dueAt", "asc")
      .limit(Math.max(1, Math.min(input.limit, 200)));
    if (input.dataMode) {
      query = db.collectionGroup("acquisitionJobs")
        .where("dataMode", "==", input.dataMode)
        .where("status", "in", ["scheduled", "held", "retrying"])
        .where("dueAt", "<=", input.beforeOrAt)
        .orderBy("dueAt", "asc")
        .limit(Math.max(1, Math.min(input.limit, 200)));
    }
    const snapshot = await query.get();
    return snapshot.docs.map((item) => item.data() as AcquisitionJob);
  }

  async tryLeaseJob(input: LeaseJobInput): Promise<LeaseJobResult> {
    const matches = await db.collectionGroup("acquisitionJobs").where("jobId", "==", input.jobId).limit(2).get();
    if (matches.empty) return { status: "unavailable", reason: "missing" };
    if (matches.size !== 1) throw new Error("Acquisition job identity is ambiguous.");
    const ref = matches.docs[0].ref;
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { status: "unavailable", reason: "missing" };
      const job = asJob(snapshot);
      if (terminalStatuses.has(job.status)) return { status: "unavailable", reason: "terminal" };
      if (Date.parse(job.dueAt) > Date.parse(input.leasedAt)) return { status: "unavailable", reason: "not-due" };
      if (job.status === "leased" && job.lease && Date.parse(job.lease.expiresAt) > Date.parse(input.leasedAt)) {
        return { status: "unavailable", reason: "active-lease" };
      }
      if (job.providerSubmissionStartedAt) {
        const next: AcquisitionJob = {
          ...job,
          status: "unknown-outcome",
          lease: undefined,
          updatedAt: input.leasedAt,
          lastExplanation: explanation(input.leasedAt, "provider-unknown-outcome", "The prior worker lease expired after provider submission began; blind retry is prohibited."),
        };
        transaction.set(ref, persistWithoutLease(next), { merge: false });
        return { status: "unknown-outcome", job: next };
      }
      const next: AcquisitionJob = {
        ...job,
        status: "leased",
        lease: {
          leaseToken: input.leaseToken,
          workerId: input.workerId,
          leasedAt: input.leasedAt,
          expiresAt: input.leaseExpiresAt,
        },
        updatedAt: input.leasedAt,
        lastExplanation: explanation(input.leasedAt, "scheduled", `Leased by ${input.workerId}.`),
      };
      transaction.set(ref, JSON.parse(JSON.stringify(next)), { merge: false });
      return { status: "leased", job: next };
    });
  }

  async markProviderSubmissionStarted(input: MarkProviderSubmissionStartedInput): Promise<AcquisitionJob> {
    const matches = await db.collectionGroup("acquisitionJobs").where("jobId", "==", input.jobId).limit(2).get();
    if (matches.size !== 1) throw new Error("Acquisition job is unavailable or ambiguous.");
    const ref = matches.docs[0].ref;
    const orgJobs = organizationRef(input.frequencyAdmission.organizationId).collection("acquisitionJobs");
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("Acquisition job is unavailable.");
      const job = asJob(snapshot);
      if (!leaseMatches(job, input.leaseToken)) throw new Error("Acquisition worker lease was lost before provider submission.");
      if (job.organizationId !== input.frequencyAdmission.organizationId || job.subjectId !== input.frequencyAdmission.subjectId || job.dataMode !== input.frequencyAdmission.dataMode) {
        throw new Error("Acquisition frequency admission scope mismatch.");
      }
      if (job.providerSubmissionStartedAt) throw new Error("Provider submission ambiguity barrier is already present.");

      const reservations = await transaction.get(orgJobs
        .where("subjectId", "==", input.frequencyAdmission.subjectId)
        .where("dataMode", "==", input.frequencyAdmission.dataMode)
        .where("frequencyPurpose", "==", input.frequencyAdmission.purpose)
        .where("providerSubmissionStartedAt", ">=", input.frequencyAdmission.since)
        .orderBy("providerSubmissionStartedAt", "desc")
        .limit(input.frequencyAdmission.maxProviderAcceptedEffects));
      const activeReservations = reservations.docs.filter((item) => item.id !== ref.id).length;
      if (activeReservations >= input.frequencyAdmission.maxProviderAcceptedEffects) {
        const next: AcquisitionJob = {
          ...job,
          status: "suppressed",
          lease: undefined,
          updatedAt: input.at,
          lastExplanation: explanation(input.at, "frequency-cap-reached", "The bounded provider-effect frequency cap is full."),
        };
        transaction.set(ref, persistWithoutLease(next), { merge: false });
        return next;
      }

      const next: AcquisitionJob = {
        ...job,
        providerAttemptCount: job.providerAttemptCount + 1,
        providerSubmissionStartedAt: input.at,
        providerSubmissionAttemptId: input.attemptId,
        updatedAt: input.at,
      };
      transaction.set(ref, {
        providerAttemptCount: next.providerAttemptCount,
        providerSubmissionStartedAt: input.at,
        providerSubmissionAttemptId: input.attemptId,
        frequencyPurpose: input.frequencyAdmission.purpose,
        updatedAt: input.at,
      }, { merge: true });
      return next;
    });
  }

  async transitionLeasedJob(input: TransitionLeasedJobInput): Promise<AcquisitionJob> {
    const matches = await db.collectionGroup("acquisitionJobs").where("jobId", "==", input.jobId).limit(2).get();
    if (matches.size !== 1) throw new Error("Acquisition job is unavailable or ambiguous.");
    const ref = matches.docs[0].ref;
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("Acquisition job is unavailable.");
      const job = asJob(snapshot);
      if (!leaseMatches(job, input.leaseToken)) throw new Error("Acquisition worker lease was lost before transition.");
      const next: AcquisitionJob = {
        ...job,
        status: input.status,
        lease: undefined,
        updatedAt: input.at,
        lastExplanation: explanation(input.at, input.reason, input.detail),
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
        ...(input.providerAttemptCount !== undefined ? { providerAttemptCount: input.providerAttemptCount } : {}),
        ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
        ...(input.providerRequestId ? { providerRequestId: input.providerRequestId } : {}),
      };
      const patch: Record<string, unknown> = {
        status: next.status,
        updatedAt: next.updatedAt,
        lastExplanation: next.lastExplanation,
        lease: FieldValue.delete(),
      };
      if (input.dueAt) patch.dueAt = input.dueAt;
      if (input.providerAttemptCount !== undefined) patch.providerAttemptCount = input.providerAttemptCount;
      if (input.providerMessageId) patch.providerMessageId = input.providerMessageId;
      if (input.providerRequestId) patch.providerRequestId = input.providerRequestId;
      if (input.clearProviderSubmissionMarker) {
        patch.providerSubmissionStartedAt = FieldValue.delete();
        patch.providerSubmissionAttemptId = FieldValue.delete();
        patch.frequencyPurpose = FieldValue.delete();
        next.providerSubmissionStartedAt = undefined;
        next.providerSubmissionAttemptId = undefined;
      }
      transaction.set(ref, patch, { merge: true });
      return next;
    });
  }

  async getPauseState(input: { organizationId: string; automationId: AcquisitionCatalogId; dataMode: AnalyticsDataMode }): Promise<AcquisitionPauseState> {
    const [platform, organization, automation] = await Promise.all([
      platformControlRef().get(),
      organizationControlRef(input.organizationId).get(),
      automationControlRef(input.organizationId, input.automationId).get(),
    ]);
    return {
      platformPaused: platform.data()?.paused !== false,
      organizationPaused: organization.data()?.paused === true,
      automationPaused: automation.data()?.paused === true,
      checkedAt: new Date().toISOString(),
    };
  }

  async countProviderAcceptedEffects(input: { organizationId: string; subjectId: string; dataMode: AnalyticsDataMode; purpose: AcquisitionMessagePurpose; since: string }): Promise<number> {
    const snapshot = await organizationRef(input.organizationId).collection("acquisitionJobs")
      .where("subjectId", "==", input.subjectId)
      .where("dataMode", "==", input.dataMode)
      .where("frequencyPurpose", "==", input.purpose)
      .where("providerSubmissionStartedAt", ">=", input.since)
      .get();
    return snapshot.size;
  }

  async cancelPending(input: { organizationId: string; subjectId: string; dataMode: AnalyticsDataMode; automationId?: AcquisitionCatalogId; at: string; reason: AcquisitionReasonCode; detail?: string }): Promise<number> {
    let query: FirebaseFirestore.Query = organizationRef(input.organizationId).collection("acquisitionJobs")
      .where("subjectId", "==", input.subjectId)
      .where("dataMode", "==", input.dataMode)
      .where("status", "in", runnableStatuses);
    if (input.automationId) query = query.where("automationId", "==", input.automationId);
    const snapshot = await query.limit(400).get();
    if (snapshot.empty) return 0;
    const batch = db.batch();
    for (const item of snapshot.docs) {
      batch.set(item.ref, {
        status: "cancelled",
        updatedAt: input.at,
        lastExplanation: explanation(input.at, input.reason, input.detail),
        lease: FieldValue.delete(),
      }, { merge: true });
    }
    await batch.commit();
    return snapshot.size;
  }

  async finalizeEnrollmentIfSettled(input: { enrollmentId: string; at: string }): Promise<AcquisitionEnrollment | null> {
    const enrollmentMatches = await db.collectionGroup("acquisitionEnrollments").where("enrollmentId", "==", input.enrollmentId).limit(2).get();
    if (enrollmentMatches.empty) return null;
    if (enrollmentMatches.size !== 1) throw new Error("Acquisition enrollment identity is ambiguous.");
    const ref = enrollmentMatches.docs[0].ref;
    const enrollment = enrollmentMatches.docs[0].data() as AcquisitionEnrollment;
    const jobs = await organizationRef(enrollment.organizationId).collection("acquisitionJobs").where("enrollmentId", "==", input.enrollmentId).limit(200).get();
    const records = jobs.docs.map((item) => item.data() as AcquisitionJob);
    if (records.some((job) => !terminalStatuses.has(job.status))) return enrollment;
    let status: AcquisitionEnrollment["status"] = "completed";
    let reason: AcquisitionReasonCode = "provider-accepted";
    if (records.some((job) => job.status === "unknown-outcome")) { status = "held"; reason = "provider-unknown-outcome"; }
    else if (records.some((job) => job.status === "failed")) { status = "failed"; reason = "runtime-error"; }
    else if (records.length && records.every((job) => job.status === "cancelled")) { status = "cancelled"; reason = records[0].lastExplanation.reason; }
    const next: AcquisitionEnrollment = { ...enrollment, status, lastExplanation: explanation(input.at, reason) };
    await ref.set({ status, lastExplanation: next.lastExplanation }, { merge: true });
    return next;
  }

  async getOperationsSnapshot(input: { organizationId?: string; dataMode?: AnalyticsDataMode; limit: number }): Promise<AcquisitionOperationsSnapshot> {
    let query: FirebaseFirestore.Query = input.organizationId
      ? organizationRef(input.organizationId).collection("acquisitionJobs")
      : db.collectionGroup("acquisitionJobs");
    if (input.dataMode) query = query.where("dataMode", "==", input.dataMode);
    const snapshot = await query.limit(Math.max(1, Math.min(input.limit, 200))).get();
    const jobs = snapshot.docs.map((item) => item.data() as AcquisitionJob).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const counts: Partial<Record<AcquisitionJobStatus, number>> = {};
    for (const job of jobs) counts[job.status] = (counts[job.status] ?? 0) + 1;
    const platform = await platformControlRef().get();
    const organization = input.organizationId ? await organizationControlRef(input.organizationId).get() : null;
    return {
      generatedAt: new Date().toISOString(),
      platformPaused: platform.data()?.paused !== false,
      ...(input.organizationId ? { organizationPaused: organization?.data()?.paused === true } : {}),
      counts,
      recentJobs: jobs.slice(0, input.limit),
      backendPersistence: "ready",
      scheduler: "ready",
      note: platform.data()?.paused === false ? "Durable runtime is active." : "Durable runtime is deployed with the platform dispatch pause engaged.",
    };
  }
}

export const acquisitionRuntimeStore = new FirestoreAcquisitionRuntimeStore();
