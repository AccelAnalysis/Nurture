import { useEffect, useMemo, useRef, useState } from "react";
import { useOrganization } from "../../../context/OrganizationContext";
import { useAuth } from "../../identity/auth";
import { METRIC_REGISTRY, LIFECYCLE_STAGES } from "../../../../shared/analytics/measurement/registry";
import type { AnalyticsReport, Dimension, MetricDefinition, MetricDomain, MetricQuery, MetricResult } from "../../../../shared/analytics/measurement/contracts";
import { loadOrganizationAnalytics } from "./client";
import "./analytics-workspace.css";

const domains: { value: MetricDomain; label: string }[] = [
  { value: "acquisition", label: "Acquisition" }, { value: "activation", label: "Activation" },
  { value: "experience", label: "Experience" }, { value: "commercial", label: "Commercial" },
  { value: "automation", label: "Automation / Communications" }, { value: "satisfaction", label: "Satisfaction" },
  { value: "referrals", label: "Referrals" }, { value: "retention", label: "Retention" },
];
function day(offset: number) { const date = new Date(); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); }
function number(value: number | null) { return value === null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value); }
export function metricDisplay(result: MetricResult | undefined): string {
  if (!result || result.status === "unavailable" || result.value === null) return "—";
  if (result.definition.unit.startsWith("minor")) {
    const currency = result.currency;
    if (!currency) return "—";
    try {
      const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency });
      const scale = 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2);
      return `${formatter.format(result.value / scale)}${result.definition.unit === "minor/month" ? " / month" : ""}`;
    } catch { return `${number(result.value)} ${currency} minor units`; }
  }
  return `${number(result.value)}${result.definition.unit === "percent" ? "%" : result.definition.unit === "hours" ? " hours" : ""}`;
}
function MetricCard({ definition: d, result }: { definition: MetricDefinition; result?: MetricResult }) {
  const versionScopeRequired = d.metricId === "satisfaction.nps" && !result;
  return <article className="r5-metric" aria-labelledby={`metric-${d.metricId}`}>
    <div className="r5-metric-header"><h3 id={`metric-${d.metricId}`}>{d.name}</h3><span className="r5-status">{versionScopeRequired ? "Scope required" : result?.status ?? "Not loaded"}</span></div>
    <p className="r5-value">{metricDisplay(result)}<span className="r5-unit">{d.unit === "count" ? "distinct " + d.subject + " keys" : d.unit === "score" ? "NPS points" : ""}</span></p>
    {versionScopeRequired ? <p>Select Satisfaction, choose the surveyVersion breakdown filter, and enter one published survey version to calculate NPS without mixing versions.</p> : null}
    {result && <p>{result.numerator !== null && <>Numerator: {number(result.numerator)}. </>}{result.denominator !== null && <>Denominator: {number(result.denominator)}.</>}</p>}
    {result?.pendingSubjects ? <p>{result.pendingSubjects} subject(s) still need follow-up. This is not a final cohort result.</p> : null}
    {result?.snapshotAt && <p>Snapshot: <time dateTime={result.snapshotAt}>{result.snapshotAt}</time>. Not the selected period’s revenue.</p>}
    {result && result.value === null && result.status !== "unavailable" && <p>No defined value for this population or observation window.</p>}
    {result?.reasons.length ? <div className="r5-reasons">{result.reasons.map((reason) => <p key={reason}>{reason}</p>)}</div> : null}
    <details><summary>Definition and data lineage</summary>
      <p>{d.description}</p>
      <dl className="r5-definition"><dt>Metric</dt><dd>{d.metricId} · version {d.version}</dd>
        <dt>Numerator</dt><dd>{d.numerator}</dd><dt>Denominator</dt><dd>{d.denominator ?? "Not a rate."}</dd>
        <dt>Time basis</dt><dd>{d.timeBasis}</dd><dt>Sources</dt><dd>{d.sources.join(", ")}</dd>
        <dt>Data through</dt><dd>{result?.sourceThrough ?? "No coverage confirmed"}</dd>
        <dt>Calculated</dt><dd>{result?.calculatedAt ?? "Not calculated"}</dd>
        <dt>Calculation version</dt><dd>{result?.lineage.calculationVersion ?? "Not loaded"}</dd>
        <dt>Source records</dt><dd>{result?.lineage.sourceRecordCount ?? "Not loaded"}</dd>
        <dt>Duplicates ignored</dt><dd>{result?.quality.duplicates ?? "Not loaded"}</dd>
        <dt>Rejected / conflicting</dt><dd>{result ? `${result.quality.rejected} / ${result.quality.conflicting}` : "Not loaded"}</dd>
        <dt>Read limited</dt><dd>{result ? result.quality.truncated ? "Yes — incomplete population" : "No" : "Not loaded"}</dd>
      </dl>
      {d.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}
    </details>
  </article>;
}
type WorkspaceProps = {
  organizationId: string;
  userId: string | null;
  isDemo: boolean;
  can: ReturnType<typeof useOrganization>["can"];
  load?: (query: MetricQuery) => Promise<AnalyticsReport>;
};
/** Pure presentation entry for isolated browser tests; production always uses the authorized wrapper below. */
export function AnalyticsWorkspaceView({ organizationId, userId, isDemo, can, load = loadOrganizationAnalytics }: WorkspaceProps) {
  const [domain, setDomain] = useState<MetricDomain | "all">("all");
  const [stage, setStage] = useState<string | null>(null);
  const [from, setFrom] = useState(day(-30)), [to, setTo] = useState(day(0));
  const [mode, setMode] = useState<"live" | "test">("live");
  const [currency, setCurrency] = useState("USD");
  const [observationDays, setObservationDays] = useState(7);
  const [filterKey, setFilterKey] = useState<Dimension | "">("");
  const [filterValue, setFilterValue] = useState("");
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; report?: AnalyticsReport; error?: string }>({ key: "" });
  const [loadingKey, setLoadingKey] = useState("");
  const serial = useRef(0);
  const selectedStage = LIFECYCLE_STAGES.find((s) => s.id === stage);
  const visible = METRIC_REGISTRY.filter((d) => (domain === "all" || d.domain === domain) && (!selectedStage || (selectedStage.metrics as readonly string[]).includes(d.metricId)) && d.permissions.every((capability) => can(capability, organizationId)));
  const allowedDimensions = visible.length ? visible[0].dimensions.filter((dimension) => visible.every((d) => d.dimensions.includes(dimension))) : [];
  const effectiveKey = filterKey && allowedDimensions.includes(filterKey) ? filterKey : "";
  const scopedMetricIds = visible
    .filter((definition) => definition.metricId !== "satisfaction.nps" || (effectiveKey === "surveyVersion" && Boolean(filterValue.trim())))
    .map((definition) => definition.metricId);
  const query = useMemo<MetricQuery>(() => ({ organizationId, from: `${from}T00:00:00.000Z`, to: `${to}T00:00:00.000Z`, dataMode: mode,
    metricIds: scopedMetricIds, filters: effectiveKey && filterValue ? { [effectiveKey]: filterValue.trim() } : {}, currency, observationDays,
  }), [organizationId, from, to, mode, scopedMetricIds.join("|"), effectiveKey, filterValue, currency, observationDays]);
  const key = JSON.stringify({ query, uid: userId, isDemo, reload });
  // Results from another tenant, account, mode or filter never render under the new heading.
  const report = loaded.key === key ? loaded.report : undefined;
  const error = loaded.key === key ? loaded.error : undefined;
  const loading = loadingKey === key;
  useEffect(() => {
    const ticket = ++serial.current;
    setLoadingKey("");
    if (!query.metricIds.length) { setLoaded({ key, error: "Your role or current scope does not grant a queryable metric. Select a required version scope where indicated." }); return; }
    if (isDemo) { setLoaded({ key, error: "Demo session: real analytics is unavailable. This workspace does not generate sample performance numbers." }); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from >= to || Date.parse(query.to) - Date.parse(query.from) > 93 * 86_400_000) { setLoaded({ key, error: "Choose an increasing UTC date range of at most 93 days." }); return; }
    setLoadingKey(key);
    const timer = window.setTimeout(() => {
      load(query).then((next) => {
        if (serial.current === ticket) setLoaded({ key, report: next });
      }).catch((failure: unknown) => {
        if (serial.current === ticket) setLoaded({ key, error: failure instanceof Error ? failure.message : "Analytics is unavailable. No results were loaded." });
      }).finally(() => { if (serial.current === ticket) setLoadingKey(""); });
    }, 200);
    return () => { window.clearTimeout(timer); serial.current++; };
  }, [key]);
  const results = new Map(report?.results.map((r) => [r.definition.metricId, r]) ?? []);
  return <section className="r5-workspace" aria-labelledby="analytics-title">
    <header><p className="r5-eyebrow">Organization insights</p><h1 id="analytics-title">Analytics</h1><p>Understand acquisition, meaningful use, commercial performance and lifecycle outcomes.</p>
      <p>UTC reporting · {mode === "live" ? "Live records only" : "Test records only — not production performance"} · No automatic changes to offers or campaigns.</p>
    </header>
    <section className="r5-stage-panel" aria-labelledby="lifecycle-map"><h2 id="lifecycle-map">Lifecycle view</h2><p>Overlapping activity measures, not mutually exclusive customer stages. Customers can enter, return and participate in more than one Experience.</p>
      <ol className="r5-stages">{LIFECYCLE_STAGES.map((item, i) => <li key={item.id}><button type="button" aria-pressed={stage === item.id} onClick={() => { setStage(stage === item.id ? null : item.id); setDomain("all"); setFilterKey(""); setFilterValue(""); }}><span aria-hidden="true">{i + 1}</span>{item.name}</button></li>)}</ol>
      <p className="r5-loop">Return paths: Feedback + Referral → Marketing; renewal or re-engagement → App Experience. The Experience remains available according to access, not stage position.</p>
      {stage && <button type="button" onClick={() => setStage(null)}>Show all lifecycle measures</button>}
    </section>
    <form className="r5-controls" aria-label="Analytics filters" onSubmit={(e) => { e.preventDefault(); setReload((n) => n + 1); }}>
      <label>Measure family<select aria-label="Measure family" value={domain} onChange={(e) => { setDomain(e.target.value as MetricDomain | "all"); setStage(null); setFilterKey(""); setFilterValue(""); }}><option value="all">All permitted measures</option>{domains.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
      <label>Start date (UTC)<input aria-label="Start date (UTC)" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required /></label>
      <label>End date (exclusive, UTC)<input aria-label="End date (exclusive, UTC)" type="date" value={to} onChange={(e) => setTo(e.target.value)} required /></label>
      <label>Data mode<select aria-label="Data mode" value={mode} onChange={(e) => setMode(e.target.value as "live" | "test")}><option value="live">Live</option><option value="test">Test — not live</option></select></label>
      <label>Follow-up window<select aria-label="Follow-up window" value={observationDays} onChange={(e) => setObservationDays(Number(e.target.value))}>{[1, 7, 14, 30, 60, 90].map((days) => <option key={days} value={days}>{days} days</option>)}</select></label>
      <label>Currency (no conversion)<input aria-label="Currency (no conversion)" value={currency} maxLength={3} pattern="[A-Z]{3}" onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></label>
      <label>Breakdown filter<select aria-label="Breakdown filter" value={effectiveKey} disabled={!allowedDimensions.length} onChange={(e) => { setFilterKey(e.target.value as Dimension | ""); setFilterValue(""); }}><option value="">None</option>{allowedDimensions.map((dimension) => <option key={dimension} value={dimension}>{dimension}</option>)}</select></label>
      {effectiveKey && <label>Exact filter value<input aria-label="Exact filter value" value={filterValue} maxLength={160} onChange={(e) => setFilterValue(e.target.value)} placeholder="Stable ID or version" /></label>}
      <button type="submit" disabled={loading}>Refresh metrics</button>
    </form>
    <div role="status" aria-live="polite">{loading ? "Loading scoped analytics…" : error ?? (report?.release.reason || "Metrics are read-only. Open a definition to inspect its sources and denominator.")}</div>
    <section className="r5-quality" aria-labelledby="quality-title"><h2 id="quality-title">Data quality</h2>
      {report ? <><p>{report.results.filter((r) => r.status === "available").length} available · {report.results.filter((r) => r.status === "partial").length} partial · {report.results.filter((r) => r.status === "stale").length} stale · {report.results.filter((r) => r.status === "unavailable").length} unavailable</p><p>Calculated {report.calculatedAt}. Coverage, rejected data, incomplete observation and source limitations appear with each metric.</p></> : <p>No coverage has been confirmed. A dash is not zero, and absence of history is not evidence of no activity.</p>}
    </section>
    <section id="metrics" aria-labelledby="metrics-heading" aria-busy={loading}><h2 id="metrics-heading">{selectedStage?.name ?? domains.find((d) => d.value === domain)?.label ?? "Lifecycle measures"}</h2>
      <div className="r5-metric-grid">{visible.map((definition) => <MetricCard key={definition.metricId} definition={definition} result={results.get(definition.metricId)} />)}</div>
      {!visible.length && <p>No measures are available with your current permissions and selection.</p>}
    </section>
  </section>;
}

export function AnalyticsWorkspace({ organizationId }: { organizationId: string }) {
  const { can } = useOrganization();
  const { currentUser, isDemo } = useAuth();
  return <AnalyticsWorkspaceView key={`${organizationId}:${currentUser?.uid ?? "signed-out"}`} organizationId={organizationId} userId={currentUser?.uid ?? null} isDemo={isDemo} can={can} />;
}
