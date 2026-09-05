import assert from "node:assert/strict";
import { db } from "../lib/functions/src/firebase.js";
import {
  FirestoreDurableLifecycleEventStore,
  FirestoreOrganizationCustomerBindingPort,
} from "../lib/functions/src/platform/firestore-lifecycle.js";
import { FirestoreLifecycleProjectionStore } from "../lib/functions/src/lifecycle/firestore-store.js";
import { FirestoreAcquisitionRuntimeStore } from "../lib/functions/src/acquisition/firestore-store.js";
import { createLifecycleProjectionProcessor } from "../lib/shared/lifecycle/processor.js";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required for this acceptance test.");

const organizationId = "r2-backend-test";
const customerId = "customer_r2_backend";
const identityId = "identity_r2_backend";
const organization = db.collection("organizations").doc(organizationId);
await organization.set({ organizationId, name: "Release 2 Backend Test", status: "active" });
await organization.collection("customers").doc(customerId).set({
  schemaVersion: 1,
  organizationId,
  customerId,
  identityId,
  status: "active",
  verifiedAt: "2026-09-05T16:00:00.000Z",
  profile: { email: "r2-backend@example.test", displayName: "Release Two" },
});
await db.collection("_platformRuntime").doc("acquisition").set({ paused: true, updatedAt: "2026-09-05T16:00:00.000Z" });

const binding = new FirestoreOrganizationCustomerBindingPort();
const resolved = await binding.resolve({ organizationId, identityId, correlationId: "r2-test" });
assert.equal(resolved.status, "ready", "canonical organization/customer binding must resolve");
if (resolved.status === "ready") assert.equal(resolved.binding.customerId, customerId);
const forged = await binding.resolveCustomer({ organizationId, customerId: "customer_forged", correlationId: "r2-test-forged" });
assert.equal(forged.status, "unavailable", "forged customer scope must fail closed");

const lifecycleEvent = {
  eventId: "r2-event-registration-complete",
  eventType: "registration.completed",
  schemaVersion: 1,
  organizationId,
  subjectId: customerId,
  subjectKind: "customer",
  identityId,
  customerId,
  occurredAt: "2026-09-05T16:00:00.000Z",
  receivedAt: "2026-09-05T16:00:01.000Z",
  source: "trusted_server",
  correlationId: "r2-registration",
  idempotencyKey: "r2-registration-once",
  dataMode: "test",
  payload: {},
};
const eventStore = new FirestoreDurableLifecycleEventStore();
assert.equal((await eventStore.appendIfAbsent(lifecycleEvent)).status, "appended");
assert.equal((await eventStore.appendIfAbsent({ ...lifecycleEvent, eventId: "different-event-id" })).status, "duplicate", "logical event dedupe must survive a different event id");

const projectionStore = new FirestoreLifecycleProjectionStore();
const processProjection = createLifecycleProjectionProcessor(projectionStore);
assert.equal((await processProjection(lifecycleEvent)).status, "committed");
assert.equal((await processProjection(lifecycleEvent)).status, "duplicate", "projection receipt must make at-least-once delivery idempotent");
const projection = await projectionStore.getProjection({ organizationId, customerId, dataMode: "test" });
assert.ok(projection, "durable lifecycle projection must be readable after commit");
assert.equal(projection.identity.state, "registered");

const runtime = new FirestoreAcquisitionRuntimeStore();
const baseEnrollment = {
  schemaVersion: 1,
  organizationId,
  automationId: "R2-ACTIVATE",
  automationVersionId: "R2-ACTIVATE-v1",
  subjectKind: "customer",
  subjectId: customerId,
  customerId,
  triggerEventId: lifecycleEvent.eventId,
  triggerIdempotencyKey: lifecycleEvent.idempotencyKey,
  triggerEventType: "registration.completed",
  dataMode: "test",
  createdAt: "2026-09-05T16:01:00.000Z",
  expiresAt: "2026-09-12T16:01:00.000Z",
  status: "active",
  lastExplanation: { at: "2026-09-05T16:01:00.000Z", reason: "scheduled" },
};
function enrollment(id) { return { ...baseEnrollment, enrollmentId: id }; }
function job(id, enrollmentId, dueAt = "2026-09-05T16:01:00.000Z") {
  return {
    schemaVersion: 1,
    jobId: id,
    effectId: id,
    enrollmentId,
    organizationId,
    automationId: "R2-ACTIVATE",
    automationVersionId: "R2-ACTIVATE-v1",
    subjectKind: "customer",
    subjectId: customerId,
    customerId,
    dataMode: "test",
    stepId: "email-1",
    dueAt,
    status: "scheduled",
    providerAttemptCount: 0,
    lastExplanation: { at: dueAt, reason: "scheduled" },
    updatedAt: dueAt,
  };
}

