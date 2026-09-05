import { createHash } from "node:crypto";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import type { CommercialOffer } from "../../../shared/billing/contracts.js";
import type { AuthoritativeCustomerDataMode } from "../../../shared/customer/contracts.js";
import type {
  AutomationDefinitionV3,
  InAppTreatmentInteraction,
  RecoveryCommand,
  SegmentFact,
} from "../../../shared/release3/contracts.js";
import { toCommercialServicingSummary } from "../../../shared/release3/commercial-servicing.js";
import { evaluateContactability } from "../../../shared/release3/customer-control.js";
import { evaluateRecoveryCommand, evaluateTreatmentAdmission } from "../../../shared/release3/runtime.js";
import { assertOrganizationCapability, getCurrentSubscriptionForCustomer, offerVersionRef } from "../billing/store.js";
import { loadInAppTreatmentIntent, recordInAppTreatmentInteraction } from "../communications/in-app.js";
import { getLifecycleCustomerPreferences, setLifecycleCustomerPreferences } from "../customer/release3-preferences.js";
import { getCustomerConsents, getOrganizationCustomer, type VerifiedCustomerPrincipal } from "../customer/store.js";
import { db } from "../firebase.js";

function objectData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request data must be an object.");
  return value as Record<string, unknown>;
}
function requiredId(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(value)) throw new HttpsError("invalid-argument", `${label} is invalid.`);
  return value;
}
function optionalId(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredId(value, label);
}
function dataMode(value: unknown): AuthoritativeCustomerDataMode {
  if (value === undefined || value === null || value === "") return "live";
  if (value === "live" || value === "test" || value === "development") return value;
  throw new HttpsError("invalid-argument", "dataMode is invalid.");
}
function principalFromRequest(request: CallableRequest<unknown>): VerifiedCustomerPrincipal {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
  const token = request.auth.token;
  return {
    identityId: request.auth.uid,
    email: typeof token.email === "string" ? token.email : null,
    emailVerified: token.email_verified === true,
    displayName: typeof token.name === "string" ? token.name : null,
    phone: typeof token.phone_number === "string" ? token.phone_number : null,
  };
}
function definitionRef(organizationId: string, automationId: string) {
  return db.collection("organizations").doc(organizationId).collection("release3AutomationDefinitions").doc(automationId);
}
function runtimeControlRef(organizationId: string) {
  return db.collection("organizations").doc(organizationId).collection("release3RuntimeControl").doc("global");
}
function cancellationRef(organizationId: string, customerId: string) {
  return db.collection("organizations").doc(organizationId).collection("customerCancellationRequests").doc(customerId);
}
function recoveryRef(organizationId: string, commandId: string) {
  return db.collection("organizations").doc(organizationId).collection("release3RecoveryCommands").doc(createHash("sha256").update(commandId).digest("hex"));
}
function lifecycleEventRef(organizationId: string, idempotencyKey: string) {
  const id = `r3-${createHash("sha256").update(`${organizationId}:${idempotencyKey}`).digest("hex")}`;
  return db.collection("organizations").doc(organizationId).collection("lifecycleEvents").doc(id);
}

function parseDefinition(value: unknown, organizationId: string): AutomationDefinitionV3 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "definition is required.");
  const definition = value as AutomationDefinitionV3;
  if (definition.organizationId !== organizationId) throw new HttpsError("permission-denied", "Definition organization scope mismatch.");
  requiredId(definition.id, "automationId");
  if (!Number.isInteger(definition.version) || definition.version < 1) throw new HttpsError("invalid-argument", "Definition version must be positive.");
  if (!definition.name?.trim() || !definition.trigger?.eventType?.trim()) throw new HttpsError("invalid-argument", "Definition name and trigger are required.");
  if (!Array.isArray(definition.branches) || definition.branches.length === 0 || definition.branches.some((branch) => !Array.isArray(branch.actions) || branch.actions.length === 0)) throw new HttpsError("invalid-argument", "Every definition requires at least one non-empty branch.");
  if (definition.branches.some((branch) => branch.actions.some((action) => !["email", "in-app", "commercial-handoff"].includes(action.type)))) throw new HttpsError("invalid-argument", "Definition contains an unsupported action.");
  return definition;
}

