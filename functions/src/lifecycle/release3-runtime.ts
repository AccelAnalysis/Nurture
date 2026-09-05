import { createHash } from "node:crypto";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { AutomationDefinitionV3, InAppTreatmentIntent } from "../../../shared/release3/contracts.js";
import { planEffects } from "../../../shared/release3/runtime.js";
import {
  applyRetentionEvent,
  initialRetentionProjection,
  type Release3LifecycleEventEnvelope,
  type RetentionProjectionState,
} from "../../../shared/release3/retention-projections.js";
import { putInAppTreatmentIntent } from "../communications/in-app.js";
import { db } from "../firebase.js";

function hashId(value: string) { return createHash("sha256").update(value).digest("hex"); }
function orgRef(organizationId: string) { return db.collection("organizations").doc(organizationId); }
function projectionId(customerId: string, dataMode: string) { return dataMode === "live" ? customerId : `${customerId}__${dataMode}`; }
function projectionRef(organizationId: string, customerId: string, dataMode: string) { return orgRef(organizationId).collection("release3RetentionProjections").doc(projectionId(customerId, dataMode)); }
function runRef(organizationId: string, runId: string) { return orgRef(organizationId).collection("release3Runs").doc(hashId(runId)); }
function effectRef(organizationId: string, effectId: string) { return orgRef(organizationId).collection("release3Effects").doc(hashId(effectId)); }
function controlRef(organizationId: string) { return orgRef(organizationId).collection("release3RuntimeControl").doc("global"); }

interface Release3RunRecord {
  runId: string;
  organizationId: string;
  customerId: string;
  dataMode: "live" | "test" | "preview" | "demo" | "development";
  automationId: string;
  automationVersion: number;
  triggerId: string;
  triggerEventType: string;
  definition: AutomationDefinitionV3;
  state: "scheduled" | "eligible" | "executing" | "succeeded" | "suppressed" | "cancelled" | "retrying" | "failed" | "held";
  reasons: string[];
  createdAt: string;
  dueAt: string;
  updatedAt: string;
  effectIds: string[];
}

function eventLooksProjectable(value: unknown, organizationId: string): value is Release3LifecycleEventEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<Release3LifecycleEventEnvelope>;
  return event.organizationId === organizationId
    && typeof event.eventId === "string"
    && typeof event.eventType === "string"
    && typeof event.subjectId === "string"
    && typeof event.occurredAt === "string"
    && typeof event.receivedAt === "string"
    && typeof event.source === "string"
    && typeof event.dataMode === "string"
    && typeof event.idempotencyKey === "string"
    && Boolean(event.payload && typeof event.payload === "object");
}

async function updateProjection(event: Release3LifecycleEventEnvelope) {
  const customerId = event.customerId ?? (event.subjectKind === "customer" ? event.subjectId : undefined);
  if (!customerId) return null;
  const reference = projectionRef(event.organizationId, customerId, event.dataMode);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const initial = snapshot.exists
      ? snapshot.data() as RetentionProjectionState
      : initialRetentionProjection(event.organizationId, customerId, event.dataMode);
    const next = applyRetentionEvent(initial, event);
    if (next === initial || next.seenEventIds.length === initial.seenEventIds.length) return initial;
    transaction.set(reference, next, { merge: false });
    return next;
  });
}

async function enqueueMatchingRuns(event: Release3LifecycleEventEnvelope, projection: RetentionProjectionState | null) {
  const customerId = event.customerId ?? (event.subjectKind === "customer" ? event.subjectId : undefined);
  if (!customerId || !projection) return;
  const [definitions, control] = await Promise.all([
    orgRef(event.organizationId).collection("release3AutomationDefinitions").limit(100).get(),
    controlRef(event.organizationId).get(),
  ]);
  const paused = !control.exists || control.data()?.paused !== false;
  const now = new Date().toISOString();
  const candidates = definitions.docs
    .map((doc) => doc.data()?.publishedDefinition as AutomationDefinitionV3 | undefined)
    .filter((definition): definition is AutomationDefinitionV3 => Boolean(definition))
    .filter((definition) => definition.organizationId === event.organizationId && definition.enabled && definition.trigger.eventType === event.eventType)
    .filter((definition) => definition.mode === event.dataMode);

  for (const definition of candidates) {
    const runId = [event.organizationId, customerId, definition.id, definition.version, event.eventId].join(":");
    const reference = runRef(event.organizationId, runId);
    const dueAt = new Date(Date.parse(event.occurredAt) + Math.max(0, definition.delayMinutes ?? 0) * 60_000).toISOString();
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(reference);
      if (existing.exists) return;
      const run: Release3RunRecord = {
        runId,
        organizationId: event.organizationId,
        customerId,
        dataMode: definition.mode,
        automationId: definition.id,
        automationVersion: definition.version,
        triggerId: event.eventId,
        triggerEventType: event.eventType,
        definition,
        state: paused ? "held" : "scheduled",
        reasons: paused ? ["organization-paused"] : [],
        createdAt: now,
        dueAt,
        updatedAt: now,
        effectIds: [],
      };
      transaction.create(reference, run);
    });
  }
}

