import assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { secureLifecycleEventAppender } from "../lib/functions/src/platform/firestore-lifecycle.js";

if (!getApps().length) initializeApp();
const db = getFirestore();
const commit = process.env.GITHUB_SHA || process.env.RELEASE_COMMIT || "unknown";
const suffix = commit.slice(0, 10).replace(/[^a-z0-9]/gi, "").toLowerCase() || "manual";
const organizationId = `r2-acceptance-${suffix}`;
const customerId = "customer-acceptance";
const identityId = "identity-acceptance";
const organization = db.collection("organizations").doc(organizationId);

async function waitFor(label, read, predicate, attempts = 45) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await read();
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`${label} did not converge. Last value: ${JSON.stringify(last)}`);
}

try {
  const control = await db.collection("_platformRuntime").doc("acquisition").get();
  assert.equal(control.data()?.paused, true, "Production acceptance requires global acquisition pause to be engaged.");

  await organization.set({ organizationId, name: "Release 2 Deployment Acceptance", status: "active", temporaryAcceptance: true });
  await organization.collection("customers").doc(customerId).set({
    schemaVersion: 1,
    organizationId,
    customerId,
    identityId,
    status: "active",
    verifiedAt: new Date().toISOString(),
    profile: { email: "release2-acceptance@example.test", displayName: "Release 2 Acceptance" },
  });

  const now = new Date().toISOString();
  const append = await secureLifecycleEventAppender.appendTrustedEnvelope({
    event: {
      eventId: `registration-${suffix}`,
      eventType: "registration.completed",
      schemaVersion: 1,
      organizationId,
      subjectId: customerId,
      subjectKind: "customer",
      identityId,
      customerId,
      occurredAt: now,
      receivedAt: now,
      source: "trusted_server",
      correlationId: `r2-production-${suffix}`,
      idempotencyKey: `registration-completed-${suffix}`,
      dataMode: "test",
      payload: {},
    },
    expectedOrganizationId: organizationId,
    expectedSource: "trusted_server",
  });
  assert.equal(append.status, "appended");
  const duplicate = await secureLifecycleEventAppender.appendTrustedEnvelope({
    event: {
      ...append.event,
      eventId: `registration-duplicate-${suffix}`,
    },
    expectedOrganizationId: organizationId,
    expectedSource: "trusted_server",
  });
  assert.equal(duplicate.status, "duplicate", "Deployed Firestore must enforce canonical logical-event dedupe.");

  const projectionId = `test~${customerId}`;
  const projectionSnapshot = await waitFor(
    "deployed lifecycle projection trigger",
    async () => {
      const snapshot = await organization.collection("lifecycleProjections").doc(projectionId).get();
      return snapshot.exists ? snapshot.data() : null;
    },
    (value) => value?.identity?.state === "registered",
  );
  assert.equal(projectionSnapshot.identity.state, "registered");

  const outboxId = `outbox-${suffix}`;
  const outboxRef = organization.collection("communicationEventOutbox").doc(outboxId);
  await outboxRef.set({
    schemaVersion: 1,
    outboxId,
    organizationId,
    eventType: "communication.delivered",
    source: "provider_webhook",
    dataMode: "test",
    subjectKind: "lead",
    subjectId: `lead-${suffix}`,
    messageId: `message-${suffix}`,
    effectId: `effect-${suffix}`,
    purpose: "marketing",
    templateId: "lead-follow-up",
    templateVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: `communication-${suffix}`,
    idempotencyKey: outboxId,
    providerMessageId: `provider-${suffix}`,
    state: "pending",
    createdAt: new Date().toISOString(),
  });
  const appendedOutbox = await waitFor(
    "deployed communication outbox trigger",
    async () => (await outboxRef.get()).data(),
    (value) => value?.state === "appended",
  );
  assert.equal(appendedOutbox.state, "appended");
  assert.equal(typeof appendedOutbox.appendedEventId, "string");

  const health = await db.collection("_runtimeHealth").doc("release2").get();
  assert.equal(health.data()?.acquisitionPaused, true);
  console.log(JSON.stringify({
    commit,
    trustedAppend: "passed",
    projectionTrigger: "passed",
    communicationOutbox: "passed",
    acquisitionPaused: true,
  }));
} finally {
  try {
    await db.recursiveDelete(organization);
  } catch (error) {
    console.warn("Temporary Release 2 acceptance tenant cleanup requires follow-up:", error instanceof Error ? error.message : error);
  }
}
