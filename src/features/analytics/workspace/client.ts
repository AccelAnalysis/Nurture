import { httpsCallable } from "firebase/functions";
import { firebaseConfigured, functions } from "../../../firebase";
import { releaseBackendReady } from "../../../app/release/readiness";
import type { AnalyticsReport, MetricQuery } from "../../../../shared/analytics/measurement/contracts";

export async function loadOrganizationAnalytics(query: MetricQuery): Promise<AnalyticsReport> {
  if (!releaseBackendReady || !firebaseConfigured || !functions) throw new Error("Analytics is not connected. No live or test results have been loaded.");
  const result = await httpsCallable<MetricQuery, AnalyticsReport>(functions, "queryOrganizationAnalytics")(query);
  if (result.data.query.organizationId !== query.organizationId || result.data.query.dataMode !== query.dataMode) throw new Error("Analytics scope changed. Reload this workspace.");
  return result.data;
}
