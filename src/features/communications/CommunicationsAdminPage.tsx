import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingState, PageHeader, TextArea } from "../../components/ui";
import { useOrganization } from "../../context/OrganizationContext";
import { FICTIONAL_PREVIEW_VARIABLES } from "../../../shared/communications/defaults";
import { renderEmailTemplate } from "../../../shared/communications/render";
import { communicationVariableKeys, type CommunicationTemplateId, type CommunicationTemplateView, type EmailSenderReadiness, type EmailTemplateContent } from "./contracts";
import { getCommunicationSenderReadiness, listCommunicationTemplates, publishCommunicationTemplateVersion, saveCommunicationTemplate, sendCommunicationTest } from "./client";
import "./communications.css";

function replaceTemplate(items: CommunicationTemplateView[], next: CommunicationTemplateView) {
  return items.map((item) => item.templateId === next.templateId ? next : item);
}

function purposeLabel(value: "transactional" | "marketing") {
  return value === "transactional" ? "Service" : "Promotional";
}

function senderTone(sender: EmailSenderReadiness | null) {
  if (sender?.status === "ready") return "positive" as const;
  if (sender?.status === "pending") return "warning" as const;
  return "neutral" as const;
}

export function CommunicationsAdminPage({ organizationId }: { organizationId: string }) {
  const organization = useOrganization();
  const canManage = organization.can("communications.manage", organizationId);
  const [templates, setTemplates] = useState<CommunicationTemplateView[]>([]);
  const [selectedId, setSelectedId] = useState<CommunicationTemplateId>("registration-welcome");
  const [editor, setEditor] = useState<EmailTemplateContent | null>(null);
  const [sender, setSender] = useState<EmailSenderReadiness | null>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "publish" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([listCommunicationTemplates(organizationId), getCommunicationSenderReadiness(organizationId)])
      .then(([nextTemplates, nextSender]) => {
        if (!active) return;
        setTemplates(nextTemplates);
        setSender(nextSender);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Communications are unavailable."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [organizationId]);

  const selected = templates.find((template) => template.templateId === selectedId) ?? templates[0];
  useEffect(() => {
    if (selected) setEditor(structuredClone(selected.draft.content));
  }, [selected?.templateId, selected?.draft.updatedAt]);

  const preview = useMemo(() => {
    if (!editor) return { subject: "", text: "", error: null as string | null };
    try {
      const rendered = renderEmailTemplate({ content: editor, variables: FICTIONAL_PREVIEW_VARIABLES, trustedOrigins: [], mode: "preview" });
      return { subject: rendered.subject, text: rendered.text, error: null };
    } catch (cause) {
      return { subject: "", text: "", error: cause instanceof Error ? cause.message : "Preview is unavailable." };
    }
  }, [editor]);

  async function saveDraft() {
    if (!selected || !editor || !canManage) return;
    setBusy("save"); setError(null); setNotice(null);
    try {
      const updated = await saveCommunicationTemplate(organizationId, selected.templateId, editor);
      setTemplates((items) => replaceTemplate(items, updated));
      setNotice("Draft saved. The active published version is unchanged.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Draft could not be saved.");
    } finally { setBusy(null); }
  }

  async function publish() {
    if (!selected || !canManage) return;
    setBusy("publish"); setError(null); setNotice(null);
    try {
      const updated = await publishCommunicationTemplateVersion(organizationId, selected.templateId);
      setTemplates((items) => replaceTemplate(items, updated));
      setNotice(`Published ${updated.content?.name ?? updated.draft.content.name} version ${updated.published?.version ?? "—"}. Existing runs remain pinned to their recorded version.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Template could not be published.");
    } finally { setBusy(null); }
  }

  async function testSend() {
    if (!selected || !canManage || !testRecipient.trim()) return;
    setBusy("test"); setError(null); setNotice(null);
    try {
      const result = await sendCommunicationTest({ organizationId, templateId: selected.templateId, recipientEmail: testRecipient.trim() });
      if (result.submitted) setNotice(`Controlled provider test submitted. Current status: ${result.record?.status ?? "unknown"}. Provider acceptance is not delivery proof.`);
      else setError(result.reason ?? "Controlled provider test was blocked by the safety evaluator.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Controlled provider test could not be submitted.");
    } finally { setBusy(null); }
  }

  function toggleVariable(variable: (typeof communicationVariableKeys)[number]) {
    if (!editor || !canManage) return;
    const exists = editor.variables.includes(variable);
    setEditor({ ...editor, variables: exists ? editor.variables.filter((item) => item !== variable) : [...editor.variables, variable] });
  }

  if (loading) return <LoadingState label="Loading communication templates…" />;
  if (error && !templates.length) return <ErrorState message={error} />;
  if (!selected || !editor) return <EmptyState title="No communication templates" description="The approved Release 2 communication catalog is unavailable." />;

  return (
    <>
      <PageHeader eyebrow="Lifecycle communications" title="Email communications" description="Edit safe Nurture email templates, publish immutable versions, inspect sender readiness, and run explicitly allowlisted provider tests." />
      {error ? <ErrorState message={error} /> : null}
      {notice ? <div className="state-panel communication-notice" role="status">{notice}</div> : null}

      <div className="communication-admin-grid">
        <Card className="communication-library">
          <div className="card-heading"><div><p className="eyebrow">Approved catalog</p><h2>Templates</h2></div><Badge>{templates.length}</Badge></div>
          <div className="communication-template-list">
            {templates.map((template) => (
              <button key={template.templateId} type="button" className={template.templateId === selected.templateId ? "active" : ""} onClick={() => setSelectedId(template.templateId)}>
                <strong>{template.draft.content.name}</strong>
                <span>{purposeLabel(template.purpose)} · {template.published ? `v${template.published.version} published` : "not published"}</span>
                <small>{template.provenance === "nurture-default" ? `Inherited ${template.defaultVersion}` : "Organization draft"}</small>
              </button>
            ))}
          </div>
        </Card>

        <div className="communication-editor-stack">
          <Card className="form-card communication-editor">
            <div className="card-heading">
              <div><Badge tone={selected.purpose === "marketing" ? "warning" : "accent"}>{purposeLabel(selected.purpose)}</Badge><h2>{editor.name}</h2></div>
              <div>{selected.published ? <Badge tone="positive">Published v{selected.published.version}</Badge> : <Badge>Draft only</Badge>}</div>
            </div>
            <p className="muted">Purpose is locked by the approved template catalog. Promotional templates cannot be relabeled as service mail.</p>
            <label>Template name<Input value={editor.name} disabled={!canManage} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
            <label>Subject<Input value={editor.subject} disabled={!canManage} maxLength={160} onChange={(event) => setEditor({ ...editor, subject: event.target.value })} /></label>
            <label>Plain-text body<TextArea rows={12} value={editor.body} disabled={!canManage} maxLength={8000} onChange={(event) => setEditor({ ...editor, body: event.target.value })} /></label>
            <fieldset className="communication-variable-fieldset" disabled={!canManage}>
              <legend>Approved variables</legend>
              <p className="muted">Only checked variables may appear as {"{{variable.name}}"}. Nurture escapes generated HTML.</p>
              <div className="communication-variable-grid">
                {communicationVariableKeys.map((variable) => <label key={variable}><input type="checkbox" checked={editor.variables.includes(variable)} onChange={() => toggleVariable(variable)} /><span>{`{{${variable}}}`}</span></label>)}
              </div>
            </fieldset>
            <div className="communication-actions">
              <Button type="button" disabled={!canManage || busy !== null} onClick={saveDraft}>{busy === "save" ? "Saving…" : "Save draft"}</Button>
              <Button type="button" className="button-secondary" disabled={!canManage || busy !== null} onClick={publish}>{busy === "publish" ? "Publishing…" : "Publish version"}</Button>
            </div>
            {!canManage ? <small>Read-only access: communications.manage is required to save, publish, or test.</small> : null}
          </Card>

          <Card className="communication-preview">
            <div className="card-heading"><div><p className="eyebrow">Fictional data only</p><h2>Preview</h2></div><Badge>Never sends</Badge></div>
            {preview.error ? <ErrorState message={preview.error} /> : <div className="communication-email-preview"><strong>{preview.subject}</strong><pre>{preview.text}</pre></div>}
          </Card>
        </div>
      </div>

      <div className="two-column">
        <Card>
          <div className="card-heading"><div><p className="eyebrow">SendGrid</p><h2>Sender readiness</h2></div><Badge tone={senderTone(sender)}>{sender?.status ?? "unavailable"}</Badge></div>
          <p>{sender?.reason ?? (sender?.status === "ready" ? "Verified sender mapping is ready for controlled delivery." : "Sender status is unavailable.")}</p>
          {sender?.fromAddress ? <p><strong>From:</strong> {sender.fromName} &lt;{sender.fromAddress}&gt;</p> : null}
          {sender?.authenticatedDomain ? <p><strong>Authenticated domain:</strong> {sender.authenticatedDomain}</p> : null}
          <small>Template publication never activates outbound campaigns. Track E performs final live dispatch admission.</small>
        </Card>
        <Card className="form-card">
          <p className="eyebrow">Controlled provider proof</p><h2>Test send</h2>
          <label>Allowlisted recipient<Input type="email" value={testRecipient} disabled={!canManage} placeholder="approved@example.com" onChange={(event) => setTestRecipient(event.target.value)} /></label>
          <Button type="button" disabled={!canManage || busy !== null || !testRecipient.trim()} onClick={testSend}>{busy === "test" ? "Submitting…" : "Send controlled test"}</Button>
          <small>Only explicit server-side allowlist entries can receive test mail. This uses test execution mode and does not enroll ordinary customers or consume live campaign state.</small>
        </Card>
      </div>

      <Card>
        <div className="card-heading"><div><p className="eyebrow">Immutable history</p><h2>Published versions</h2></div><Badge>{selected.versions.length}</Badge></div>
        {selected.versions.length ? <div className="communication-version-list">{selected.versions.map((version) => <div key={version.version}><strong>Version {version.version}</strong><span>{version.content.name}</span><small>{new Date(version.publishedAt).toLocaleString()} · {purposeLabel(version.purpose)}</small></div>)}</div> : <EmptyState title="No published versions" description="Publishing creates the first immutable organization version; inherited defaults remain previewable until then." />}
      </Card>
    </>
  );
}
