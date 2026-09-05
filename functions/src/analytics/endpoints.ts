import { createHash } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../firebase.js";
import { assertOrganizationCapability } from "../billing/store.js";
import { validateLifecycleEventEnvelope } from "../../../shared/analytics/core.js";
import type { LifecycleEventEnvelope, LifecycleEventSource } from "../../../shared/analytics/contracts.js";
import type { AnalyticsReport, MeasurementEvent, MeasurementInput, MeasurementSubscriptionSnapshot, MetricQuery, SourceCoverage, VerifiedSubjectLink } from "../../../shared/analytics/measurement/contracts.js";
import { METRICS_BY_ID, CALCULATION_VERSION, REGISTRY_VERSION } from "../../../shared/analytics/measurement/registry.js";
import { isUtc } from "../../../shared/analytics/measurement/engine.js";
import { release5Gate } from "../../../shared/analytics/measurement/release.js";
import { AnalyticsError, queryAnalytics, rebuildAnalytics, type AnalyticsPorts } from "./service.js";

const MAX_EVENTS = 10_000;
const MAX_HISTORY_EVENTS = 10_000;
const MAX_SUBSCRIPTIONS = 2_000;
const MAX_CUSTOMERS = 5_000;
const MAX_RUNTIME_RECORDS = 5_000;
const MAX_SURVEY_RESPONSES = 5_000;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rec = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const str = (value: unknown) => typeof value === "string" && value.length ? value : undefined;
const num = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
function orgRef(organizationId: string) { return db.collection("organizations").doc(organizationId); }
function measurementEvent(input: {
  eventType: string; eventId: string; organizationId: string; dataMode: MetricQuery["dataMode"]; occurredAt: string;
  customerId?: string; subjectId?: string; subjectKind?: MeasurementEvent["subjectKind"]; offerId?: string; payload?: Record<string, unknown>; source?: LifecycleEventSource;
}): MeasurementEvent {
  return {
    eventId: input.eventId, eventType: input.eventType, schemaVersion: 1, organizationId: input.organizationId,
    ...(input.subjectId && input.subjectKind ? { subjectId: input.subjectId, subjectKind: input.subjectKind } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}), ...(input.offerId ? { offerId: input.offerId } : {}),
    occurredAt: input.occurredAt, receivedAt: input.occurredAt, source: input.source ?? "trusted_server",
    correlationId: input.eventId, idempotencyKey: input.eventId, dataMode: input.dataMode,
    payload: (input.payload ?? {}) as MeasurementEvent["payload"],
  };
}
function completeCoverage(query: MetricQuery, from: string, through: string, checkedAt: string, complete: boolean): SourceCoverage {
  return { organizationId: query.organizationId, dataMode: query.dataMode, bindingVersion: 1, from, through, checkedAt, complete };
}
function anonymousCalendarMonth(from: string, to: string) {
  const start = new Date(from);
  if (!isUtc(from) || !isUtc(to) || start.getUTCDate() !== 1 || start.getUTCHours() || start.getUTCMinutes() || start.getUTCSeconds() || start.getUTCMilliseconds()) return false;
  return to === new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)).toISOString();
}
function subscriptionFromRaw(raw: Record<string, unknown>, organizationId: string): MeasurementSubscriptionSnapshot | null {
  const id = str(raw.id) ?? str(raw.providerSubscriptionId); const offerId = str(raw.offerId); const billingInterval = raw.billingInterval; const currency = str(raw.currency); const amount = num(raw.unitAmountMinor); const status = str(raw.status); const trustedAt = str(raw.trustedAt) ?? str(raw.updatedAt);
  if (!id || !offerId || (billingInterval !== "month" && billingInterval !== "year") || !currency || amount === undefined || amount < 0 || !status || !["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"].includes(status) || !trustedAt || !isUtc(trustedAt)) return null;
  return { id, organizationId, offerId, billingInterval, currency, unitAmountMinor: amount, status: status as MeasurementSubscriptionSnapshot["status"], trustedAt };
}
function reconstructSubscriptions(history: readonly LifecycleEventEnvelope[], organizationId: string, at: string) {
  const state = new Map<string, MeasurementSubscriptionSnapshot>(); let valid = true;
  for (const event of history) {
    if (event.occurredAt > at || !["subscription.started", "subscription.updated", "subscription.renewed", "subscription.cancelled"].includes(event.eventType)) continue;
    const id = str(event.payload.subscriptionId) ?? (event.subjectKind === "subscription" ? event.subjectId : undefined); if (!id) { valid = false; continue; }
    const prior = state.get(id); const status = event.eventType === "subscription.cancelled" ? "canceled" : str(event.payload.status) ?? prior?.status;
    const billingInterval = event.payload.billingInterval === "month" || event.payload.billingInterval === "year" ? event.payload.billingInterval : prior?.billingInterval;
    const currency = str(event.payload.currency) ?? prior?.currency; const amount = num(event.payload.unitAmountMinor) ?? prior?.unitAmountMinor; const offerId = event.offerId ?? prior?.offerId;
    if (!status || !["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"].includes(status) || !billingInterval || !currency || amount === undefined || !offerId) { valid = false; continue; }
    state.set(id, { id, organizationId, offerId, billingInterval, currency, unitAmountMinor: amount, status: status as MeasurementSubscriptionSnapshot["status"], trustedAt: event.occurredAt });
  }
  return { records: [...state.values()], valid };
}

