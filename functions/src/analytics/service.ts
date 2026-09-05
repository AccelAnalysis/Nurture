import type { OrganizationCapability } from "../../../shared/platform/authorization.js";
import type { AnalyticsReport, MeasurementInput, MetricQuery } from "../../../shared/analytics/measurement/contracts.js";
import { calculateMetrics, parseMetricQuery, record } from "../../../shared/analytics/measurement/engine.js";
import { METRICS_BY_ID } from "../../../shared/analytics/measurement/registry.js";

export interface AnalyticsPorts {
  authorize(organizationId: string, uid: string, capability: OrganizationCapability): Promise<void>;
  gate(): AnalyticsReport["release"];
  read(query: MetricQuery): Promise<MeasurementInput>;
  /** Only derived materialization + canonical audit; no lifecycle/financial/communication write port. */
  saveDerived(report: AnalyticsReport, uid: string, requestId: string): Promise<{ id: string; written: boolean }>;
  now(): string;
}
export class AnalyticsError extends Error {
  constructor(readonly code: "unauthenticated" | "permission-denied" | "invalid-argument" | "failed-precondition", message: string) { super(message); }
}
async function authorize(raw: unknown, uid: string | undefined, ports: AnalyticsPorts, rebuild: boolean): Promise<MetricQuery> {
  if (!uid) throw new AnalyticsError("unauthenticated", "Sign in to view organization analytics.");
  let query: MetricQuery;
  try { query = parseMetricQuery(raw); } catch (e) { throw new AnalyticsError("invalid-argument", (e as Error).message); }
  const permissions = new Set<OrganizationCapability>(["analytics.view", ...query.metricIds.flatMap((id) => [...METRICS_BY_ID.get(id)!.permissions])]);
  if (rebuild) { permissions.add("settings.manage"); permissions.add("audit.view"); }
  for (const permission of permissions) await ports.authorize(query.organizationId, uid, permission);
  return query;
}
async function evaluate(query: MetricQuery, ports: AnalyticsPorts): Promise<AnalyticsReport> {
  const release = ports.gate();
  const input = release.ready ? await ports.read(query) : { events: [], coverage: {}, calculatedAt: ports.now() };
  const results = calculateMetrics(query, input);
  if (!release.ready) for (const result of results) result.reasons.unshift(release.reason ?? "Release is not active.");
  return { query, results, release, calculatedAt: input.calculatedAt };
}
export async function queryAnalytics(raw: unknown, uid: string | undefined, ports: AnalyticsPorts): Promise<AnalyticsReport> {
  const query = await authorize(raw, uid, ports, false);
  return evaluate(query, ports);
}
export async function rebuildAnalytics(raw: unknown, uid: string | undefined, ports: AnalyticsPorts) {
  let data: Record<string, unknown>;
  try { data = record(raw); } catch { throw new AnalyticsError("invalid-argument", "Expected a rebuild request."); }
  if (Object.keys(data).some((key) => key !== "query" && key !== "requestId") || typeof data.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(data.requestId)) throw new AnalyticsError("invalid-argument", "Provide a query and an 8–80 character rebuild request ID.");
  const query = await authorize(data.query, uid, ports, true);
  if (!ports.gate().ready) throw new AnalyticsError("failed-precondition", "Rebuild is blocked until Release 4 and the source bindings are accepted.");
  const report = await evaluate(query, ports);
  // Never persist a partial/unknown denominator as a complete aggregate.
  if (report.results.some((r) => r.status !== "available")) throw new AnalyticsError("failed-precondition", "Rebuild requires complete, fresh sources for every selected metric.");
  const saved = await ports.saveDerived(report, uid!, data.requestId);
  return { ...saved, report };
}
