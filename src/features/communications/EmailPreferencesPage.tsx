import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorState, LoadingState, PageHeader } from "../../components/ui";
import type { EmailPreferencePort, EmailPreferenceView } from "./contracts";

/**
 * D owns this UX, while C owns the consent repository. The Release 2 finisher
 * injects C's opaque-token consent adapter here; this component deliberately
 * contains no second consent store or email-string lookup.
 */
export function EmailPreferencesPage({ token, preferences }: { token: string; preferences: EmailPreferencePort }) {
  const [view, setView] = useState<EmailPreferenceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    preferences.read(token)
      .then((next) => active && setView(next))
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Email preferences are unavailable."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [preferences, token]);

  async function updateMarketing(allowed: boolean) {
    if (!view) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const next = await preferences.updateMarketing(token, allowed);
      setView(next);
      setNotice(allowed ? "Promotional email permission updated." : "Promotional email withdrawn. New promotional provider submissions will be suppressed after final eligibility recheck.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Email preferences could not be updated.");
    } finally { setSaving(false); }
  }

  if (loading) return <LoadingState label="Loading email preferences…" />;
  if (error && !view) return <ErrorState message={error} />;
  if (!view) return <ErrorState message="Email preferences are unavailable." />;

  return (
    <section className="content-width page-section">
      <PageHeader eyebrow="Email preferences" title={view.organizationName} description="Manage promotional email permission for this organization. Account and service messages remain a separate purpose and are not converted into marketing permission." />
      {error ? <ErrorState message={error} /> : null}
      {notice ? <div className="state-panel" role="status">{notice}</div> : null}
      <Card className="form-card">
        <div className="card-heading"><div><h2>Promotional email</h2><p>Offers, acquisition follow-up, trial conversion, and checkout recovery.</p></div><Badge tone={view.marketing === "granted" ? "positive" : view.marketing === "denied" ? "warning" : "neutral"}>{view.marketing}</Badge></div>
        <div className="communication-actions">
          <Button type="button" disabled={saving || view.marketing === "granted"} onClick={() => updateMarketing(true)}>Allow promotional email</Button>
          <Button type="button" className="button-secondary" disabled={saving || view.marketing === "denied"} onClick={() => updateMarketing(false)}>Stop promotional email</Button>
        </div>
      </Card>
      <Card>
        <div className="card-heading"><div><h2>Service email</h2><p>Account or requested-service communication is evaluated separately from promotional permission.</p></div><Badge>{view.service}</Badge></div>
        <small>This preference link never uses an email address as proof of identity. Its opaque, scoped token must be verified by the C-owned consent command boundary.</small>
      </Card>
    </section>
  );
}
