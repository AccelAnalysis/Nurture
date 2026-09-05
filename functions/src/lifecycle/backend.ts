import { createHash } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import type { AnalyticsDataMode, LifecycleEventEnvelope, LifecycleEventSubmission } from "../../../shared/analytics/contracts.js";
import type { LifecycleProjectionCheckpoint, LifecycleProjectionStore, CustomerLifecycleProjection } from "../../../shared/lifecycle/contracts.js";
import { createLifecycleProjectionProcessor } from "../../../shared/lifecycle/processor.js";
import type { EventIntegrationPort } from "../../../shared/platform/integrations.js";
import { integrationFailure, integrationSuccess } from "../../../shared/platform/integrations.js";
import {
  SecureLifecycleEventAppender,
  TrustedEventAppendError,
  lifecycleEventDedupeKey,
  type DurableLifecycleEventStore,
  type LifecycleEventAdmissionPort,
} from "../../../shared/platform/trusted-event-append.js";
import { createExperienceMilestoneRecorder } from "../../../shared/experience/lifecycle.js";
import {
  REFERENCE_EXPERIENCE_EVIDENCE_VALIDATORS,
  REFERENCE_EXPERIENCE_MILESTONE_DEFINITIONS,
} from "../../../shared/experience/reference-lifecycle.js";
import { createRecordExperienceMilestoneCallable } from "../experience-lifecycle.js";
import { organizationCustomerBinding } from "../billing/customer-binding.js";
import { db } from "../firebase.js";

const EVENT_COLLECTION = "lifecycleEvents";
const EVENT_RECEIPTS = "lifecycleEventReceipts";
const PROJECTIONS = "lifecycleProjections";
const CHECKPOINTS = "lifecycleProjectionCheckpoints";
const PROJECTION_RECEIPTS = "lifecycleProjectionReceipts";
const ADMISSION_BUCKETS = "lifecycleAdmissionBuckets";
const BROWSER_EVENTS_PER_MINUTE = 120;

function safeDocId(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function projectionId(organizationId: string, customerId: string, dataMode: AnalyticsDataMode): string {
  return safeDocId(`${organizationId}:${customerId}:${dataMode}`);
}

export class FirestoreLifecycleEventStore implements DurableLifecycleEventStore {
  async appendIfAbsent(event: LifecycleEventEnvelope) {
    const dedupe = safeDocId(lifecycleEventDedupeKey(event));
    const receiptRef = db.collection(EVENT_RECEIPTS).doc(dedupe);
    const eventRef = db.collection("organizations").doc(event.organizationId).collection(EVENT_COLLECTION).doc(event.eventId);
    return db.runTransaction(async (tx) => {
      const receipt = await tx.get(receiptRef);
      if (receipt.exists) {
        const existingEventId = receipt.data()?.eventId;
        const existing = typeof existingEventId === "string"
          ? await tx.get(db.collection("organizations").doc(event.organizationId).collection(EVENT_COLLECTION).doc(existingEventId))
          : null;
        return { status: "duplicate" as const, event: (existing?.data() as LifecycleEventEnvelope | undefined) ?? event };
      }
      tx.create(receiptRef, {
        organizationId: event.organizationId,
        dataMode: event.dataMode,
        idempotencyKey: event.idempotencyKey,
        eventId: event.eventId,
        createdAt: event.receivedAt,
      });
      tx.create(eventRef, event);
      return { status: "appended" as const, event };
    });
  }
}

export class FirestoreLifecycleProjectionStore implements LifecycleProjectionStore {
  async getProjection(input: { organizationId: string; customerId: string; dataMode: AnalyticsDataMode }) {
    const snap = await db.collection(PROJECTIONS).doc(projectionId(input.organizationId, input.customerId, input.dataMode)).get();
    return snap.exists ? snap.data() as CustomerLifecycleProjection : null;
  }

  async getCheckpoint(input: { organizationId: string; customerId: string; dataMode: AnalyticsDataMode }) {
    const snap = await db.collection(CHECKPOINTS).doc(projectionId(input.organizationId, input.customerId, input.dataMode)).get();
    return snap.exists ? snap.data() as LifecycleProjectionCheckpoint : null;
  }

  async listProjections(input: { organizationId: string; dataMode: AnalyticsDataMode; limit: number; cursor?: string }) {
    let query = db.collection(PROJECTIONS)
      .where("organizationId", "==", input.organizationId)
      .where("dataMode", "==", input.dataMode)
      .orderBy("customerId")
      .limit(Math.min(Math.max(input.limit, 1), 100));
    if (input.cursor) query = query.startAfter(input.cursor);
    const snap = await query.get();
    const items = snap.docs.map((doc) => doc.data() as CustomerLifecycleProjection);
    return { items, ...(snap.docs.length === input.limit ? { nextCursor: snap.docs.at(-1)?.get("customerId") as string } : {}) };
  }

  async commitProjection(input: {
    projection: CustomerLifecycleProjection;
    checkpoint: LifecycleProjectionCheckpoint;
    expectedRevision: number;
    sourceEventId: string;
    sourceIdempotencyKey: string;
  }) {
    const id = projectionId(input.projection.organizationId, input.projection.customerId, input.projection.dataMode);
    const projectionRef = db.collection(PROJECTIONS).doc(id);
    const checkpointRef = db.collection(CHECKPOINTS).doc(id);
    const receiptRef = db.collection(PROJECTION_RECEIPTS).doc(safeDocId(`${id}:${input.sourceIdempotencyKey}`));
    return db.runTransaction(async (tx) => {
      const [receipt, checkpoint] = await Promise.all([tx.get(receiptRef), tx.get(checkpointRef)]);
      if (receipt.exists) return "duplicate" as const;
      const revision = checkpoint.exists ? Number(checkpoint.data()?.revision ?? 0) : 0;
      if (revision !== input.expectedRevision) return "conflict" as const;
      tx.set(projectionRef, input.projection, { merge: false });
      tx.set(checkpointRef, input.checkpoint, { merge: false });
      tx.create(receiptRef, {
        organizationId: input.projection.organizationId,
        customerId: input.projection.customerId,
        dataMode: input.projection.dataMode,
        sourceEventId: input.sourceEventId,
        sourceIdempotencyKey: input.sourceIdempotencyKey,
        createdAt: new Date().toISOString(),
      });
      return "committed" as const;
    });
  }
}

class FirestoreLifecycleAdmission implements LifecycleEventAdmissionPort {
  async admit(input: Parameters<LifecycleEventAdmissionPort["admit"]>[0]) {
    if (input.source !== "browser") return { status: "allowed" as const };
    const minute = Math.floor(Date.now() / 60_000);
    const subject = input.identityId ?? input.customerId ?? input.subjectId ?? "anonymous";
    const id = safeDocId(`${input.organizationId}:${subject}:${minute}`);
    const ref = db.collection(ADMISSION_BUCKETS).doc(id);
    try {
      return await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const count = snap.exists ? Number(snap.data()?.count ?? 0) : 0;
        if (count >= BROWSER_EVENTS_PER_MINUTE) {
          return { status: "denied" as const, reason: "Browser lifecycle event rate limit reached.", retryAfterSeconds: 60 };
        }
        tx.set(ref, { organizationId: input.organizationId, subject, minute, count: count + 1, updatedAt: new Date().toISOString() }, { merge: true });
        return { status: "allowed" as const };
      });
    } catch {
      return { status: "denied" as const, reason: "Lifecycle admission storage is unavailable.", retryAfterSeconds: 60 };
    }
  }
}

