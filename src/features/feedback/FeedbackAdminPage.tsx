import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, EmptyState, ErrorState, LoadingState, PageHeader, Tabs } from "../../components/ui";
import type { FeedbackApi, ConfigurationDraft, ConfigurationKind } from "../../../shared/feedback/api";
import type { FeedbackConfiguration, ReferralProgramDraft, SurveyDraft, SurveyKind } from "../../../shared/feedback/contracts";
import { defaultReferralProgram, defaultSurvey } from "../../../shared/feedback/defaults";
import { SurveyForm } from "./SurveyForm";
import "./feedback.css";

const PRIMARY_REFERRAL_PROGRAM_ID = "primary-referral-program";
const surveyKinds: { value: SurveyKind; label: string }[] = [
  { value: "satisfaction", label: "Satisfaction" },
  { value: "nps", label: "NPS" },
  { value: "data-gathering", label: "Data Gathering" },
  { value: "research", label: "Research" },
  { value: "onboarding-feedback", label: "Onboarding Feedback" },
  { value: "cancellation-feedback", label: "Cancellation Feedback" },
];

function isSurvey(value: ConfigurationDraft): value is SurveyDraft {
  return "questions" in value;
}

function isProgram(value: ConfigurationDraft): value is ReferralProgramDraft {
  return "qualification" in value;
}

function safeEntityId(prefix: string, value: string) {
  return `${prefix}-${value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "default"}`;
}

