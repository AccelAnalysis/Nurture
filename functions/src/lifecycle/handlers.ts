import { onDocumentCreated } from "firebase-functions/v2/firestore";
import type { LifecycleEventEnvelope } from "../../../shared/analytics/contracts.js";
import { validateLifecycleEventEnvelope } from "../../../shared/analytics/core.js";
import { createLifecycleProjectionProcessor } from "../../../shared/lifecycle/processor.js";
import { acquisitionRuntime } from "../acquisition/composition.js";
import type { CommunicationEventOutboxRecord } from "../communications/outbox.js";
import { db } from "../firebase.js";
import {
  hasCanonicalLifecycleReceipt,
  secureLifecycleEventAppender,
} from "../platform/firestore-lifecycle.js";
import { lifecycleProjectionStore } from "./firestore-store.js";

const processProjection = createLifecycleProjectionProcessor(lifecycleProjectionStore);

export const processLifecycleEvent = onDocumentCreated(
  {
    document: "organizations/{organizationId}/lifecycleEvents/{eventId}",
    retry: true,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const envelope = validateLifecycleEventEnvelope(snapshot.data());
    if (envelope.organizationId !== event.params.organizationId || envelope.eventId !== event.params.eventId) {
      throw new Error("Lifecycle event document scope does not match its canonical envelope.");
    }

    // C and inherited R1 billing transactions historically wrote their trusted
    // lifecycle fact atomically with the domain record. Adopt only those legacy
    // writes that do not already have E's canonical receipt. Events produced via
    // E already carry the receipt and therefore are not admitted twice.
    if (!(await hasCanonicalLifecycleReceipt(envelope))) {
      await secureLifecycleEventAppender.appendTrustedEnvelope({
        event: envelope,
        expectedOrganizationId: envelope.organizationId,
        expectedSource: envelope.source,
      });
    }

    const projection = await processProjection(envelope);
    if (projection.status === "conflict") {
      throw new Error("Lifecycle projection did not converge after bounded compare-and-set retries.");
    }

    // Runtime enrollment is idempotent and is intentionally evaluated only after
    // the canonical event has crossed E's append boundary. Platform pause can
    // suppress enrollment while the release is held closed for activation.
    await acquisitionRuntime.enroll({ event: envelope, executionIntent: "normal" });
  },
);

function lifecycleEventFromCommunicationOutbox(outbox: CommunicationEventOutboxRecord): LifecycleEventEnvelope {
  const receivedAt = new Date().toISOString();
  return validateLifecycleEventEnvelope({
    eventId: `communication-outbox:${outbox.outboxId}`,
    eventType: outbox.eventType,
    schemaVersion: 1,
    organizationId: outbox.organizationId,
    subjectId: outbox.subjectId,
    subjectKind: outbox.subjectKind,
    ...(outbox.customerId ? { customerId: outbox.customerId } : {}),
    occurredAt: outbox.occurredAt,
    receivedAt,
    source: outbox.source,
    correlationId: outbox.correlationId,
    idempotencyKey: outbox.idempotencyKey,
    dataMode: outbox.dataMode,
    payload: {
      messageId: outbox.messageId,
      communicationId: outbox.messageId,
      templateVersion: outbox.templateVersion,
      ...(outbox.reason ? { reasonCode: outbox.reason.slice(0, 160) } : {}),
    },
  });
}

export const appendCommunicationLifecycleEvent = onDocumentCreated(
  {
    document: "organizations/{organizationId}/communicationEventOutbox/{outboxId}",
    retry: true,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const outbox = snapshot.data() as CommunicationEventOutboxRecord;
    if (outbox.organizationId !== event.params.organizationId || outbox.outboxId !== event.params.outboxId) {
      throw new Error("Communication outbox document scope mismatch.");
    }
    if (outbox.state === "appended") return;

    const envelope = lifecycleEventFromCommunicationOutbox(outbox);
    try {
      const result = await secureLifecycleEventAppender.appendTrustedEnvelope({
        event: envelope,
        expectedOrganizationId: outbox.organizationId,
        expectedSource: outbox.source,
      });
      await snapshot.ref.set({
        state: "appended",
        appendedEventId: result.event.eventId,
        appendedAt: new Date().toISOString(),
        failureReason: null,
      }, { merge: true });
    } catch (error) {
      await snapshot.ref.set({
        state: "failed",
        failureReason: error instanceof Error ? error.message.slice(0, 500) : "Lifecycle append failed.",
      }, { merge: true });
      throw error;
    }
  },
);

/** Readiness document used only for deployment verification, never as authority. */
export async function writeRelease2BackendReadiness(input: { commit: string; status: "deployed" | "verified" }) {
  await db.collection("_runtimeHealth").doc("release2").set({
    schemaVersion: 1,
    release: "2-backend",
    commit: input.commit,
    status: input.status,
    backendActivated: false,
    acquisitionPaused: true,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}