async function loadCommercial(organizationId: string, customerId: string) {
  const subscription = await getCurrentSubscriptionForCustomer(organizationId, customerId);
  let entitlementKeys: string[] = [];
  if (subscription && (subscription.status === "active" || subscription.status === "trialing") && (!subscription.currentPeriodEnd || Date.parse(subscription.currentPeriodEnd) > Date.now())) {
    const offerSnapshot = await offerVersionRef(organizationId, subscription.offerId, subscription.offerVersion).get();
    if (offerSnapshot.exists) {
      const offer = offerSnapshot.data() as CommercialOffer;
      entitlementKeys = Array.isArray(offer.capabilityKeys) ? offer.capabilityKeys.filter((key): key is string => typeof key === "string") : [];
    }
  }
  const cancellationSnapshot = await cancellationRef(organizationId, customerId).get();
  const cancellation = cancellationSnapshot.data() as { requestedAt?: string; effectiveAt?: string; accessEndsAt?: string } | undefined;
  return toCommercialServicingSummary({
    organizationId,
    customerId,
    subscription,
    entitlementKeys,
    cancellationRequestedAt: cancellation?.requestedAt,
    cancellationEffectiveAt: cancellation?.effectiveAt,
    accessEndsAt: cancellation?.accessEndsAt,
  });
}

async function serverFacts(organizationId: string, customerId: string, commercial: Awaited<ReturnType<typeof loadCommercial>>): Promise<SegmentFact[]> {
  const now = new Date().toISOString();
  const provenance = commercial.provenance ?? { source: "projection" as const, occurredAt: now, schemaVersion: 1 };
  const facts: SegmentFact[] = [
    { key: "subscription.state", value: commercial.subscriptionState, observedAt: now, provenance },
    { key: "payment.health", value: commercial.paymentHealth, observedAt: now, provenance },
    { key: "cancellation.status", value: commercial.cancellation.status, observedAt: now, provenance: commercial.cancellation.provenance ?? provenance },
  ];
  if (commercial.offerId) facts.push({ key: "subscription.offer_id", value: commercial.offerId, observedAt: now, provenance });
  for (const capability of commercial.entitlementKeys) facts.push({ key: "capability.present", value: capability, observedAt: now, provenance });
  const projection = await db.collection("organizations").doc(organizationId).collection("release3RetentionProjections").doc(customerId).get();
  const engagement = projection.data()?.engagement;
  if (engagement && typeof engagement === "object" && typeof engagement.state === "string") {
    facts.push({ key: "engagement.state", value: engagement.state, observedAt: now, provenance: { source: "projection", occurredAt: now, schemaVersion: 1 } });
    if (engagement.state === "inactive" && typeof engagement.inactiveSince === "string") facts.push({ key: "engagement.inactive_hours", value: Math.max(0, (Date.now() - Date.parse(engagement.inactiveSince)) / 3_600_000), observedAt: now, provenance: { source: "projection", occurredAt: now, schemaVersion: 1 } });
  } else {
    facts.push({ key: "engagement.state", value: "unknown", observedAt: now, provenance: { source: "projection", occurredAt: now, schemaVersion: 1 } });
  }
  return facts;
}

export const r3GetLifecycleStudio = onCall(async (request) => {
  const data = objectData(request.data);
  const organizationId = requiredId(data.organizationId, "organizationId");
  const actor = principalFromRequest(request).identityId;
  await assertOrganizationCapability(organizationId, actor, "lifecycle.view");
  const [definitions, control] = await Promise.all([
    db.collection("organizations").doc(organizationId).collection("release3AutomationDefinitions").limit(100).get(),
    runtimeControlRef(organizationId).get(),
  ]);
  return {
    definitions: definitions.docs.map((doc) => doc.data()),
    runtimeControl: control.exists ? control.data() : { paused: true, emailEnabled: false, inAppEnabled: false, policyVersion: 1 },
  };
});

export const r3SaveAutomationDraft = onCall(async (request) => {
  const data = objectData(request.data);
  const organizationId = requiredId(data.organizationId, "organizationId");
  const actor = principalFromRequest(request).identityId;
  await assertOrganizationCapability(organizationId, actor, "lifecycle.manage");
  const definition = parseDefinition(data.definition, organizationId);
  const now = new Date().toISOString();
  const reference = definitionRef(organizationId, definition.id);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const existing = snapshot.data() as { publishedVersion?: number; draftVersion?: number } | undefined;
    if (existing?.publishedVersion && definition.version <= existing.publishedVersion) throw new HttpsError("failed-precondition", "Published versions are immutable; save a higher draft version.");
    if (existing?.draftVersion && definition.version < existing.draftVersion) throw new HttpsError("aborted", "A newer draft already exists.");
    transaction.set(reference, {
      organizationId,
      automationId: definition.id,
      draftVersion: definition.version,
      draftDefinition: definition,
      publishedVersion: existing?.publishedVersion ?? null,
      updatedAt: now,
      updatedBy: actor,
      schemaVersion: 1,
    }, { merge: true });
  });
  return { version: definition.version, savedAt: now };
});

