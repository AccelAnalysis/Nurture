import { useMemo, useState } from "react";
import type { AutomationDefinitionV3, RecoveryCommandType, TreatmentAction } from "../../../shared/release3/contracts";
import { explainDefinition, validateDefinition, type CustomerRetentionSnapshot, type LifecycleStudioPort } from "./model";
import "./retention-admin.css";

export interface RetentionLifecycleStudioProps {
  organizationId: string;
  initialDefinition: AutomationDefinitionV3;
  snapshot?: CustomerRetentionSnapshot;
  canPublish: boolean;
  canOperate: boolean;
  port: LifecycleStudioPort;
}

export function RetentionLifecycleStudio({ organizationId, initialDefinition, snapshot, canPublish, canOperate, port }: RetentionLifecycleStudioProps) {
  const [definition, setDefinition] = useState(initialDefinition);
  const [status, setStatus] = useState("Draft changes are local until saved.");
  const [busy, setBusy] = useState(false);
  const validation = useMemo(() => validateDefinition(definition), [definition]);
  const explanation = useMemo(() => explainDefinition(definition), [definition]);

  async function run(label: string, operation: () => Promise<string>) {
    setBusy(true);
    setStatus(`${label}…`);
    try { setStatus(await operation()); }
    catch (error) { setStatus(`${label} failed: ${error instanceof Error ? error.message : "unknown error"}`); }
    finally { setBusy(false); }
  }

  const update = <K extends keyof AutomationDefinitionV3>(key: K, value: AutomationDefinitionV3[K]) => setDefinition((current) => ({ ...current, [key]: value }));
  const updateAction = (branchIndex: number, actionIndex: number, nextAction: TreatmentAction) => setDefinition((current) => ({
    ...current,
    branches: current.branches.map((branch, currentBranchIndex) => currentBranchIndex !== branchIndex ? branch : {
      ...branch,
      actions: branch.actions.map((action, currentActionIndex) => currentActionIndex === actionIndex ? nextAction : action),
    }),
  }));
  const feedbackKind = definition.kind === "survey" || definition.kind === "referral";

  return <section className="r3-studio" aria-labelledby="r3-studio-title">
    <header>
      <p className="r3-studio__muted">Lifecycle studio · organization scoped</p>
      <h1 id="r3-studio-title">Lifecycle treatments</h1>
      <p>Author approved lifecycle rules without giving the browser authority to execute financial, entitlement, consent, delivery, survey-classification, or reward mutations.</p>
    </header>

    <div className="r3-studio__grid">
      <div className="r3-studio__panel">
        <h2>Rule draft</h2>
        <label className="r3-studio__field">Name
          <input value={definition.name} onChange={(event) => update("name", event.currentTarget.value)} />
        </label>
        <label className="r3-studio__field">Treatment
          <select value={definition.kind} onChange={(event) => update("kind", event.currentTarget.value as AutomationDefinitionV3["kind"])}>
            <option value="upsell">Contextual upsell</option><option value="renewal">Renewal</option><option value="payment-recovery">Payment recovery</option><option value="re-engagement">Re-engagement</option><option value="cancellation">Cancellation</option><option value="win-back">Win-back</option><option value="survey">Survey invitation</option><option value="referral">Referral invitation</option>
          </select>
        </label>
        <label className="r3-studio__field">Registered trigger
          <input value={definition.trigger.eventType} onChange={(event) => update("trigger", { ...definition.trigger, eventType: event.currentTarget.value })} />
        </label>
        <label className="r3-studio__field">Delay (minutes)
          <input type="number" min="0" value={definition.delayMinutes ?? 0} onChange={(event) => update("delayMinutes", Number(event.currentTarget.value))} />
        </label>
        <label className="r3-studio__field">Re-entry
          <select value={definition.reentry.kind} onChange={(event) => update("reentry", { ...definition.reentry, kind: event.currentTarget.value as AutomationDefinitionV3["reentry"]["kind"] })}>
            <option value="once-per-customer">Once per customer</option><option value="once-per-occurrence">Once per qualifying occurrence</option><option value="after-cooldown">After cooldown</option><option value="after-requalification">After verified requalification</option>
          </select>
        </label>
        {definition.reentry.kind === "after-cooldown" ? <label className="r3-studio__field">Cooldown (hours)
          <input type="number" min="1" value={definition.reentry.cooldownHours ?? 24} onChange={(event) => update("reentry", { ...definition.reentry, cooldownHours: Number(event.currentTarget.value) })} />
        </label> : null}
        <label className="r3-studio__field">Priority
          <select value={definition.conflict.priority} onChange={(event) => update("conflict", { ...definition.conflict, priority: event.currentTarget.value as AutomationDefinitionV3["conflict"]["priority"] })}>
            <option value="critical-service">Critical service</option><option value="service">Service</option><option value="retention">Retention</option><option value="promotion">Promotion</option>
          </select>
        </label>
        <label className="r3-studio__field">Execution mode
          <select value={definition.mode} onChange={(event) => update("mode", event.currentTarget.value as AutomationDefinitionV3["mode"])}>
            <option value="preview">Preview</option><option value="test">Controlled test</option><option value="live">Live</option><option value="demo">Demo</option><option value="development">Development</option>
          </select>
        </label>
        <label className="r3-studio__field"><span>Enabled</span><input type="checkbox" checked={definition.enabled} onChange={(event) => update("enabled", event.currentTarget.checked)} /></label>

        {feedbackKind ? <div className="r3-studio__panel">
          <h3>{definition.kind === "survey" ? "Survey" : "Referral"} action</h3>
          <p className="r3-studio__muted">Release 4 uses the existing durable in-app action. For a survey, the template ID is the published survey ID. For a referral, it is the published referral-program ID. The worker creates the version-pinned invitation at execution.</p>
          {definition.branches.flatMap((branch, branchIndex) => branch.actions.map((action, actionIndex) => action.type === "in-app" ? <div className="r3-studio__panel" key={`${branch.id}-${actionIndex}`}>
            <label className="r3-studio__field">{definition.kind === "survey" ? "Published survey ID" : "Published referral program ID"}
              <input value={action.templateId} onChange={(event) => updateAction(branchIndex, actionIndex, { ...action, templateId: event.currentTarget.value })} />
            </label>
            <label className="r3-studio__field">Effect contract version
              <input type="number" min="1" value={action.templateVersion} onChange={(event) => updateAction(branchIndex, actionIndex, { ...action, templateVersion: Math.max(1, Number(event.currentTarget.value)) })} />
            </label>
            <label className="r3-studio__field">Placement
              <input value={action.placementId} onChange={(event) => updateAction(branchIndex, actionIndex, { ...action, placementId: event.currentTarget.value })} />
            </label>
            <label className="r3-studio__field">Purpose
              <select value={action.purpose} onChange={(event) => updateAction(branchIndex, actionIndex, { ...action, purpose: event.currentTarget.value as "transactional" | "promotional" })}>
                <option value="transactional">Service / transactional</option><option value="promotional">Promotional</option>
              </select>
            </label>
          </div> : null))}
          {!definition.branches.some(branch => branch.actions.some(action => action.type === "in-app")) ? <p role="alert">A survey or referral rule needs at least one in-app action so the invitation has a customer presentation surface.</p> : null}
        </div> : null}

        <h3>Human-readable rule</h3>
        <p className="r3-studio__status" aria-live="polite">{explanation}</p>
        {!validation.valid ? <ul>{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}

        <div className="r3-studio__actions">
          <button disabled={busy || !validation.valid} onClick={() => run("Save draft", async () => { const result = await port.saveDraft(definition); return `Draft version ${result.version} saved. Published behavior is unchanged.`; })}>Save draft</button>
          <button disabled={busy || !validation.valid} onClick={() => run("Dry run", async () => { const result = await port.dryRun(definition, snapshot?.customerId); return result.eligible ? "Dry run: eligible. No external effect was created." : `Dry run excluded: ${result.reasons.join(", ")}.`; })}>Dry run</button>
          <button disabled={busy || !validation.valid || !canPublish} onClick={() => run("Publish", async () => { const result = await port.publish(organizationId, definition.id, definition.version); return `Published version ${result.publishedVersion}. Existing pinned runs keep their original version.`; })}>Publish</button>
        </div>
        <p aria-live="polite">{status}</p>
      </div>

      <aside className="r3-studio__panel" aria-label="Customer treatment inspection">
        <h2>Treatment inspection</h2>
        {!snapshot ? <p>Select an authorized customer to inspect current eligibility, treatment, and timeline facts.</p> : <>
          <p><strong>Engagement:</strong> {snapshot.engagement.state}{snapshot.engagement.lastMeaningfulActivityAt ? ` · last meaningful activity ${snapshot.engagement.lastMeaningfulActivityAt}` : ""}</p>
          <p><strong>Subscription:</strong> {snapshot.commercial.subscriptionState} · payment {snapshot.commercial.paymentHealth}</p>
          <p><strong>Cancellation:</strong> {snapshot.commercial.cancellation.status}</p>
          <h3>Active/Recent runs</h3>
          <ul className="r3-studio__list">{snapshot.activeRuns.map((run) => <li className="r3-studio__run" key={run.runId}><strong>{run.state}</strong> · {run.automationId}<br/><span className="r3-studio__muted">{run.reasons.join(", ") || "No exclusion reason"}</span></li>)}</ul>
          <h3>Operator recovery</h3>
          <div className="r3-studio__actions">{(["re-evaluate", "safe-retry", "reconcile", "cancel-run"] as RecoveryCommandType[]).map((type) => <button key={type} className={type === "cancel-run" ? "r3-studio__danger" : undefined} disabled={!canOperate || busy || !snapshot.activeRuns[0]} onClick={() => run(type, async () => { const target = snapshot.activeRuns[0]; const result = await port.executeRecovery({ type, organizationId, runId: target.runId, effectId: target.effectIds[0], mode: definition.mode, reason: `Operator requested ${type} from lifecycle studio` }); return result.accepted ? `${type} accepted as ${result.commandId}.` : `${type} rejected: ${result.reason}.`; })}>{type}</button>)}</div>
          <h3>Timeline</h3><ol className="r3-studio__list">{snapshot.timeline.map((entry) => <li key={entry.id}><time dateTime={entry.occurredAt}>{entry.occurredAt}</time> · {entry.label}{entry.detail ? ` — ${entry.detail}` : ""}</li>)}</ol>
        </>}
      </aside>
    </div>
  </section>;
}
