import { createHash } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../firebase.js";
import { assertOrganizationCapability } from "../billing/store.js";
import { validateLifecycleEventEnvelope } from "../../../shared/analytics/core.js";
import type { LifecycleEventEnvelope } from "../../../shared/analytics/contracts.js";
import type { SubscriptionSnapshot } from "../../../shared/billing/contracts.js";
import type { AnalyticsReport, MeasurementInput, MetricQuery, SourceCoverage } from "../../../shared/analytics/measurement/contracts.js";
import { METRICS_BY_ID, CALCULATION_VERSION, REGISTRY_VERSION } from "../../../shared/analytics/measurement/registry.js";
import { isUtc } from "../../../shared/analytics/measurement/engine.js";
import { release5Gate } from "../../../shared/analytics/measurement/release.js";
import { AnalyticsError, queryAnalytics, rebuildAnalytics, type AnalyticsPorts } from "./service.js";

const MAX_EVENTS = 10_000;
const MAX_SUBSCRIPTIONS = 2_000;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Bounded replay of the canonical event store, NOT another raw event store. */
async function readSources(query: MetricQuery): Promise<MeasurementInput> {
  const startedAt = new Date().toISOString();
  const definitions = query.metricIds.map((id) => METRICS_BY_ID.get(id)!);
  const sources = new Set(definitions.flatMap((d) => [...d.sources]));
  const types = new Set(definitions.flatMap((d) => [...d.selectors.map((s) => s.eventType), ...(d.outcome ? [d.outcome.eventType] : [])]));
  const org = db.collection("organizations").doc(query.organizationId);
  // Controls are server-managed; there is deliberately no client configuration write endpoint.
  const control = await db.collection("_analyticsControls").doc(query.organizationId).get();
  const data = control.data();
  const coverage: Record<string, SourceCoverage> = {};
  if (data?.acceptedR4Sha === release5Gate().acceptedR4Sha && data?.registryVersion === REGISTRY_VERSION) {
    const candidate = data?.modes?.[query.dataMode]?.coverage ?? {};
    for (const source of sources) if (candidate[source]) coverage[source] = candidate[source] as SourceCoverage;
  }
  const needsEvents = types.size > 0 && [...types].some((type) => coverage[type]);
  let rejected = 0, truncated = false;
  const events: LifecycleEventEnvelope[] = [];
  if (needsEvents) {
    const hasCohort = definitions.some((d) => d.timeBasis === "cohort-entry");
    const upper = new Date(Math.min(Date.parse(startedAt), Date.parse(query.to) + (hasCohort ? query.observationDays * 86_400_000 : 0))).toISOString();
    // Single-field range avoids an undeployed composite index. All scans are bounded.
    const rows = await org.collection("lifecycleEvents").where("occurredAt", ">=", query.from).where("occurredAt", "<", upper).orderBy("occurredAt").limit(MAX_EVENTS + 1).get();
    truncated = rows.size > MAX_EVENTS;
    for (const doc of rows.docs.slice(0, MAX_EVENTS)) {
      const raw = doc.data();
      if (raw.dataMode !== query.dataMode || !types.has(raw.eventType)) continue;
      if (raw.organizationId !== query.organizationId) { rejected++; continue; }
      try { events.push(validateLifecycleEventEnvelope(raw)); } catch { rejected++; }
    }
  }
  const input: MeasurementInput = { events, coverage, rejected, truncated, calculatedAt: new Date().toISOString() };
  if (sources.has("subscriptions.current") && coverage["subscriptions.current"]) {
    const rows = await org.collection("subscriptions").limit(MAX_SUBSCRIPTIONS + 1).get();
    let complete = rows.size <= MAX_SUBSCRIPTIONS;
    const records: SubscriptionSnapshot[] = [];
    for (const doc of rows.docs.slice(0, MAX_SUBSCRIPTIONS)) {
      const raw = doc.data();
      // Old snapshots without an explicit trusted mode are NOT guessed to be live or test.
      if (raw.dataMode !== "live" && raw.dataMode !== "test") { complete = false; continue; }
      if (raw.dataMode !== query.dataMode) continue;
      if (raw.organizationId !== query.organizationId || !isUtc(raw.trustedAt) || typeof raw.id !== "string" || typeof raw.currency !== "string") { complete = false; continue; }
      records.push(raw as SubscriptionSnapshot);
    }
    const observedAt = rows.readTime.toDate().toISOString();
    input.currentSubscriptions = { organizationId: query.organizationId, dataMode: query.dataMode, observedAt, complete, records };
    input.calculatedAt = new Date().toISOString();
  }
  // R4's verified link reader, historical commercial snapshots and future source mappings
  // must be bound against its accepted SHA. Do not infer email links or fabricate snapshots.
  delete coverage["identity.links"];
  delete coverage["subscriptions.opening"];
  delete coverage["subscriptions.closing"];
  return input;
}
async function saveDerived(report: AnalyticsReport, uid: string, requestId: string) {
  const { organizationId } = report.query;
  const id = hash({ query: report.query, registry: REGISTRY_VERSION, calculation: CALCULATION_VERSION });
  const ref = db.collection("_analyticsMaterializations").doc(organizationId).collection("results").doc(id);
  const receipt = db.collection("_analyticsMaterializations").doc(organizationId).collection("rebuilds").doc(hash({ uid, requestId }));
  const audit = db.collection("organizations").doc(organizationId).collection("auditEvents").doc(`analytics-${hash({ uid, requestId })}`);
  return db.runTransaction(async (transaction) => {
    const priorReceipt = await transaction.get(receipt);
    if (priorReceipt.exists) {
      if (priorReceipt.data()?.queryHash !== id) throw new HttpsError("already-exists", "Rebuild request ID was used for a different query.");
      return { id, written: false };
    }
    const prior = await transaction.get(ref);
    if (prior.exists && prior.data()!.calculatedAt > report.calculatedAt) return { id, written: false };
    transaction.set(ref, { ...report, schemaVersion: 1, organizationId, id });
    transaction.create(receipt, { organizationId, queryHash: id, createdAt: report.calculatedAt, actorId: uid });
    transaction.create(audit, {
      id: audit.id, schemaVersion: 1, action: "analytics.materialization.rebuilt",
      scope: { kind: "organization", organizationId }, actor: { kind: "user", id: uid },
      target: { type: "analyticsMaterialization", id, organizationId },
      occurredAt: report.calculatedAt, receivedAt: report.calculatedAt, source: "cloud-function",
      metadata: { metricCount: report.results.length, dataMode: report.query.dataMode, registryVersion: REGISTRY_VERSION },
    });
    return { id, written: true };
  });
}
const ports: AnalyticsPorts = { authorize: assertOrganizationCapability, gate: release5Gate, read: readSources, saveDerived, now: () => new Date().toISOString() };
async function boundary<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (e) {
    if (e instanceof AnalyticsError) throw new HttpsError(e.code, e.message);
    if (e instanceof HttpsError) throw e;
    // Do not disclose tenant IDs, private payloads or provider errors in client errors/logs.
    throw new HttpsError("internal", "Analytics could not be read. No operational state was changed.");
  }
}
export const queryOrganizationAnalytics = onCall({ enforceAppCheck: true, maxInstances: 5, timeoutSeconds: 60 }, (request) => boundary(() => queryAnalytics(request.data, request.auth?.uid, ports)));
export const rebuildOrganizationAnalytics = onCall({ enforceAppCheck: true, maxInstances: 2, timeoutSeconds: 120 }, (request) => boundary(() => rebuildAnalytics(request.data, request.auth?.uid, ports)));