export const r3PublishAutomationDefinition = onCall(async (request) => {
  const data = objectData(request.data);
  const organizationId = requiredId(data.organizationId, "organizationId");
  const automationId = requiredId(data.automationId, "automationId");
  const expectedDraftVersion = Number(data.expectedDraftVersion);
  if (!Number.isInteger(expectedDraftVersion) || expectedDraftVersion < 1) throw new HttpsError("invalid-argument", "expectedDraftVersion is invalid.");
  const actor = principalFromRequest(request).identityId;
  await assertOrganizationCapability(organizationId, actor, "lifecycle.manage");
  const reference = definitionRef(organizationId, automationId);
  const now = new Date().toISOString();
  let publishedVersion = 0;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new HttpsError("not-found", "Lifecycle draft was not found.");
    const record = snapshot.data() as { draftVersion?: number; draftDefinition?: AutomationDefinitionV3; publishedVersion?: number };
    if (record.draftVersion !== expectedDraftVersion || !record.draftDefinition) throw new HttpsError("aborted", "Lifecycle draft changed before publish.");
    const definition = parseDefinition(record.draftDefinition, organizationId);
    if (record.publishedVersion && definition.version <= record.publishedVersion) throw new HttpsError("failed-precondition", "Published versions are immutable.");
    publishedVersion = definition.version;
    transaction.set(reference, {
      publishedVersion,
      publishedDefinition: definition,
      publishedAt: now,
      publishedBy: actor,
      updatedAt: now,
    }, { merge: true });
  });
  return { publishedVersion, publishedAt: now };
});

export const r3DryRunAutomationDefinition = onCall(async (request) => {
  const data = objectData(request.data);
  const organizationId = requiredId(data.organizationId, "organizationId");
  const customerId = requiredId(data.customerId, "customerId");
  const actor = principalFromRequest(request).identityId;
  await assertOrganizationCapability(organizationId, actor, "lifecycle.view");
  const definition = parseDefinition(data.definition, organizationId);
  const [commercial, control, consents, preferences] = await Promise.all([
    loadCommercial(organizationId, customerId),
    runtimeControlRef(organizationId).get(),
    db.collection("organizations").doc(organizationId).collection("communicationConsents").where("subjectKind", "==", "customer").where("subjectId", "==", customerId).limit(50).get(),
    db.collection("organizations").doc(organizationId).collection("customerLifecyclePreferences").doc(customerId).get(),
  ]);
  const now = new Date().toISOString();
  const facts = await serverFacts(organizationId, customerId, commercial);
  const emailAction = definition.branches.flatMap((branch) => branch.actions).find((action) => action.type === "email");
  const purpose = emailAction?.type === "email" ? emailAction.purpose : "transactional";
  const contactability = evaluateContactability({
    organizationId,
    customerId,
    channel: "email",
    purpose,
    consentFacts: consents.docs.map((doc) => doc.data()) as Parameters<typeof evaluateContactability>[0]["consentFacts"],
    channelReady: control.data()?.emailEnabled === true,
    timezone: typeof preferences.data()?.timezone === "string" ? preferences.data()?.timezone : undefined,
    quietHours: preferences.data()?.quietHours,
    checkedAt: now,
  });
  const decision = evaluateTreatmentAdmission(definition, {
    now,
    organizationPaused: !control.exists || control.data()?.paused !== false,
    automationPaused: false,
    facts,
    contactability,
    commercial,
    priorRuns: [],
    competingRuns: [],
  });
  return { eligible: decision.allowed, reasons: decision.reasons, decision, facts, commercial };
});