/** Bounded replay of accepted canonical stores. Derived adapter facts exist only in memory. */
async function readSources(query: MetricQuery): Promise<MeasurementInput> {
  const calculatedAt = new Date().toISOString();
  const definitions = query.metricIds.map((id) => METRICS_BY_ID.get(id)!);
  const sources = new Set(definitions.flatMap((d) => [...d.sources]));
  const selectorTypes = new Set(definitions.flatMap((d) => [...d.selectors.map((s) => s.eventType), ...(d.outcome ? [d.outcome.eventType] : [])]));
  const org = orgRef(query.organizationId); const coverage: Record<string, SourceCoverage> = {}; const events: MeasurementEvent[] = []; const links: VerifiedSubjectLink[] = [];
  const cohort = definitions.some((d) => d.timeBasis === "cohort-entry"); const upper = new Date(Math.min(Date.parse(calculatedAt), Date.parse(query.to) + (cohort ? query.observationDays * 86_400_000 : 0))).toISOString();
  let rejected = 0; let truncated = false;
  let openingSubscriptions: MeasurementInput["openingSubscriptions"];
  let closingSubscriptions: MeasurementInput["closingSubscriptions"];

  const lifecycleTypes = new Set([...selectorTypes].filter((type) => !type.startsWith("measurement.")));
  if (lifecycleTypes.size) {
    const rows = await org.collection("lifecycleEvents").where("occurredAt", ">=", query.from).where("occurredAt", "<", upper).orderBy("occurredAt").limit(MAX_EVENTS + 1).get();
    const limited = rows.size > MAX_EVENTS; truncated ||= limited; const bad = new Set<string>();
    for (const doc of rows.docs.slice(0, MAX_EVENTS)) {
      const raw = doc.data(); if (raw.dataMode !== query.dataMode || !lifecycleTypes.has(String(raw.eventType))) continue;
      if (raw.organizationId !== query.organizationId) { bad.add(String(raw.eventType)); rejected++; continue; }
      try { events.push(validateLifecycleEventEnvelope(raw)); } catch { bad.add(String(raw.eventType)); rejected++; }
    }
    for (const type of lifecycleTypes) coverage[type] = completeCoverage(query, query.from, upper, calculatedAt, !limited && !bad.has(type));
  }

  const referralTypes = [...lifecycleTypes].filter((type) => type.startsWith("referral."));
  if (referralTypes.length) {
    const rows = await org.collection("feedbackModes").doc(query.dataMode).collection("referralAttributions").limit(MAX_RUNTIME_RECORDS + 1).get();
    let complete = rows.size <= MAX_RUNTIME_RECORDS; const attributions = new Map<string, { programId: string; versionId: string }>();
    for (const doc of rows.docs.slice(0, MAX_RUNTIME_RECORDS)) {
      const raw = doc.data(); const id = str(raw.id) ?? doc.id; const programId = str(raw.programId); const versionId = str(raw.versionId);
      if (!id || !programId || !versionId) { complete = false; continue; }
      attributions.set(id, { programId, versionId });
    }
    for (let i = 0; i < events.length; i++) {
      const current = events[i]; if (!current.eventType.startsWith("referral.")) continue;
      const referralId = str(current.payload.referralId); const attribution = referralId ? attributions.get(referralId) : undefined;
      if (!referralId || !attribution) { complete = false; continue; }
      events[i] = { ...current, payload: { ...current.payload, programId: attribution.programId, versionId: attribution.versionId } };
    }
    for (const type of referralTypes) if (coverage[type]) coverage[type] = { ...coverage[type], complete: coverage[type].complete && complete };
  }

  if (sources.has("identity.links")) {
    const rows = await org.collection("customers").limit(MAX_CUSTOMERS + 1).get(); let complete = rows.size <= MAX_CUSTOMERS;
    for (const doc of rows.docs.slice(0, MAX_CUSTOMERS)) {
      const raw = doc.data(); if (raw.status !== "active") continue;
      if (raw.dataMode !== "live" && raw.dataMode !== "test") { complete = false; continue; }
      if (raw.dataMode !== query.dataMode) continue;
      const customerId = str(raw.customerId) ?? doc.id; const identityId = str(raw.identityId); const leadId = str(raw.linkedLeadId);
      if (!customerId || !identityId) { complete = false; continue; }
      links.push({ organizationId: query.organizationId, dataMode: query.dataMode, subjectKind: "identity", subjectId: identityId, customerId });
      if (leadId) links.push({ organizationId: query.organizationId, dataMode: query.dataMode, subjectKind: "lead", subjectId: leadId, customerId });
    }
    coverage["identity.links"] = completeCoverage(query, query.from, upper, calculatedAt, complete);
  }

  const needAcquisition = sources.has("measurement.acquisition.enrollment_created") || sources.has("measurement.communication.attempted");
  const acquisitionMap = new Map<string, Record<string, unknown>>();
  if (needAcquisition) {
    const rows = await org.collection("acquisitionEnrollments").limit(MAX_RUNTIME_RECORDS + 1).get(); const complete = rows.size <= MAX_RUNTIME_RECORDS;
    for (const doc of rows.docs.slice(0, MAX_RUNTIME_RECORDS)) {
      const raw = doc.data(); const createdAt = str(raw.createdAt); const enrollmentId = str(raw.enrollmentId); if (!createdAt || !enrollmentId || raw.dataMode !== query.dataMode) continue;
      acquisitionMap.set(enrollmentId, raw);
      if (createdAt >= query.from && createdAt < upper) events.push(measurementEvent({ eventType: "measurement.acquisition.enrollment_created", eventId: `m-acq-${doc.id}`, organizationId: query.organizationId, dataMode: query.dataMode, occurredAt: createdAt, customerId: str(raw.customerId), subjectId: str(raw.customerId) ?? str(raw.leadId) ?? str(raw.subjectId), subjectKind: str(raw.customerId) ? "customer" : "lead", payload: { runId: enrollmentId, automationId: str(raw.automationId) ?? "unknown", automationVersion: str(raw.automationVersionId) ?? "unknown" } }));
    }
    if (sources.has("measurement.acquisition.enrollment_created")) coverage["measurement.acquisition.enrollment_created"] = completeCoverage(query, query.from, upper, calculatedAt, complete);
  }

  const needRuns = [...sources].some((item) => item.startsWith("measurement.r3.")) || sources.has("measurement.communication.attempted");
  const runMap = new Map<string, Record<string, unknown>>(); let runsComplete = true;
  if (needRuns) {
    const rows = await org.collection("release3Runs").limit(MAX_RUNTIME_RECORDS + 1).get(); runsComplete = rows.size <= MAX_RUNTIME_RECORDS;
    for (const doc of rows.docs.slice(0, MAX_RUNTIME_RECORDS)) {
      const raw = doc.data(); const runId = str(raw.runId); if (!runId || raw.dataMode !== query.dataMode) continue; runMap.set(runId, raw);
      const createdAt = str(raw.createdAt); const updatedAt = str(raw.updatedAt) ?? createdAt; const customerId = str(raw.customerId); const automationId = str(raw.automationId); const automationVersion = num(raw.automationVersion); const definition = rec(raw.definition);
      const payload = { runId, automationId: automationId ?? "unknown", automationVersion: automationVersion ?? 0 };
      if (createdAt && createdAt >= query.from && createdAt < upper) {
        events.push(measurementEvent({ eventType: "measurement.r3.run_created", eventId: `m-r3-created-${doc.id}`, organizationId: query.organizationId, dataMode: query.dataMode, occurredAt: createdAt, customerId, subjectId: customerId, subjectKind: "customer", payload }));
        if (definition?.kind === "win-back") events.push(measurementEvent({ eventType: "measurement.r3.winback_enrolled", eventId: `m-r3-winback-${doc.id}`, organizationId: query.organizationId, dataMode: query.dataMode, occurredAt: createdAt, customerId, subjectId: customerId, subjectKind: "customer", payload }));
      }
      if (updatedAt && updatedAt >= query.from && updatedAt < upper && raw.state === "suppressed") events.push(measurementEvent({ eventType: "measurement.r3.run_suppressed", eventId: `m-r3-suppressed-${doc.id}`, organizationId: query.organizationId, dataMode: query.dataMode, occurredAt: updatedAt, customerId, subjectId: customerId, subjectKind: "customer", payload }));
      if (updatedAt && updatedAt >= query.from && updatedAt < upper && raw.state === "cancelled") events.push(measurementEvent({ eventType: "measurement.r3.run_cancelled", eventId: `m-r3-cancelled-${doc.id}`, organizationId: query.organizationId, dataMode: query.dataMode, occurredAt: updatedAt, customerId, subjectId: customerId, subjectKind: "customer", payload }));
    }
    for (const type of ["measurement.r3.run_created", "measurement.r3.run_suppressed", "measurement.r3.run_cancelled", "measurement.r3.winback_enrolled"]) if (sources.has(type)) coverage[type] = completeCoverage(query, query.from, upper, calculatedAt, runsComplete);
  }

  if (sources.has("measurement.r3.in_app_acted")) {
    const rows = await org.collection("inAppTreatmentInteractions").limit(MAX_RUNTIME_RECORDS + 1).get(); let complete = rows.size <= MAX_RUNTIME_RECORDS && runsComplete;
    for (const doc of rows.docs.slice(0, MAX_RUNTIME_RECORDS)) {
      const raw = doc.data(); if (raw.interaction !== "acted") continue; const runId = str(raw.runId); const occurredAt = str(raw.occurredAt); const customerId = str(raw.customerId); const run = runId ? runMap.get(runId) : undefined;
      if (!run || run.dataMode !== query.dataMode) { complete = false; continue; }
      if (!occurredAt || occurredAt < query.from || occurredAt >= upper) continue;
      events.push(measurementEvent({ eventType: "measurement.r3.in_app_acted", eventId: `m-r3-acted-${doc.id}`, organizationId: query.organizationId, dataMode: query.dataMode, occurredAt, customerId, subjectId: customerId, subjectKind: "customer", payload: { runId: runId!, automationId: str(run.automationId) ?? "unknown", automationVersion: num(run.automationVersion) ?? 0, treatmentId: str(raw.treatmentId) ?? doc.id } }));
    }
    coverage["measurement.r3.in_app_acted"] = completeCoverage(query, query.from, upper, calculatedAt, complete);
  }

  if (sources.has("measurement.communication.attempted")) {
    const rows = await org.collection("communicationMessages").limit(MAX_RUNTIME_RECORDS + 1).get(); const complete = rows.size <= MAX_RUNTIME_RECORDS;
    for (const doc of rows.docs.slice(0, MAX_RUNTIME_RECORDS)) {
      const raw = doc.data(); const intent = rec(raw.intent); const attempts = Array.isArray(raw.attempts) ? raw.attempts.map(rec).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
      if (!intent || intent.mode !== query.dataMode || !attempts.length) continue; const occurredAt = str(attempts[0].startedAt); if (!occurredAt || occurredAt < query.from || occurredAt >= upper) continue;
      const recipient = rec(intent.recipient); const customerId = recipient?.kind === "customer" ? str(recipient.id) : undefined; const trigger = rec(intent.trigger); const runId = str(trigger?.runId); const run = runId ? runMap.get(runId) ?? acquisitionMap.get(runId) : undefined;
      events.push(measurementEvent({ eventType: "measurement.communication.attempted", eventId: `m-message-${doc.id}`, organizationId: query.organizationId, dataMode: query.dataMode, occurredAt, customerId, subjectId: customerId ?? query.organizationId, subjectKind: customerId ? "customer" : "organization", payload: { communicationId: str(intent.messageId) ?? doc.id, ...(runId ? { runId } : {}), ...(str(run?.automationId) ? { automationId: str(run?.automationId)! } : {}), ...(num(run?.automationVersion) !== undefined ? { automationVersion: num(run?.automationVersion)! } : str(run?.automationVersionId) ? { automationVersion: str(run?.automationVersionId)! } : {}) } }));
    }
    coverage["measurement.communication.attempted"] = completeCoverage(query, query.from, upper, calculatedAt, complete);
  }

  if (sources.has("measurement.survey.nps_response")) {
    const versionId = query.filters.surveyVersion!; const mode = org.collection("feedbackModes").doc(query.dataMode); const versionSnap = await mode.collection("surveyVersions").doc(versionId).get(); const version = versionSnap.data(); const draft = rec(version?.value); let complete = versionSnap.exists && draft?.kind === "nps" && (draft.privacy === "identified" || draft.privacy === "anonymous") && Array.isArray(draft.questions);
    const question = complete ? (draft!.questions as unknown[]).map(rec).find((item) => item?.type === "nps" && typeof item.id === "string") : undefined;
    const policySnap = await org.collection("release4FeedbackControl").doc("global").get(); const minimumRaw = Number(policySnap.data()?.minimumAnonymousResponses ?? 5); const minimum = Number.isSafeInteger(minimumRaw) && minimumRaw >= 5 && minimumRaw <= 100 ? minimumRaw : 5;
    const rows = complete ? await mode.collection("surveyResponses").where("versionId", "==", versionId).limit(MAX_SURVEY_RESPONSES + 1).get() : null; if (rows && rows.size > MAX_SURVEY_RESPONSES) complete = false;
    const anonymousWindowValid = draft?.privacy !== "anonymous" || anonymousCalendarMonth(query.from, query.to);
    for (const doc of rows?.docs.slice(0, MAX_SURVEY_RESPONSES) ?? []) {
      const raw = doc.data(); if (raw.versionId !== versionId || raw.privacy !== draft?.privacy || !question) { complete = false; continue; }
      const answers = rec(raw.answers); const score = answers?.[question.id as string]; if (typeof score !== "number" || !Number.isInteger(score)) { complete = false; continue; }
      const customerId = draft?.privacy === "identified" ? str(raw.customerId) : undefined; const receivedAt = typeof raw.receivedAt === "number" && Number.isFinite(raw.receivedAt) ? new Date(raw.receivedAt).toISOString() : typeof raw.receivedDay === "string" ? `${raw.receivedDay}T12:00:00.000Z` : undefined; if (!receivedAt || !isUtc(receivedAt)) { complete = false; continue; }
      events.push(measurementEvent({ eventType: "measurement.survey.nps_response", eventId: `m-nps-${doc.id}`, organizationId: query.organizationId, dataMode: query.dataMode, occurredAt: receivedAt, customerId, subjectId: customerId ?? query.organizationId, subjectKind: customerId ? "customer" : "organization", payload: { surveyId: str(raw.surveyId) ?? str(version?.entityId) ?? "unknown", versionId, surveyVersion: versionId, npsScore: score, privacy: draft?.privacy as string, minimumAnonymousResponses: minimum, anonymousWindowValid } }));
    }
    coverage["measurement.survey.nps_response"] = completeCoverage(query, query.from, upper, calculatedAt, complete);
  }

  const needHistory = sources.has("measurement.retention.reactivated") || sources.has("subscriptions.opening") || sources.has("subscriptions.closing");
  if (needHistory) {
    const rows = await org.collection("lifecycleEvents").where("occurredAt", "<", upper).orderBy("occurredAt", "desc").limit(MAX_HISTORY_EVENTS + 1).get(); const historyTruncated = rows.size > MAX_HISTORY_EVENTS; truncated ||= historyTruncated; const history: LifecycleEventEnvelope[] = []; let historyValid = !historyTruncated;
    for (const doc of rows.docs.slice(0, MAX_HISTORY_EVENTS).reverse()) {
      const raw = doc.data(); if (raw.dataMode !== query.dataMode) continue;
      if (!["experience.inactive", "experience.milestone_reached", "subscription.started", "subscription.updated", "subscription.renewed", "subscription.cancelled"].includes(String(raw.eventType))) continue;
      try { history.push(validateLifecycleEventEnvelope(raw)); } catch { historyValid = false; rejected++; }
    }
    if (sources.has("measurement.retention.reactivated")) {
      const inactive = new Map<string, string>();
      for (const event of history) {
        const customerId = event.customerId ?? (event.subjectKind === "customer" ? event.subjectId : undefined); if (!customerId) continue;
        if (event.eventType === "experience.inactive") inactive.set(customerId, event.occurredAt);
        if (event.eventType === "experience.milestone_reached" && inactive.has(customerId) && event.occurredAt >= inactive.get(customerId)!) {
          events.push(measurementEvent({ eventType: "measurement.retention.reactivated", eventId: `m-reactivated-${event.eventId}`, organizationId: query.organizationId, dataMode: query.dataMode, occurredAt: event.occurredAt, customerId, subjectId: customerId, subjectKind: "customer", offerId: event.offerId, payload: { sourceEventId: event.eventId } })); inactive.delete(customerId);
        }
      }
      coverage["measurement.retention.reactivated"] = completeCoverage(query, query.from, upper, calculatedAt, historyValid);
    }
    if (sources.has("subscriptions.opening") || sources.has("subscriptions.closing")) {
      const opening = reconstructSubscriptions(history, query.organizationId, query.from); const closing = reconstructSubscriptions(history, query.organizationId, query.to); const complete = historyValid && opening.valid && closing.valid;
      if (sources.has("subscriptions.opening")) coverage["subscriptions.opening"] = completeCoverage(query, query.from, query.to, calculatedAt, complete);
      if (sources.has("subscriptions.closing")) coverage["subscriptions.closing"] = completeCoverage(query, query.from, query.to, calculatedAt, complete);
      openingSubscriptions = { organizationId: query.organizationId, dataMode: query.dataMode, observedAt: query.from, complete, records: opening.records };
      closingSubscriptions = { organizationId: query.organizationId, dataMode: query.dataMode, observedAt: query.to, complete, records: closing.records };
    }
  }

  let currentSubscriptions: MeasurementInput["currentSubscriptions"];
  if (sources.has("subscriptions.current")) {
    const rows = await org.collection("subscriptions").limit(MAX_SUBSCRIPTIONS + 1).get(); let complete = rows.size <= MAX_SUBSCRIPTIONS && query.dataMode === "test"; const records: MeasurementSubscriptionSnapshot[] = [];
    for (const doc of rows.docs.slice(0, MAX_SUBSCRIPTIONS)) {
      const parsed = subscriptionFromRaw(doc.data(), query.organizationId); if (!parsed) { complete = false; continue; } records.push(parsed);
    }
    const observedAt = rows.readTime.toDate().toISOString(); currentSubscriptions = { organizationId: query.organizationId, dataMode: query.dataMode, observedAt, complete, records };
    coverage["subscriptions.current"] = completeCoverage(query, query.from, observedAt, calculatedAt, complete);
  }

  return { events, coverage, links, rejected, truncated, calculatedAt, ...(currentSubscriptions ? { currentSubscriptions } : {}), ...(openingSubscriptions ? { openingSubscriptions } : {}), ...(closingSubscriptions ? { closingSubscriptions } : {}) };
}

