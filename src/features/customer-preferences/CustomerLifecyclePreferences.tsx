import { useMemo, useState } from "react";
import type { CommunicationConsentFact } from "../../../shared/customer/contracts";
import {
  consentStateFor,
  type CustomerControlPort,
  type CustomerControlSnapshot,
  validQuietHours,
  validTimeZone,
} from "../../../shared/release3/customer-control";
import "./customer-preferences.css";

export interface CustomerLifecyclePreferencesProps {
  organizationId: string;
  customerId: string;
  initial: CustomerControlSnapshot;
  port: CustomerControlPort;
}

function marketingEmailState(facts: CommunicationConsentFact[]) {
  return consentStateFor(facts, "email", "marketing");
}

export function CustomerLifecyclePreferences({ organizationId, customerId, initial, port }: CustomerLifecyclePreferencesProps) {
  const [snapshot, setSnapshot] = useState(initial);
  const [timezone, setTimezone] = useState(initial.preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
  const [quietStart, setQuietStart] = useState(initial.preferences.quietHours?.startLocal ?? "21:00");
  const [quietEnd, setQuietEnd] = useState(initial.preferences.quietHours?.endLocal ?? "08:00");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const marketingState = useMemo(() => marketingEmailState(snapshot.consents), [snapshot.consents]);
  const preferenceValid = validTimeZone(timezone) && validQuietHours({ startLocal: quietStart, endLocal: quietEnd });

  async function savePreferences() {
    if (!preferenceValid) return;
    setBusy(true); setStatus("Saving lifecycle preferences…");
    try {
      const preferences = await port.savePreferences({ organizationId, customerId, timezone, quietHours: { startLocal: quietStart, endLocal: quietEnd }, idempotencyKey: crypto.randomUUID() });
      setSnapshot((current) => ({ ...current, preferences }));
      setStatus("Lifecycle preferences saved. Already queued work will recheck current eligibility before any future effect.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to save lifecycle preferences."); }
    finally { setBusy(false); }
  }

  async function changeMarketing(next: "granted" | "withdrawn") {
    setBusy(true); setStatus(next === "granted" ? "Saving permission…" : "Withdrawing promotional email permission…");
    try {
      await port.setConsent({ organizationId, customerId, channel: "email", purpose: "marketing", decision: next, policyVersion: "r3-customer-preferences-v1", idempotencyKey: crypto.randomUUID() });
      const fresh = await port.load(organizationId, customerId);
      setSnapshot(fresh);
      setStatus(next === "granted" ? "Promotional email permission recorded." : "Promotional email permission withdrawn. Future promotional sends must be suppressed.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to update communication permission."); }
    finally { setBusy(false); }
  }

  async function manageSubscription() {
    setBusy(true); setStatus("Preparing secure subscription management…");
    try {
      const result = await port.loadSubscriptionManagementHandoff({ organizationId, customerId, returnPath: window.location.pathname });
      window.location.assign(result.href);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Subscription management is unavailable."); setBusy(false); }
  }

  async function requestCancellation() {
    setBusy(true); setStatus("Submitting cancellation request…");
    try {
      const result = await port.requestCancellation({ organizationId, customerId, idempotencyKey: crypto.randomUUID() });
      setSnapshot((current) => ({ ...current, cancellation: { ...current.cancellation, status: result.status, requestedAt: new Date().toISOString() } }));
      setStatus("Cancellation requested. No survey, retention offer, or promotional action is required to continue.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Cancellation request could not be submitted."); }
    finally { setBusy(false); }
  }

  return <section className="r3-preferences" aria-labelledby="lifecycle-preferences-title">
    <header><h1 id="lifecycle-preferences-title">Lifecycle preferences</h1><p>Control how Nurture may contact you and when. Service notices and optional promotional messages are treated separately.</p></header>

    <div className="r3-preferences__section">
      <h2>Timing</h2>
      <label className="r3-preferences__field">Timezone<input value={timezone} onChange={(event) => setTimezone(event.currentTarget.value)} aria-invalid={!validTimeZone(timezone)} /></label>
      <div className="r3-preferences__row">
        <label className="r3-preferences__field">Quiet hours start<input type="time" value={quietStart} onChange={(event) => setQuietStart(event.currentTarget.value)} /></label>
        <label className="r3-preferences__field">Quiet hours end<input type="time" value={quietEnd} onChange={(event) => setQuietEnd(event.currentTarget.value)} /></label>
      </div>
      <button type="button" disabled={busy || !preferenceValid} onClick={() => void savePreferences()}>Save timing</button>
    </div>

    <div className="r3-preferences__section">
      <h2>Optional promotional email</h2>
      <p>Current state: <strong>{marketingState}</strong></p>
      <p className="r3-preferences__note">Unknown permission is not treated as consent. Withdrawal applies to future promotional lifecycle messages even when work was already queued.</p>
      <div className="r3-preferences__row">
        <button type="button" disabled={busy || marketingState === "granted"} onClick={() => void changeMarketing("granted")}>Allow promotional email</button>
        <button type="button" disabled={busy || marketingState === "withdrawn"} onClick={() => void changeMarketing("withdrawn")}>Stop promotional email</button>
      </div>
    </div>

    <div className="r3-preferences__section">
      <h2>Subscription control</h2>
      <p>Cancellation state: <strong>{snapshot.cancellation.status}</strong></p>
      <p className="r3-preferences__note">This screen never changes paid access itself. Subscription state and access end dates come from the trusted commercial service.</p>
      <div className="r3-preferences__row">
        <button type="button" disabled={busy} onClick={() => void manageSubscription()}>Manage subscription</button>
        <button type="button" className="r3-preferences__danger" disabled={busy || snapshot.cancellation.status !== "none"} onClick={() => void requestCancellation()}>Request cancellation</button>
      </div>
    </div>
    <p aria-live="polite">{status}</p>
  </section>;
}