export const r3SetLifecycleRuntimeControl = onCall(async (request) => {
  const data = objectData(request.data);
  const organizationId = requiredId(data.organizationId, "organizationId");
  const actor = principalFromRequest(request).identityId;
  await assertOrganizationCapability(organizationId, actor, "lifecycle.manage");
  if (typeof data.paused !== "boolean") throw new HttpsError("invalid-argument", "paused must be boolean.");
  if (data.emailEnabled !== undefined && typeof data.emailEnabled !== "boolean") throw new HttpsError("invalid-argument", "emailEnabled must be boolean.");
  if (data.inAppEnabled !== undefined && typeof data.inAppEnabled !== "boolean") throw new HttpsError("invalid-argument", "inAppEnabled must be boolean.");
  const prior = await runtimeControlRef(organizationId).get();
  const now = new Date().toISOString();
  const next = {
    paused: data.paused,
    // Email is deliberately opt-in and defaults false. SMS has no Release 3 action contract.
    emailEnabled: data.emailEnabled === true,
    inAppEnabled: data.inAppEnabled === true,
    policyVersion: Number(prior.data()?.policyVersion ?? 0) + 1,
    updatedAt: now,
    updatedBy: actor,
  };
  await runtimeControlRef(organizationId).set(next, { merge: false });
  return next;
});

export const r3ExecuteRecoveryCommand = onCall(async (request) => {
  const data = objectData(request.data);
  const command = data.command as RecoveryCommand | undefined;
  if (!command || typeof command !== "object") throw new HttpsError("invalid-argument", "command is required.");
  const organizationId = requiredId(command.organizationId, "organizationId");
  const actor = principalFromRequest(request).identityId;
  await assertOrganizationCapability(organizationId, actor, "lifecycle.manage");
  let knownEffect: { effectId: string; state: "pending" | "submitted" | "confirmed" | "failed" | "ambiguous"; reversible: boolean } | undefined;
  if (command.effectId) {
    const effect = await db.collection("organizations").doc(organizationId).collection("release3Effects").doc(createHash("sha256").update(command.effectId).digest("hex")).get();
    const effectData = effect.data();
    if (effect.exists && typeof effectData?.effectId === "string" && ["pending", "submitted", "confirmed", "failed", "ambiguous"].includes(effectData.state)) knownEffect = { effectId: effectData.effectId, state: effectData.state, reversible: effectData.reversible === true };
  }
  const result = evaluateRecoveryCommand({ command, knownEffect, authorized: true });
  const now = new Date().toISOString();
  await recoveryRef(organizationId, result.commandId).set({ command, result, actorIdentityId: actor, createdAt: now }, { merge: false });
  if (result.accepted && command.runId && (command.type === "cancel-run" || command.type === "re-evaluate")) {
    const run = db.collection("organizations").doc(organizationId).collection("release3Runs").doc(createHash("sha256").update(command.runId).digest("hex"));
    await run.set({ state: command.type === "cancel-run" ? "cancelled" : "scheduled", updatedAt: now, recoveryCommandId: result.commandId }, { merge: true });
  }
  return result;
});

export const r3GetCustomerLifecycleControl = onCall(async (request) => {
  const data = objectData(request.data);
  const organizationId = requiredId(data.organizationId, "organizationId");
  const customerId = requiredId(data.customerId, "customerId");
  const mode = dataMode(data.dataMode);
  const principal = principalFromRequest(request);
  const [preferences, consents, cancellation] = await Promise.all([
    getLifecycleCustomerPreferences({ organizationId, customerId, dataMode: mode, principal }),
    getCustomerConsents(organizationId, customerId, mode, principal),
    cancellationRef(organizationId, customerId).get(),
  ]);
  const cancellationData = cancellation.data();
  return {
    preferences,
    consents,
    cancellation: cancellation.exists ? {
      status: cancellationData?.status ?? "requested",
      requestedAt: cancellationData?.requestedAt,
      effectiveAt: cancellationData?.effectiveAt,
      accessEndsAt: cancellationData?.accessEndsAt,
    } : { status: "none" },
  };
});

export const r3SetCustomerLifecyclePreferences = onCall(async (request) => {
  const data = objectData(request.data);
  const organizationId = requiredId(data.organizationId, "organizationId");
  const customerId = requiredId(data.customerId, "customerId");
  const principal = principalFromRequest(request);
  const quietHours = data.quietHours && typeof data.quietHours === "object" && !Array.isArray(data.quietHours)
    ? data.quietHours as { startLocal: string; endLocal: string }
    : undefined;
  return setLifecycleCustomerPreferences({
    organizationId,
    customerId,
    dataMode: dataMode(data.dataMode),
    timezone: typeof data.timezone === "string" ? data.timezone : undefined,
    quietHours,
    idempotencyKey: requiredId(data.idempotencyKey, "idempotencyKey"),
    principal,
  });
});