/**
 * Release 3 consumes only the durable lifecycle event stream. Browser-observed data
 * can enter that stream only through existing trusted adapters, and the projection
 * contract rejects browser authority for subscription/payment/cancellation facts.
 */
export const r3ProjectLifecycleEvent = onDocumentCreated("organizations/{organizationId}/lifecycleEvents/{eventId}", async (event) => {
  const organizationId = event.params.organizationId;
  const value = event.data?.data();
  if (!eventLooksProjectable(value, organizationId)) return;
  const projection = await updateProjection(value);
  await enqueueMatchingRuns(value, projection);
});

async function loadPublishedDefinition(run: Release3RunRecord) {
  const snapshot = await orgRef(run.organizationId).collection("release3AutomationDefinitions").doc(run.automationId).get();
  const record = snapshot.data();
  const definition = record?.publishedDefinition as AutomationDefinitionV3 | undefined;
  if (!definition || definition.version !== run.automationVersion || definition.organizationId !== run.organizationId) return null;
  return definition;
}

async function executeRun(snapshot: FirebaseFirestore.QueryDocumentSnapshot) {
  const run = snapshot.data() as Release3RunRecord;
  if (run.state !== "scheduled" && run.state !== "retrying") return;
  const [control, definition, projectionSnapshot] = await Promise.all([
    controlRef(run.organizationId).get(),
    loadPublishedDefinition(run),
    projectionRef(run.organizationId, run.customerId, run.dataMode).get(),
  ]);
  const now = new Date().toISOString();
  if (!control.exists || control.data()?.paused !== false) {
    await snapshot.ref.set({ state: "held", reasons: ["organization-paused"], updatedAt: now }, { merge: true });
    return;
  }
  if (!definition || !definition.enabled) {
    await snapshot.ref.set({ state: "suppressed", reasons: ["superseded"], updatedAt: now }, { merge: true });
    return;
  }
  if (!projectionSnapshot.exists) {
    await snapshot.ref.set({ state: "held", reasons: ["unknown-required-fact"], updatedAt: now }, { merge: true });
    return;
  }

  const projection = projectionSnapshot.data() as RetentionProjectionState;
  const facts = [
    { key: "subscription.state" as const, value: projection.commercial.subscriptionState, observedAt: now, provenance: projection.commercial.provenance ?? { source: "projection" as const, occurredAt: now, schemaVersion: 1 } },
    { key: "payment.health" as const, value: projection.commercial.paymentHealth, observedAt: now, provenance: projection.commercial.provenance ?? { source: "projection" as const, occurredAt: now, schemaVersion: 1 } },
    { key: "cancellation.status" as const, value: projection.commercial.cancellation.status, observedAt: now, provenance: projection.commercial.cancellation.provenance ?? { source: "projection" as const, occurredAt: now, schemaVersion: 1 } },
    { key: "engagement.state" as const, value: projection.engagement.state, observedAt: now, provenance: projection.engagement.provenance ?? { source: "projection" as const, occurredAt: now, schemaVersion: 1 } },
  ];
  if (projection.commercial.offerId) facts.push({ key: "subscription.offer_id" as const, value: projection.commercial.offerId, observedAt: now, provenance: projection.commercial.provenance ?? { source: "projection" as const, occurredAt: now, schemaVersion: 1 } });
  if (projection.lastMilestone) facts.push({ key: "experience.milestone" as const, value: projection.lastMilestone, observedAt: now, provenance: projection.engagement.provenance ?? { source: "projection" as const, occurredAt: now, schemaVersion: 1 } });

  const effects = planEffects({ definition, customerId: run.customerId, triggerId: run.triggerId, facts });
  if (effects.length === 0) {
    await snapshot.ref.set({ state: "suppressed", reasons: ["unknown-required-fact"], updatedAt: now }, { merge: true });
    return;
  }
  await snapshot.ref.set({ state: "executing", reasons: [], effectIds: effects.map((effect) => effect.effectId), updatedAt: now }, { merge: true });

  let heldReason: string | null = null;
  for (const effect of effects) {
    const reference = effectRef(run.organizationId, effect.effectId);
    const existing = await reference.get();
    if (existing.exists && existing.data()?.state === "confirmed") continue;

    if (effect.action.type === "email") {
      // Release 3 does not enable outbound lifecycle campaigns. Email remains a
      // durable, inspectable intent until a later approved release composes a sender.
      await reference.set({ effectId: effect.effectId, runId: run.runId, organizationId: run.organizationId, customerId: run.customerId, action: effect.action, state: "pending", reversible: true, reason: "channel-not-ready", updatedAt: now }, { merge: false });
      heldReason = "channel-not-ready";
      continue;
    }

    if (effect.action.type === "commercial-handoff") {
      // A handoff records an offer/capability request only. It never mutates billing
      // or entitlements; those remain provider/server authoritative.
      await reference.set({ effectId: effect.effectId, runId: run.runId, organizationId: run.organizationId, customerId: run.customerId, action: effect.action, state: "confirmed", reversible: false, confirmedAt: now, updatedAt: now }, { merge: false });
      continue;
    }

    if (control.data()?.inAppEnabled !== true) {
      await reference.set({ effectId: effect.effectId, runId: run.runId, organizationId: run.organizationId, customerId: run.customerId, action: effect.action, state: "pending", reversible: true, reason: "channel-not-ready", updatedAt: now }, { merge: false });
      heldReason = "channel-not-ready";
      continue;
    }

    const template = await orgRef(run.organizationId).collection("release3InAppTemplates").doc(`${effect.action.templateId}__v${effect.action.templateVersion}`).get();
    const templateData = template.data();
    if (!template.exists || templateData?.status !== "published" || typeof templateData.title !== "string" || typeof templateData.body !== "string") {
      await reference.set({ effectId: effect.effectId, runId: run.runId, organizationId: run.organizationId, customerId: run.customerId, action: effect.action, state: "pending", reversible: true, reason: "channel-not-ready", updatedAt: now }, { merge: false });
      heldReason = "channel-not-ready";
      continue;
    }
    const intent: InAppTreatmentIntent = {
      treatmentId: effect.effectId,
      runId: run.runId,
      organizationId: run.organizationId,
      customerId: run.customerId,
      placementId: effect.action.placementId,
      templateId: effect.action.templateId,
      templateVersion: effect.action.templateVersion,
      title: templateData.title,
      body: templateData.body,
      ...(templateData.cta && typeof templateData.cta === "object" ? { cta: templateData.cta } : {}),
      purpose: effect.action.purpose,
      availableFrom: now,
      ...(typeof templateData.expiresAt === "string" ? { expiresAt: templateData.expiresAt } : {}),
      mode: run.dataMode,
    };
    await putInAppTreatmentIntent(intent);
    await reference.set({ effectId: effect.effectId, runId: run.runId, organizationId: run.organizationId, customerId: run.customerId, action: effect.action, state: "confirmed", reversible: true, confirmedAt: now, updatedAt: now }, { merge: false });
  }

  await snapshot.ref.set({ state: heldReason ? "held" : "succeeded", reasons: heldReason ? [heldReason] : [], completedAt: heldReason ? null : now, updatedAt: now }, { merge: true });
}

/** Durable Release 3 worker. The highest-risk channel (email) is hard-held here. */
export const r3DrainLifecycleRuns = onSchedule("every 5 minutes", async () => {
  const now = new Date().toISOString();
  const due = await db.collectionGroup("release3Runs").where("state", "in", ["scheduled", "retrying"]).where("dueAt", "<=", now).orderBy("dueAt", "asc").limit(50).get();
  for (const snapshot of due.docs) await executeRun(snapshot);
});