export function FeedbackAdminPage({ api, initialKind }: { api: FeedbackApi; initialKind: ConfigurationKind }) {
  const [kind, setKind] = useState<ConfigurationKind>(initialKind);
  const [items, setItems] = useState<FeedbackConfiguration<ConfigurationDraft>[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ConfigurationDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const selected = useMemo(() => items.find(item => item.id === selectedId) ?? null, [items, selectedId]);

  const load = useCallback(async (target: ConfigurationKind = kind) => {
    setLoading(true); setError(null); setNotice(null); setHistoryCount(null);
    try {
      const page = await api.list(target);
      setItems(page.rows);
      const first = page.rows[0] ?? null;
      setSelectedId(first?.id ?? null);
      setDraft(first ? structuredClone(first.draft) : null);
    } catch {
      setError("Feedback administration is unavailable. Release 4 remains fail-closed until its backend integration is enabled.");
    } finally { setLoading(false); }
  }, [api, kind]);

  useEffect(() => { setKind(initialKind); void load(initialKind); }, [initialKind, load]);

  function select(item: FeedbackConfiguration<ConfigurationDraft>) {
    setSelectedId(item.id); setDraft(structuredClone(item.draft)); setNotice(null); setHistoryCount(null);
  }

  async function execute(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try { await work(); }
    catch { setError("The change was not accepted. Reload the current version and verify that the Release 4 policy gate is ready."); }
    finally { setBusy(false); }
  }

  async function createSurvey(templateKind: SurveyKind) {
    const base = defaultSurvey(templateKind);
    const entityId = safeEntityId("survey", `${templateKind}-${Date.now().toString(36)}`);
    await execute(async () => {
      const saved = await api.save("survey", entityId, 0, base);
      await load("survey");
      setSelectedId(saved.id); setDraft(structuredClone(saved.draft)); setNotice("Survey draft created from the Nurture default.");
    });
  }

  async function createProgram() {
    const existing = items.find(item => item.id === PRIMARY_REFERRAL_PROGRAM_ID);
    if (existing) { select(existing); setNotice("The primary referral program is selected. Release 4 supports one active organization referral program."); return; }
    await execute(async () => {
      const saved = await api.save("program", PRIMARY_REFERRAL_PROGRAM_ID, 0, defaultReferralProgram());
      await load("program");
      setSelectedId(saved.id); setDraft(structuredClone(saved.draft)); setNotice("Primary referral program draft created. Incentive fulfillment remains disabled until approved.");
    });
  }

  async function save() {
    if (!selected || !draft) return;
    await execute(async () => {
      const saved = await api.save(kind, selected.id, selected.revision, draft);
      setItems(old => old.map(item => item.id === saved.id ? saved : item));
      setDraft(structuredClone(saved.draft));
      setNotice("Draft saved. The published customer experience has not changed.");
    });
  }

  async function publish() {
    if (!selected) return;
    await execute(async () => {
      const published = await api.publish(kind, selected.id, selected.revision);
      setNotice(`Published immutable version ${published.revision}. Historical responses and referrals remain pinned to their original versions.`);
      await load(kind);
    });
  }

  async function inspectHistory() {
    if (!selected) return;
    await execute(async () => {
      const history = await api.history(kind, selected.id);
      setHistoryCount(history.rows.length);
      setNotice(`Loaded ${history.rows.length} published version${history.rows.length === 1 ? "" : "s"}${history.cursor ? "+" : ""}.`);
    });
  }

  const title = kind === "survey" ? "Surveys" : "Referrals";
  return <div className="feedback-admin">
    <PageHeader eyebrow="Feedback + Referral" title={title} description={kind === "survey"
      ? "Create versioned feedback surveys, preview them, and publish without rewriting historical responses."
      : "Configure the organization’s voluntary primary referral program, attribution terms, qualification, and test-mode incentive policy."} />
    <Tabs items={["Surveys", "Referrals"]} active={title} onSelect={value => {
      const next = value === "Surveys" ? "survey" : "program";
      setKind(next); void load(next);
    }} />
    {notice ? <p className="feedback-notice" role="status">{notice}</p> : null}
    {error ? <ErrorState message={error} /> : null}
    {loading ? <LoadingState label={`Loading ${title.toLowerCase()}…`} /> : <>
      <div className="feedback-admin-toolbar">
        {kind === "survey" ? surveyKinds.map(template => <Button key={template.value} type="button" disabled={busy} onClick={() => void createSurvey(template.value)}>New {template.label}</Button>)
          : items.some(item => item.id === PRIMARY_REFERRAL_PROGRAM_ID)
            ? <span className="feedback-admin-meta">Release 4 uses one primary referral program per organization.</span>
            : <Button type="button" disabled={busy} onClick={() => void createProgram()}>Create primary referral program</Button>}
      </div>
      {items.length === 0 ? <EmptyState title={`No ${title.toLowerCase()} yet`} description={kind === "survey" ? "Start from a Nurture survey default; publishing remains separate from editing." : "Create the primary program draft. Live incentives remain gated until terms and fulfillment are approved."} /> : <div className="feedback-admin-grid">
        <aside className="feedback-admin-card" aria-label={`${title} list`}>
          <h2>{title}</h2>
          <div className="feedback-records">{items.map(item => <button key={item.id} type="button" className="feedback-admin-card" aria-current={item.id === selectedId} onClick={() => select(item)}>
            <strong>{isSurvey(item.draft) ? item.draft.title : isProgram(item.draft) ? item.draft.title : item.id}</strong>
            <span className="feedback-admin-meta">Draft revision {item.revision}</span>
            <Badge tone={item.publishedVersionId ? "positive" : "neutral"}>{item.publishedVersionId ? "Published" : "Draft only"}</Badge>
          </button>)}</div>
        </aside>
        <section className="feedback-admin-card">
          {selected && draft ? <>
            <h2>Edit draft</h2>
            <p className="feedback-admin-meta">{selected.id} · revision {selected.revision} · {selected.publishedVersionId ? "published version exists" : "not published"}</p>
            {isSurvey(draft) ? <SurveyEditor draft={draft} onChange={setDraft} /> : isProgram(draft) ? <ProgramEditor draft={draft} onChange={setDraft} /> : null}
            <div className="feedback-admin-actions">
              <Button type="button" disabled={busy} onClick={() => void save()}>Save draft</Button>
              <Button type="button" disabled={busy} onClick={() => void publish()}>Publish</Button>
              <Button type="button" disabled={busy} onClick={() => void inspectHistory()}>Version history{historyCount !== null ? ` (${historyCount})` : ""}</Button>
            </div>
          </> : null}
        </section>
      </div>}
      {draft && isSurvey(draft) ? <section className="feedback-admin-card"><h2>Customer preview</h2><SurveyForm survey={draft} preview onSubmit={async () => undefined} /></section> : null}
    </>}
  </div>;
}

function SurveyEditor({ draft, onChange }: { draft: SurveyDraft; onChange: (next: SurveyDraft) => void }) {
  const update = <K extends keyof SurveyDraft>(key: K, value: SurveyDraft[K]) => onChange({ ...draft, [key]: value });
  return <div className="feedback-form">
    <label className="feedback-field">Title<input value={draft.title} maxLength={160} onChange={event => update("title", event.target.value)} /></label>
    <div className="feedback-admin-grid">
      <label className="feedback-field">Response mode<select value={draft.privacy} onChange={event => update("privacy", event.target.value as SurveyDraft["privacy"])}><option value="identified">Identified</option><option value="anonymous">Anonymous</option></select></label>
      <label className="feedback-field">Audience<select value={draft.audience} onChange={event => update("audience", event.target.value as SurveyDraft["audience"])}><option value="all-eligible">All eligible</option><option value="configured-segment">Configured segment</option></select></label>
      <label className="feedback-field">Invitation expiry (hours)<input type="number" min={1} max={2160} value={draft.expiryHours} onChange={event => update("expiryHours", Number(event.target.value))} /></label>
      <label className="feedback-field">Cooldown (hours)<input type="number" min={1} max={8760} value={draft.cooldownHours} onChange={event => update("cooldownHours", Number(event.target.value))} /></label>
    </div>
    <label className="feedback-field"><span><input type="checkbox" checked={draft.requireSignIn} disabled={draft.privacy === "anonymous"} onChange={event => update("requireSignIn", event.target.checked)} /> Require the invited account to sign in</span></label>
    <h3>Questions</h3>
    {draft.questions.map((question, index) => <div className="feedback-admin-card" key={question.id}>
      <label className="feedback-field">Question {index + 1}<input value={question.label} maxLength={500} onChange={event => update("questions", draft.questions.map(item => item.id === question.id ? { ...item, label: event.target.value } : item))} /></label>
      <p className="feedback-admin-meta">Type: {question.type}{question.type === "nps" ? " · NPS uses the required 0–10 convention" : ""}</p>
      <label className="feedback-field"><span><input type="checkbox" checked={question.required} disabled={question.type === "nps"} onChange={event => update("questions", draft.questions.map(item => item.id === question.id ? { ...item, required: event.target.checked } : item))} /> Required</span></label>
    </div>)}
    {draft.privacy === "anonymous" ? <p className="feedback-notice">Anonymous publication remains blocked until an approved anonymity/retention policy is configured server-side.</p> : null}
  </div>;
}

function ProgramEditor({ draft, onChange }: { draft: ReferralProgramDraft; onChange: (next: ReferralProgramDraft) => void }) {
  const update = <K extends keyof ReferralProgramDraft>(key: K, value: ReferralProgramDraft[K]) => onChange({ ...draft, [key]: value });
  return <div className="feedback-form">
    <label className="feedback-field">Program title<input value={draft.title} maxLength={160} onChange={event => update("title", event.target.value)} /></label>
    <label className="feedback-field">Program terms<textarea value={draft.terms} maxLength={4000} onChange={event => update("terms", event.target.value)} /></label>
    <div className="feedback-admin-grid">
      <label className="feedback-field">Attribution<select value={draft.attribution} onChange={event => update("attribution", event.target.value as ReferralProgramDraft["attribution"])}><option value="first-touch">First touch</option><option value="last-touch">Last touch</option></select></label>
      <label className="feedback-field">Attribution window (days)<input type="number" min={1} max={365} value={draft.windowDays} onChange={event => update("windowDays", Number(event.target.value))} /></label>
      <label className="feedback-field">Invitation cooldown (hours)<input type="number" min={1} max={8760} value={draft.cooldownHours} onChange={event => update("cooldownHours", Number(event.target.value))} /></label>
      <label className="feedback-field">Invitation expiry (hours)<input type="number" min={1} max={2160} value={draft.invitationExpiryHours} onChange={event => update("invitationExpiryHours", Number(event.target.value))} /></label>
      <label className="feedback-field">Qualification hold (hours)<input type="number" min={0} max={2160} value={draft.qualificationHoldHours} onChange={event => update("qualificationHoldHours", Number(event.target.value))} /></label>
      <label className="feedback-field">Qualified referrals per customer<input type="number" min={1} max={10000} value={draft.maxQualifiedPerReferrer} onChange={event => update("maxQualifiedPerReferrer", Number(event.target.value))} /></label>
    </div>
    <label className="feedback-field"><span><input type="checkbox" checked={draft.active} onChange={event => update("active", event.target.checked)} /> Program active after publication</span></label>
    <p className="feedback-notice">Qualification is server-trusted paid subscription. The bundled test-credit benefit is test/development only; Release 4 rejects live incentive fulfillment until economics, terms, and a fulfillment mechanism are approved.</p>
  </div>;
}
