import type { LifecycleEventEnvelope } from "../contracts.js";
import type { Dimension, EventSelector, MeasurementInput, MetricDefinition, MetricQuery, MetricResult, SubscriptionReadSet } from "./contracts.js";
import { CALCULATION_VERSION, METRICS_BY_ID, REGISTRY_VERSION } from "./registry.js";

const DAY = 86_400_000;
const SUBSCRIPTION_STATUSES = new Set(["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,159}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export function isUtc(value: unknown): value is string {
  return typeof value === "string" && ISO.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error("Unsupported query field.");
}
export function parseMetricQuery(value: unknown): MetricQuery {
  const q = record(value);
  onlyKeys(q, ["organizationId", "from", "to", "dataMode", "metricIds", "filters", "currency", "observationDays"]);
  if (typeof q.organizationId !== "string" || !ID.test(q.organizationId)) throw new Error("Invalid organization ID.");
  if (!isUtc(q.from) || !isUtc(q.to) || q.from >= q.to || Date.parse(q.to) - Date.parse(q.from) > 93 * DAY) throw new Error("Use a valid UTC range of at most 93 days.");
  if (q.dataMode !== "live" && q.dataMode !== "test") throw new Error("Select live or test data explicitly.");
  if (!Array.isArray(q.metricIds) || !q.metricIds.length || q.metricIds.length > 64 || q.metricIds.some((id) => typeof id !== "string" || !METRICS_BY_ID.has(id))) throw new Error("Select between 1 and 64 registered metrics.");
  if (new Set(q.metricIds).size !== q.metricIds.length) throw new Error("Duplicate metric IDs.");
  const filters = record(q.filters ?? {});
  const allowed = ["offerId", "experienceId", "experienceModuleId", "experienceModuleVersion", "automationId", "automationVersion", "surveyId", "surveyVersion", "referralProgramId", "referralProgramVersion", "acquisitionSource"];
  onlyKeys(filters, allowed);
  if (Object.values(filters).some((v) => typeof v !== "string" || !ID.test(v))) throw new Error("Invalid dimension value.");
  for (const metricId of q.metricIds as string[]) {
    const metric = METRICS_BY_ID.get(metricId)!;
    if (Object.keys(filters).some((key) => !metric.dimensions.includes(key as Dimension))) throw new Error(`A selected filter is unsupported by ${metricId}.`);
  }
  if (q.currency !== undefined && (typeof q.currency !== "string" || !/^[A-Z]{3}$/.test(q.currency))) throw new Error("Currency must be a three-letter uppercase code.");
  const observationDays = q.observationDays ?? 7;
  if (typeof observationDays !== "number" || !Number.isInteger(observationDays) || observationDays < 1 || observationDays > 90) throw new Error("Observation window must be 1–90 days.");
  return { organizationId: q.organizationId, from: q.from, to: q.to, dataMode: q.dataMode, metricIds: [...q.metricIds] as string[], filters: Object.fromEntries(Object.entries(filters).sort()) as MetricQuery["filters"], ...(q.currency ? { currency: q.currency as string } : {}), observationDays };
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function fingerprint(e: LifecycleEventEnvelope) {
  // Transport receipt/event IDs can differ on replay; semantic content may not.
  const { eventId: _id, receivedAt: _receipt, ...semantic } = e;
  return stable(semantic);
}
function dimension(e: LifecycleEventEnvelope, key: Dimension): unknown {
  return key in e ? e[key as keyof LifecycleEventEnvelope] : e.payload[key];
}
function match(e: LifecycleEventEnvelope, selector: EventSelector): boolean {
  return e.eventType === selector.eventType && selector.sources.includes(e.source) && Object.entries(selector.where ?? {}).every(([key, value]) => e.payload[key] === value);
}
function selected(e: LifecycleEventEnvelope, filters: MetricQuery["filters"]): boolean {
  return Object.entries(filters).every(([key, value]) => String(dimension(e, key as Dimension) ?? "") === value);
}
function isUnavailable(result: MetricResult): boolean { return result.status === "unavailable"; }
function activeSet(set: SubscriptionReadSet | undefined, q: MetricQuery, at: string, currency: boolean) {
  if (!set || set.organizationId !== q.organizationId || set.dataMode !== q.dataMode || !set.complete || set.observedAt !== at) return null;
  const ids = new Map<string, SubscriptionReadSet["records"][number]>();
  for (const s of set.records) {
    if (s.organizationId !== q.organizationId || !s.id || !isUtc(s.trustedAt) || s.trustedAt > at || ids.has(s.id) || !SUBSCRIPTION_STATUSES.has(s.status) || typeof s.currency !== "string" || !/^[a-zA-Z]{3}$/.test(s.currency) || typeof s.offerId !== "string") return null;
    ids.set(s.id, s);
  }
  return new Map([...ids].filter(([, s]) => s.status === "active" && (!q.filters.offerId || s.offerId === q.filters.offerId) && (!currency || s.currency.toUpperCase() === q.currency)));
}
export function calculateMetrics(q: MetricQuery, input: MeasurementInput): MetricResult[] {
  // All public callers must use the same strict parser, including rebuilds and tests.
  q = parseMetricQuery(q);
  if (!isUtc(input.calculatedAt)) throw new Error("Invalid calculation time.");
  const now = Date.parse(input.calculatedAt);
  const from = Date.parse(q.from), to = Date.parse(q.to);
  const requestedIds = new Set(q.metricIds);
  const wantedTypes = new Set(q.metricIds.flatMap((id) => [...METRICS_BY_ID.get(id)!.selectors.map((s) => s.eventType), ...(METRICS_BY_ID.get(id)!.outcome ? [METRICS_BY_ID.get(id)!.outcome!.eventType] : [])]));
  let duplicates = 0, conflicting = 0, rejected = input.rejected ?? 0;
  const eventIds = new Map<string, string>(), keys = new Map<string, LifecycleEventEnvelope>(), conflictKeys = new Set<string>();
  for (const e of input.events) {
    // The reader validates the canonical envelope. This is a second tenant/mode/time guard.
    if (e.organizationId !== q.organizationId || e.dataMode !== q.dataMode) continue;
    if (!wantedTypes.has(e.eventType)) continue;
    if (!isUtc(e.occurredAt) || !isUtc(e.receivedAt) || Date.parse(e.receivedAt) > now || Date.parse(e.occurredAt) > now || !e.eventId || !e.idempotencyKey || !e.payload || typeof e.payload !== "object") { rejected++; continue; }
    const key = `${e.eventType}:${e.idempotencyKey}`;
    const priorKey = eventIds.get(e.eventId);
    if (priorKey && priorKey !== key) { conflictKeys.add(priorKey); conflictKeys.add(key); continue; }
    eventIds.set(e.eventId, key);
    const existing = keys.get(key);
    if (existing) {
      if (fingerprint(existing) !== fingerprint(e)) conflictKeys.add(key);
      else duplicates++;
    } else keys.set(key, e);
  }
  conflicting = conflictKeys.size;
  const events = [...keys].filter(([key]) => !conflictKeys.has(key)).map(([, e]) => e).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
  const links = new Map<string, string | null>();
  for (const link of input.links ?? []) {
    if (link.organizationId !== q.organizationId || link.dataMode !== q.dataMode) continue;
    const key = `${link.subjectKind}:${link.subjectId}`;
    if (links.has(key) && links.get(key) !== link.customerId) links.set(key, null);
    else links.set(key, link.customerId);
  }
  const subjectKey = (e: LifecycleEventEnvelope, metric: MetricDefinition): string | null => {
    const field = metric.subject === "transaction" ? "ledgerEntryId" : metric.subject === "invitation" ? "invitationId" : metric.subject === "referral" ? "referralId" : metric.subject === "communication" ? "communicationId" : metric.subject === "run" ? "runId" : metric.subject === "subscription" ? "subscriptionId" : null;
    if (metric.subject === "event") return e.eventId;
    if (field) {
      const val = e.payload[field] ?? (e.subjectKind === metric.subject ? e.subjectId : undefined);
      return typeof val === "string" && val.length ? `${metric.subject}:${val}` : null;
    }
    if (metric.subject === "lead") return e.subjectKind === "lead" && e.subjectId ? `lead:${e.subjectId}` : null;
    if (metric.subject === "identity") return e.identityId ? `identity:${e.identityId}` : e.subjectKind === "identity" && e.subjectId ? `identity:${e.subjectId}` : null;
    if (metric.subject === "visitor") return e.subjectKind === "visitor" && e.subjectId ? `visitor:${e.subjectId}` : e.sessionId ? `session:${e.sessionId}` : null;
    if (e.customerId) return `customer:${e.customerId}`;
    if (e.subjectKind === "customer" && e.subjectId) return `customer:${e.subjectId}`;
    const linked = links.get(`${e.subjectKind}:${e.subjectId}`);
    return linked ? `customer:${linked}` : null;
  };
  return [...requestedIds].map((metricId) => {
    const d = METRICS_BY_ID.get(metricId)!;
    const cohort = d.calculation === "cohort-rate" || d.calculation === "median-duration";
    const requiredTo = new Date(Math.min(now, to + (cohort ? q.observationDays * DAY : 0))).toISOString();
    const r: MetricResult = {
      definition: d, status: "available", value: null, numerator: null, denominator: null,
      currency: d.unit.startsWith("minor") ? q.currency ?? null : null, from: q.from, to: q.to, dataMode: q.dataMode,
      calculatedAt: input.calculatedAt, sourceThrough: null, snapshotAt: null, observationDays: cohort ? q.observationDays : null, pendingSubjects: 0, reasons: [],
      quality: { rejected, duplicates, conflicting, truncated: Boolean(input.truncated) },
      lineage: { registryVersion: REGISTRY_VERSION, calculationVersion: CALCULATION_VERSION, sources: d.sources, filters: q.filters, sourceRecordCount: 0 },
    };
    const partial = (reason: string) => { if (r.status !== "unavailable") r.status = "partial"; if (!r.reasons.includes(reason)) r.reasons.push(reason); };
    const unavailable = (reason: string) => { r.status = "unavailable"; r.value = null; r.reasons.push(reason); };
    const through: string[] = [];
    for (const source of d.sources) {
      const coverage = input.coverage[source];
      if (!coverage || coverage.organizationId !== q.organizationId || coverage.dataMode !== q.dataMode || coverage.bindingVersion !== 1 || !isUtc(coverage.from) || !isUtc(coverage.through) || !isUtc(coverage.checkedAt) || coverage.from > coverage.through || coverage.through > input.calculatedAt || coverage.checkedAt > input.calculatedAt) { unavailable(`Source mapping or coverage unavailable: ${source}.`); continue; }
      through.push(coverage.through);
      if (!coverage.complete || (d.timeBasis !== "current-snapshot" && (coverage.from > q.from || coverage.through < requiredTo))) partial(`Incomplete coverage: ${source}.`);
      if (now - Date.parse(coverage.checkedAt) > 60 * 60_000 && r.status === "available") { r.status = "stale"; r.reasons.push(`Source validation is older than one hour: ${source}.`); }
    }
    r.sourceThrough = through.length ? through.sort()[0] : null;
    if (input.truncated) partial("Bounded read limit reached; this is not the complete population.");
    if (rejected || conflicting) partial("Rejected or conflicting source records require reconciliation.");
    if (q.to > input.calculatedAt && d.timeBasis !== "current-snapshot") partial("The requested period has not ended.");
    if (d.unit.startsWith("minor") && !q.currency) unavailable("Select one currency; unlike currencies are never summed.");
    if (isUnavailable(r)) return r;

    if (["current-mrr", "current-subscriptions", "churn", "retention"].includes(d.calculation)) {
      const at = input.currentSubscriptions?.observedAt ?? input.calculatedAt;
      const current = activeSet(input.currentSubscriptions, q, at, d.calculation === "current-mrr");
      if (d.timeBasis === "current-snapshot") {
        if (!current || !isUtc(at) || at > input.calculatedAt) { unavailable("A complete trusted current subscription snapshot is required."); return r; }
        r.snapshotAt = at;
        if (now - Date.parse(at) > 60 * 60_000) { if (r.status === "available") r.status = "stale"; r.reasons.push("Current subscription snapshot is older than one hour."); }
        r.lineage.sourceRecordCount = current.size;
        if (d.calculation === "current-subscriptions") r.value = r.numerator = current.size;
        else {
          let twelfths = 0;
          for (const s of current.values()) {
            if (!Number.isSafeInteger(s.unitAmountMinor) || s.unitAmountMinor < 0 || !["month", "year"].includes(s.billingInterval)) { unavailable("An active subscription has invalid fixed-plan pricing."); return r; }
            twelfths += s.unitAmountMinor * (s.billingInterval === "month" ? 12 : 1);
            if (!Number.isSafeInteger(twelfths)) { unavailable("Amount exceeds safe integer precision."); return r; }
          }
          r.numerator = twelfths; r.denominator = 12; r.value = Math.round(twelfths / 12);
        }
      } else {
        const opening = activeSet(input.openingSubscriptions, q, q.from, false);
        const closing = activeSet(input.closingSubscriptions, q, q.to, false);
        if (!opening || !closing) { unavailable("Complete opening and closing as-of subscription snapshots are required; cancellation counts are insufficient."); return r; }
        const retained = [...opening.keys()].filter((id) => closing.has(id)).length;
        r.denominator = opening.size; r.numerator = d.calculation === "churn" ? opening.size - retained : retained;
        r.value = opening.size ? r.numerator / opening.size * 100 : null;
        r.lineage.sourceRecordCount = opening.size + closing.size;
        if (!opening.size) r.reasons.push("No eligible opening population; rate is undefined, not zero.");
      }
      return r;
    }
    const candidates = events.filter((e) => d.selectors.some((s) => e.eventType === s.eventType) && e.occurredAt >= q.from && e.occurredAt < q.to);
    // Record missing mappings instead of turning omitted dimensions/keys into plausible zeros.
    for (const e of candidates) {
      if (!d.selectors.some((s) => e.eventType === s.eventType && s.sources.includes(e.source))) { partial("Untrusted source excluded."); continue; }
      if (Object.keys(q.filters).some((key) => dimension(e, key as Dimension) === undefined)) partial("Some entry records lack the selected dimension.");
    }
    const rows = candidates.filter((e) => d.selectors.some((s) => match(e, s)) && selected(e, q.filters));
    const keyed = new Map<string, LifecycleEventEnvelope>();
    for (const e of rows) {
      const key = subjectKey(e, d);
      if (!key) { partial("Some records lack the required trusted subject/link key."); continue; }
      if (!keyed.has(key)) keyed.set(key, e);
      else if (["sum", "net-collected", "nps"].includes(d.calculation)) {
        const prior = keyed.get(key)!;
        if (prior.payload[d.valueField!] !== e.payload[d.valueField!] || prior.payload.currency !== e.payload.currency || prior.eventType !== e.eventType) {
          unavailable("Conflicting values for one ledger entry or survey invitation; reconciliation required.");
        }
      }
    }
    r.lineage.sourceRecordCount = rows.length;
    if (isUnavailable(r)) return r;
    if (d.calculation === "count") { r.value = r.numerator = keyed.size; return r; }
    if (cohort) {
      const outcomes = events.filter((e) => d.outcome && match(e, d.outcome));
      const outcomeMap = new Map<string, LifecycleEventEnvelope[]>();
      for (const e of outcomes) {
        const key = subjectKey(e, d);
        if (key) outcomeMap.set(key, [...(outcomeMap.get(key) ?? []), e]);
      }
      const times: number[] = [];
      const observedThrough = Math.min(now, r.sourceThrough ? Date.parse(r.sourceThrough) : now);
      for (const [key, entry] of keyed) {
        const deadline = Date.parse(entry.occurredAt) + q.observationDays * DAY;
        if (deadline > observedThrough) r.pendingSubjects++;
        const outcome = outcomeMap.get(key)?.find((e) => e.occurredAt >= entry.occurredAt && Date.parse(e.occurredAt) < deadline);
        if (outcome) times.push((Date.parse(outcome.occurredAt) - Date.parse(entry.occurredAt)) / 3_600_000);
      }
      r.numerator = times.length; r.denominator = keyed.size;
      if (r.pendingSubjects) partial("Cohort follow-up is incomplete; do not compare this as a final rate.");
      if (!keyed.size) r.reasons.push("No eligible entry population; rate is undefined, not zero.");
      if (d.calculation === "cohort-rate") r.value = keyed.size && !r.pendingSubjects ? times.length / keyed.size * 100 : null;
      else {
        times.sort((a, b) => a - b);
        const mid = Math.floor(times.length / 2);
        r.value = times.length ? times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2 : null;
      }
      return r;
    }
    if (d.calculation === "nps") {
      let promoters = 0, detractors = 0, valid = 0;
      for (const e of keyed.values()) {
        const score = e.payload[d.valueField!];
        if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 10) { partial("Invalid NPS answer excluded."); continue; }
        valid++; if (score >= 9) promoters++; else if (score <= 6) detractors++;
      }
      r.numerator = promoters - detractors; r.denominator = valid; r.value = valid ? r.numerator / valid * 100 : null;
      if (!valid) r.reasons.push("No valid NPS responses; score is undefined, not zero.");
      return r;
    }
    let total = 0, accepted = 0;
    for (const e of keyed.values()) {
      if (typeof e.payload.currency !== "string") { partial("Financial record lacks currency."); continue; }
      if (e.payload.currency.toUpperCase() !== q.currency) continue;
      const amount = e.payload[d.valueField!];
      if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) { partial("Invalid monetary amount excluded."); continue; }
      total += amount * (d.calculation === "net-collected" && String(e.eventType) === "payment.refunded" ? -1 : 1);
      if (!Number.isSafeInteger(total)) { unavailable("Amount exceeds safe integer precision."); return r; }
      accepted++;
    }
    r.value = r.numerator = total; r.lineage.sourceRecordCount = accepted;
    return r;
  });
}