const firstEnrollmentId = "enrollment-r2-first";
const firstJobId = "effect-r2-first";
assert.equal((await runtime.createEnrollmentIfAbsent({ enrollment: enrollment(firstEnrollmentId), jobs: [job(firstJobId, firstEnrollmentId)] })).status, "created");
assert.equal((await runtime.createEnrollmentIfAbsent({ enrollment: enrollment(firstEnrollmentId), jobs: [job(firstJobId, firstEnrollmentId)] })).status, "duplicate");
const firstLease = await runtime.tryLeaseJob({ jobId: firstJobId, workerId: "worker-a", leaseToken: "lease-a", leasedAt: "2026-09-05T16:02:00.000Z", leaseExpiresAt: "2026-09-05T16:04:00.000Z" });
assert.equal(firstLease.status, "leased");
const firstBarrier = await runtime.markProviderSubmissionStarted({
  jobId: firstJobId,
  leaseToken: "lease-a",
  at: "2026-09-05T16:02:01.000Z",
  attemptId: "attempt-a",
  frequencyAdmission: { organizationId, subjectId: customerId, dataMode: "test", purpose: "marketing", since: "2026-08-29T16:02:01.000Z", maxProviderAcceptedEffects: 1 },
});
assert.equal(firstBarrier.providerSubmissionAttemptId, "attempt-a");
await runtime.transitionLeasedJob({ jobId: firstJobId, leaseToken: "lease-a", status: "provider-accepted", at: "2026-09-05T16:02:02.000Z", reason: "provider-accepted", providerMessageId: "provider-a" });

const secondEnrollmentId = "enrollment-r2-second";
const secondJobId = "effect-r2-second";
await runtime.createEnrollmentIfAbsent({ enrollment: enrollment(secondEnrollmentId), jobs: [job(secondJobId, secondEnrollmentId)] });
assert.equal((await runtime.tryLeaseJob({ jobId: secondJobId, workerId: "worker-b", leaseToken: "lease-b", leasedAt: "2026-09-05T16:03:00.000Z", leaseExpiresAt: "2026-09-05T16:05:00.000Z" })).status, "leased");
const capped = await runtime.markProviderSubmissionStarted({
  jobId: secondJobId,
  leaseToken: "lease-b",
  at: "2026-09-05T16:03:01.000Z",
  attemptId: "attempt-b",
  frequencyAdmission: { organizationId, subjectId: customerId, dataMode: "test", purpose: "marketing", since: "2026-08-29T16:03:01.000Z", maxProviderAcceptedEffects: 1 },
});
assert.equal(capped.status, "suppressed", "frequency admission and provider barrier must be atomic across workers");
assert.equal(capped.providerSubmissionStartedAt, undefined, "cap-reached work must not cross the provider ambiguity barrier");

const thirdEnrollmentId = "enrollment-r2-third";
const thirdJobId = "effect-r2-third";
await runtime.createEnrollmentIfAbsent({ enrollment: enrollment(thirdEnrollmentId), jobs: [job(thirdJobId, thirdEnrollmentId)] });
assert.equal((await runtime.tryLeaseJob({ jobId: thirdJobId, workerId: "worker-c", leaseToken: "lease-c", leasedAt: "2026-09-05T16:04:00.000Z", leaseExpiresAt: "2026-09-05T16:04:01.000Z" })).status, "leased");
await runtime.markProviderSubmissionStarted({
  jobId: thirdJobId,
  leaseToken: "lease-c",
  at: "2026-09-05T16:04:00.500Z",
  attemptId: "attempt-c",
  frequencyAdmission: { organizationId, subjectId: customerId, dataMode: "test", purpose: "transactional", since: "2026-08-29T16:04:00.000Z", maxProviderAcceptedEffects: 10 },
});
const ambiguous = await runtime.tryLeaseJob({ jobId: thirdJobId, workerId: "worker-d", leaseToken: "lease-d", leasedAt: "2026-09-05T16:05:00.000Z", leaseExpiresAt: "2026-09-05T16:07:00.000Z" });
assert.equal(ambiguous.status, "unknown-outcome", "expired post-provider leases must never be blindly re-leased");

const operations = await runtime.getOperationsSnapshot({ organizationId, dataMode: "test", limit: 20 });
assert.equal(operations.backendPersistence, "ready");
assert.equal(operations.platformPaused, true, "backend acceptance must keep outbound acquisition platform-paused");

console.log("Release 2 Firestore persistence/idempotency/lease/frequency acceptance passed.");