export const r3RequestCancellation = onCall(async (request) => {
  const data = objectData(request.data);
  const organizationId = requiredId(data.organizationId, "organizationId");
  const customerId = requiredId(data.customerId, "customerId");
  const mode = dataMode(data.dataMode);
  const idempotencyKey = requiredId(data.idempotencyKey, "idempotencyKey");
  const principal = principalFromRequest(request);
  await getOrganizationCustomer(organizationId, customerId, mode, principal);
  const reference = cancellationRef(organizationId, customerId);
  const eventReference = lifecycleEventRef(organizationId, `subscription.cancellation_requested:${customerId}:${idempotencyKey}`);
  const now = new Date().toISOString();
  let requestId = "";
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(reference);
    if (existing.exists && existing.data()?.idempotencyKey === idempotencyKey) {
      requestId = String(existing.data()?.requestId ?? "");
      return;
    }
    if (existing.exists && ["requested", "scheduled", "effective"].includes(existing.data()?.status)) throw new HttpsError("already-exists", "A cancellation request is already active.");
    requestId = `cancel_${createHash("sha256").update(`${organizationId}:${customerId}:${idempotencyKey}`).digest("hex").slice(0, 32)}`;
    transaction.set(reference, { organizationId, customerId, dataMode: mode, requestId, status: "requested", requestedAt: now, idempotencyKey, actorIdentityId: principal.identityId }, { merge: false });
    const eventSnapshot = await transaction.get(eventReference);
    if (!eventSnapshot.exists) transaction.create(eventReference, {
      eventId: eventReference.id,
      eventType: "subscription.cancellation_requested",
      schemaVersion: 1,
      organizationId,
      subjectId: customerId,
      subjectKind: "customer",
      customerId,
      identityId: principal.identityId,
      occurredAt: now,
      receivedAt: now,
      source: "domain_action",
      correlationId: requestId,
      idempotencyKey,
      dataMode: mode,
      payload: { requestId },
    });
  });
  return { requestId, status: "requested" as const };
});

export const r3GetInAppTreatment = onCall(async (request) => {
  const data = objectData(request.data);
  const organizationId = requiredId(data.organizationId, "organizationId");
  const customerId = requiredId(data.customerId, "customerId");
  const mode = dataMode(data.dataMode);
  await getOrganizationCustomer(organizationId, customerId, mode, principalFromRequest(request));
  const intent = await loadInAppTreatmentIntent({ organizationId, customerId, placementId: requiredId(data.placementId, "placementId"), mode, now: typeof data.now === "string" ? data.now : undefined });
  return { intent };
});

export const r3RecordInAppTreatmentInteraction = onCall(async (request) => {
  const data = objectData(request.data);
  const organizationId = requiredId(data.organizationId, "organizationId");
  const customerId = requiredId(data.customerId, "customerId");
  const mode = dataMode(data.dataMode);
  await getOrganizationCustomer(organizationId, customerId, mode, principalFromRequest(request));
  const interaction = data.interaction as InAppTreatmentInteraction | undefined;
  if (!interaction || interaction.organizationId !== organizationId || interaction.customerId !== customerId || !["presented", "dismissed", "acted"].includes(interaction.interaction)) throw new HttpsError("invalid-argument", "interaction is invalid.");
  const result = await recordInAppTreatmentInteraction(interaction);
  if (result.created) {
    const event = lifecycleEventRef(organizationId, `in-app:${interaction.idempotencyKey}`);
    await event.set({
      eventId: event.id,
      eventType: `treatment.in_app.${interaction.interaction}`,
      schemaVersion: 1,
      organizationId,
      subjectId: customerId,
      subjectKind: "customer",
      customerId,
      occurredAt: interaction.occurredAt,
      receivedAt: new Date().toISOString(),
      source: "domain_action",
      correlationId: interaction.runId,
      idempotencyKey: interaction.idempotencyKey,
      dataMode: mode,
      payload: { runId: interaction.runId, treatmentId: interaction.treatmentId },
    }, { merge: false });
  }
  return result;
});