const eventStore = new FirestoreLifecycleEventStore();
const projectionStore = new FirestoreLifecycleProjectionStore();
const secureAppender = new SecureLifecycleEventAppender(
  organizationCustomerBinding,
  eventStore,
  new FirestoreLifecycleAdmission(),
);

export const lifecycleEventPort: EventIntegrationPort<LifecycleEventEnvelope> = {
  async publish(event, context) {
    try {
      await secureAppender.appendTrustedEnvelope({
        event,
        expectedOrganizationId: context.organizationId ?? event.organizationId,
        expectedSource: event.source,
      });
      return integrationSuccess(undefined, { integration: "events", provider: "firestore", correlationId: context.correlationId });
    } catch (error) {
      return integrationFailure({
        code: error instanceof TrustedEventAppendError && error.code === "rate-limited" ? "rate-limited" : "unavailable",
        message: error instanceof Error ? error.message : "Lifecycle event persistence failed.",
        retryable: !(error instanceof TrustedEventAppendError) || error.code === "rate-limited",
      }, { integration: "events", provider: "firestore", correlationId: context.correlationId });
    }
  },
  async publishBatch(events, context) {
    for (const event of events) {
      const result = await this.publish(event, { ...context, organizationId: event.organizationId });
      if (!result.ok) return result;
    }
    return integrationSuccess(undefined, { integration: "events", provider: "firestore", correlationId: context.correlationId });
  },
  async health() {
    try {
      await db.collection("systemHealth").doc("lifecycle").get();
      return { integration: "events" as const, provider: "firestore", status: "ready" as const, checkedAt: new Date().toISOString() };
    } catch (error) {
      return { integration: "events" as const, provider: "firestore", status: "unavailable" as const, checkedAt: new Date().toISOString(), message: error instanceof Error ? error.message : "Firestore unavailable." };
    }
  },
};

const experienceRecorder = createExperienceMilestoneRecorder({
  definitions: REFERENCE_EXPERIENCE_MILESTONE_DEFINITIONS,
  evidenceValidators: REFERENCE_EXPERIENCE_EVIDENCE_VALIDATORS,
  bindingPort: organizationCustomerBinding,
  eventPort: lifecycleEventPort,
});

export const recordExperienceMilestone = createRecordExperienceMilestoneCallable({
  recorder: experienceRecorder,
  resolveDataMode: () => "live",
});

function inputObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request must be an object.");
  return value as Record<string, unknown>;
}

export const appendLifecycleEvent = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to record lifecycle activity.");
  const input = inputObject(request.data);
  const organizationId = typeof input.organizationId === "string" ? input.organizationId.trim() : "";
  if (!organizationId) throw new HttpsError("invalid-argument", "organizationId is required.");
  const submission = input.submission as LifecycleEventSubmission | undefined;
  if (!submission) throw new HttpsError("invalid-argument", "submission is required.");
  try {
    const result = await secureAppender.appendAuthenticatedBrowserSubmission({
      submission,
      organizationId,
      identityId: request.auth.uid,
      dataMode: "live",
    });
    return { status: result.status, eventId: result.event.eventId };
  } catch (error) {
    if (error instanceof TrustedEventAppendError) {
      const code = error.code === "rate-limited" ? "resource-exhausted" : error.code === "binding-unavailable" ? "failed-precondition" : "permission-denied";
      throw new HttpsError(code, error.message);
    }
    throw new HttpsError("internal", "Lifecycle activity could not be recorded.");
  }
});

const processProjection = createLifecycleProjectionProcessor(projectionStore);

export const projectLifecycleEvent = onDocumentCreated("organizations/{organizationId}/lifecycleEvents/{eventId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  await processProjection(data);
});