async function saveDerived(report: AnalyticsReport, uid: string, requestId: string) {
  const { organizationId } = report.query; const id = hash({ query: report.query, registry: REGISTRY_VERSION, calculation: CALCULATION_VERSION });
  const ref = db.collection("_analyticsMaterializations").doc(organizationId).collection("results").doc(id);
  const receipt = db.collection("_analyticsMaterializations").doc(organizationId).collection("rebuilds").doc(hash({ uid, requestId }));
  const audit = db.collection("organizations").doc(organizationId).collection("auditEvents").doc(`analytics-${hash({ uid, requestId })}`);
  return db.runTransaction(async (transaction) => {
    const priorReceipt = await transaction.get(receipt);
    if (priorReceipt.exists) { if (priorReceipt.data()?.queryHash !== id) throw new HttpsError("already-exists", "Rebuild request ID was used for a different query."); return { id, written: false }; }
    const prior = await transaction.get(ref); if (prior.exists && prior.data()!.calculatedAt > report.calculatedAt) return { id, written: false };
    transaction.set(ref, { ...report, schemaVersion: 1, organizationId, id });
    transaction.create(receipt, { organizationId, queryHash: id, createdAt: report.calculatedAt, actorId: uid });
    transaction.create(audit, { id: audit.id, schemaVersion: 1, action: "analytics.materialization.rebuilt", scope: { kind: "organization", organizationId }, actor: { kind: "user", id: uid }, target: { type: "analyticsMaterialization", id, organizationId }, occurredAt: report.calculatedAt, receivedAt: report.calculatedAt, source: "cloud-function", metadata: { metricCount: report.results.length, dataMode: report.query.dataMode, registryVersion: REGISTRY_VERSION } });
    return { id, written: true };
  });
}
const ports: AnalyticsPorts = { authorize: assertOrganizationCapability, gate: release5Gate, read: readSources, saveDerived, now: () => new Date().toISOString() };
async function boundary<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (e) {
    if (e instanceof AnalyticsError) throw new HttpsError(e.code, e.message); if (e instanceof HttpsError) throw e;
    throw new HttpsError("internal", "Analytics could not be read. No operational state was changed.");
  }
}
export const queryOrganizationAnalytics = onCall({ enforceAppCheck: true, maxInstances: 5, timeoutSeconds: 60 }, (request) => boundary(() => queryAnalytics(request.data, request.auth?.uid, ports)));
export const rebuildOrganizationAnalytics = onCall({ enforceAppCheck: true, maxInstances: 2, timeoutSeconds: 120 }, (request) => boundary(() => rebuildAnalytics(request.data, request.auth?.uid, ports)));
