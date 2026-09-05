import { useMemo, useState } from "react";
import type {
  AcquisitionControlCommandPort,
  AcquisitionJobStatus,
  AcquisitionOperationsSnapshot,
} from "../../../shared/acquisition/contracts";
import { Badge, Button, Card, DataTable, Input, MetricCard } from "../../components/ui";

function statusTone(status: AcquisitionJobStatus): "neutral" | "positive" | "warning" | "accent" {
  if (status === "provider-accepted" || status === "dry-run") return "positive";
  if (status === "failed" || status === "unknown-outcome" || status === "held") return "warning";
  if (status === "retrying" || status === "leased") return "accent";
  return "neutral";
}

function count(snapshot: AcquisitionOperationsSnapshot, status: AcquisitionJobStatus) {
  return snapshot.counts[status] ?? 0;
}

/**
 * Track E owns this diagnostic panel; the Release 2 finisher mounts it under the
 * existing /platform/operations composition. It never fabricates readiness and
 * reports command success only after the authoritative async command succeeds.
 */
export function AcquisitionOperationsPanel({
  snapshot,
  commands,
  canManage = false,
}: {
  snapshot: AcquisitionOperationsSnapshot;
  commands?: AcquisitionControlCommandPort;
  canManage?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "positive" | "warning"; message: string } | null>(null);
  const operational = snapshot.backendPersistence === "ready" && snapshot.scheduler === "ready";
  const unresolved = count(snapshot, "held") + count(snapshot, "failed") + count(snapshot, "unknown-outcome");
  const active = count(snapshot, "scheduled") + count(snapshot, "leased") + count(snapshot, "retrying");
  const recentRows = useMemo(() => snapshot.recentJobs.map((job) => [
    <code key="effect">{job.effectId}</code>,
    job.automationId,
    <Badge key="status" tone={statusTone(job.status)}>{job.status}</Badge>,
    job.lastExplanation.reason,
    <time key="time" dateTime={job.updatedAt}>{new Date(job.updatedAt).toLocaleString()}</time>,
  ]), [snapshot.recentJobs]);

  async function togglePlatformPause() {
    if (!commands || !canManage || !reason.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await commands.setPlatformPaused({
        paused: !snapshot.platformPaused,
        reason: reason.trim(),
      });
      if (!result.ok) {
        setFeedback({ tone: "warning", message: result.reason ?? "The platform pause command was rejected." });
        return;
      }
      setFeedback({
        tone: "positive",
        message: `Platform acquisition dispatch ${snapshot.platformPaused ? "resume" : "pause"} was accepted${result.changedAt ? ` at ${new Date(result.changedAt).toLocaleString()}` : ""}. Refresh diagnostics to confirm current state.`,
      });
      setReason("");
    } catch (error) {
      setFeedback({
        tone: "warning",
        message: error instanceof Error ? error.message : "The platform pause command failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div aria-label="Acquisition runtime diagnostics">
      <div className="metric-grid">
        <MetricCard label="Queued / active" value={String(active)} detail="Scheduled, leased, or retrying" />
        <MetricCard label="Provider accepted" value={String(count(snapshot, "provider-accepted"))} detail="Acceptance is not delivery" />
        <MetricCard label="Suppressed / cancelled" value={String(count(snapshot, "suppressed") + count(snapshot, "cancelled"))} detail="Current-state safety exits" />
        <MetricCard label="Needs review" value={String(unresolved)} detail="Held, failed, or unknown outcome" />
      </div>

      <Card>
        <p className="eyebrow">Runtime readiness</p>
        <h2>Acquisition dispatch</h2>
        <p>
          <Badge tone={snapshot.platformPaused ? "warning" : "neutral"}>{snapshot.platformPaused ? "Platform paused" : "Platform not paused"}</Badge>{" "}
          <Badge tone={operational ? "positive" : "warning"}>Persistence: {snapshot.backendPersistence}</Badge>{" "}
          <Badge tone={operational ? "positive" : "warning"}>Scheduler: {snapshot.scheduler}</Badge>
        </p>
        {snapshot.note ? <p>{snapshot.note}</p> : null}
        {!operational ? (
          <p role="status">Dispatch controls remain unavailable until the backend persistence and scheduler gates report ready.</p>
        ) : null}

        {canManage ? (
          <div>
            <label htmlFor="acquisition-pause-reason">Reason for emergency state change</label>
            <Input
              id="acquisition-pause-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required for the audit record"
            />
            <Button
              type="button"
              disabled={!commands || !operational || !reason.trim() || saving}
              onClick={togglePlatformPause}
            >
              {saving ? "Applying…" : snapshot.platformPaused ? "Resume acquisition dispatch" : "Pause acquisition dispatch"}
            </Button>
          </div>
        ) : (
          <p>You have read-only operations access. Platform pause changes require <code>operations.manage</code>.</p>
        )}
        {feedback ? <p role={feedback.tone === "warning" ? "alert" : "status"}><Badge tone={feedback.tone}>{feedback.message}</Badge></p> : null}
      </Card>

      <Card>
        <p className="eyebrow">Recent runtime work</p>
        <h2>Reasons, not silent drops</h2>
        {recentRows.length ? (
          <DataTable
            headers={["Effect", "Automation", "State", "Reason", "Updated"]}
            rows={recentRows}
          />
        ) : (
          <p>No acquisition runtime records are available for this scope.</p>
        )}
      </Card>
    </div>
  );
}
