import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnalyticsWorkspaceView } from "../../src/features/analytics/workspace/AnalyticsWorkspace";
import { calculateMetrics } from "../../shared/analytics/measurement/engine";
import { METRIC_REGISTRY } from "../../shared/analytics/measurement/registry";
import type { AnalyticsReport, MetricQuery, SourceCoverage } from "../../shared/analytics/measurement/contracts";
import type { LifecycleEventEnvelope } from "../../shared/analytics/contracts";
import "../../brand/tokens.css";

// Browser-only controlled fixture outside the production import graph. No Firebase calls or real customer data.
function Harness() {
  const [organizationId, setOrganizationId] = useState("fixture-a");
  const [role, setRole] = useState("administrator");
  const [demo, setDemo] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [delay, setDelay] = useState(false);
  const can = useCallback((capability: string) => role === "administrator" || !["billing.view", "settings.manage", "audit.view"].includes(capability), [role]);
  const load = useCallback(async (query: MetricQuery): Promise<AnalyticsReport> => {
    const calculatedAt = new Date().toISOString();
    const occurredAt = new Date(Date.parse(query.from) + 2 * 86_400_000).toISOString();
    const count = query.organizationId === "fixture-a" ? 3 : 1;
    const events: LifecycleEventEnvelope[] = Array.from({ length: count }, (_, i) => ({
      eventId: `fixture-${i}`, eventType: "registration.completed", schemaVersion: 1, organizationId: query.organizationId,
      customerId: `fixture-customer-${i}`, subjectKind: "customer", subjectId: `fixture-customer-${i}`,
      occurredAt, receivedAt: occurredAt, source: "trusted_server", correlationId: `fixture-${i}`, idempotencyKey: `fixture-${i}`,
      dataMode: query.dataMode, payload: {},
    }));
    const coverage: Record<string, SourceCoverage> = {};
    if (!blocked) for (const d of METRIC_REGISTRY) for (const source of d.sources) {
      if (!source.startsWith("referral")) coverage[source] = { organizationId: query.organizationId, dataMode: query.dataMode, bindingVersion: 1, from: query.from, through: calculatedAt, checkedAt: calculatedAt, complete: true };
    }
    if (delay && query.organizationId === "fixture-a") await new Promise((resolve) => setTimeout(resolve, 1400));
    return { query, results: calculateMetrics(query, { events, coverage, calculatedAt }), calculatedAt,
      release: { ready: !blocked, acceptedR4Sha: null, reason: blocked ? "Release 4 fixture gate is closed." : "Controlled browser fixture — not production data." } };
  }, [blocked, delay]);
  return <><aside aria-label="Isolated test controls" style={{ padding: 16 }}>
    <strong>CONTROLLED TEST FIXTURE — NEVER PRODUCTION</strong>
    <p>Organization: <output data-testid="fixture-organization">{organizationId}</output></p>
    <button onClick={() => setOrganizationId((v) => v === "fixture-a" ? "fixture-b" : "fixture-a")}>Switch fixture organization</button>
    <button onClick={() => setRole((v) => v === "administrator" ? "manager" : "administrator")}>Switch fixture role</button>
    <button onClick={() => setDemo((v) => !v)}>Toggle demo fixture</button>
    <button onClick={() => setBlocked((v) => !v)}>Toggle R4 fixture gate</button>
    <button onClick={() => setDelay((v) => !v)}>Toggle delayed fixture</button>
  </aside><AnalyticsWorkspaceView organizationId={organizationId} userId={`fixture-${role}`} isDemo={demo} can={can} load={load} /></>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
