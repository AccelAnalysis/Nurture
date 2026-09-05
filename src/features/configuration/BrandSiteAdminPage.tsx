import { useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Card, Input, PageHeader, Select, TextArea } from "../../components/ui";
import { useOrganization } from "../../context/OrganizationContext";
import { organizationSectionCapability } from "../../security/authorization";
import { createNurtureDefaultConfiguration } from "./defaults";
import { useConfiguration } from "./ConfigurationProvider";
import { PublicSitePreview } from "./PublicSite";
import {
  configurationFieldProvenance,
  deriveOrganizationOverrides,
  validateOrganizationConfiguration,
} from "./resolver";
import type {
  ConfigurationProvenance,
  OrganizationConfiguration,
  OrganizationConfigurationOverride,
  PreviewViewport,
} from "./types";

function FieldFrame({
  label,
  provenance,
  onReset,
  hint,
  children,
}: {
  label: string;
  provenance: ConfigurationProvenance;
  onReset: () => void;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="track-a-field">
      <span className="track-a-field-heading">
        <span>{label}</span>
        <span className="track-a-field-state">
          <small>{provenance === "organization-override" ? "Organization override" : "Inherited default"}</small>
          {provenance === "organization-override" ? <button type="button" onClick={onReset}>Reset</button> : null}
        </span>
      </span>
      {children}
      {hint ? <small className="muted">{hint}</small> : null}
    </label>
  );
}

function ChecklistItem({ title, detail, status, tone = "neutral" }: { title: string; detail: string; status: string; tone?: "neutral" | "positive" | "warning" | "accent" }) {
  return <div className="track-a-checklist-item"><div><strong>{title}</strong><small>{detail}</small></div><Badge tone={tone}>{status}</Badge></div>;
}

export function BrandSiteAdminPage({ organizationId }: { organizationId: string }) {
  const configuration = useConfiguration();
  const organization = useOrganization();
  const access = organization.getAccess(organizationId);
  const [draft, setDraft] = useState<OrganizationConfiguration>(() => configuration.getDraft(organizationId));
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");
  const [message, setMessage] = useState<string>("");

  // Track E introduces brand.view / brand.manage / brand.publish. Until that branch
  // is merged, retain the existing settings.manage compatibility gate.
  const hasTrackEBrandCapabilities = Boolean(organizationSectionCapability.brand);
  const canNamedCapability = (capability: string) => (access.can as unknown as (value: string) => boolean)(capability);
  const canManage = hasTrackEBrandCapabilities ? canNamedCapability("brand.manage") : access.can("settings.manage");
  const canPublish = hasTrackEBrandCapabilities ? canNamedCapability("brand.publish") : access.can("settings.manage");

  const defaults = useMemo(() => createNurtureDefaultConfiguration(organizationId), [organizationId]);
  const record = configuration.getRecord(organizationId);
  const overrides = useMemo(() => deriveOrganizationOverrides(organizationId, draft), [draft, organizationId]);
  const trackAOverrideCount = [overrides.brand, overrides.site, overrides.metadata].filter(Boolean).length;
  const issues = useMemo(() => validateOrganizationConfiguration(draft), [draft]);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const activeVersion = record.publication?.version ?? null;

  const provenance = (section: keyof OrganizationConfigurationOverride, field: string) => configurationFieldProvenance(overrides, section, field);

  const resetField = (section: "brand" | "site" | "metadata", field: string) => {
    setDraft((current) => {
      const currentSection = current[section] as unknown as Record<string, unknown>;
      const defaultSection = defaults[section] as unknown as Record<string, unknown>;
      return {
        ...current,
        [section]: { ...currentSection, [field]: defaultSection[field] },
      } as OrganizationConfiguration;
    });
  };

  const updateBrand = <K extends keyof OrganizationConfiguration["brand"]>(key: K, value: OrganizationConfiguration["brand"][K]) => {
    setDraft((current) => ({ ...current, brand: { ...current.brand, [key]: value } }));
  };
  const updateSite = <K extends keyof OrganizationConfiguration["site"]>(key: K, value: OrganizationConfiguration["site"][K]) => {
    setDraft((current) => ({ ...current, site: { ...current.site, [key]: value } }));
  };
  const updateMetadata = <K extends keyof OrganizationConfiguration["metadata"]>(key: K, value: OrganizationConfiguration["metadata"][K]) => {
    setDraft((current) => ({ ...current, metadata: { ...current.metadata, [key]: value } }));
  };

  const saveDraft = () => {
    if (!canManage) {
      setMessage("You can review Brand & Site, but your organization access does not allow configuration changes.");
      return;
    }
    configuration.saveDraft(organizationId, draft);
    setMessage("Draft saved. The published public site has not changed.");
  };

  const publish = () => {
    if (!canPublish) {
      setMessage("Publishing requires the organization Brand publish capability.");
      return;
    }
    if (errors.length) {
      setMessage("Resolve the validation errors before publishing.");
      return;
    }
    configuration.saveDraft(organizationId, draft);
    const next = configuration.publish(organizationId);
    setMessage(`Published configuration version ${next.publication?.version ?? ""}.`);
  };

  const resetDraft = () => {
    if (!canManage) return;
    configuration.resetDraft(organizationId);
    setDraft(configuration.getDraft(organizationId));
    setMessage("Brand & Site draft reset to Nurture defaults. Other feature drafts and the published configuration are unchanged.");
  };

  const updateNavigation = (index: number, field: "label" | "href", value: string) => {
    const navigation = draft.site.navigation.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item);
    updateSite("navigation", navigation);
  };

  const updateFeature = (index: number, field: "title" | "body", value: string) => {
    const features = draft.site.features.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item);
    updateSite("features", features);
  };

  return (
    <div className="track-a-admin-page">
      <PageHeader
        eyebrow="Configuration + Public Shell · Track A"
        title="Brand & Site"
        description="Customize organization-scoped presentation, preview the effective draft, and publish an immutable public configuration version. Nurture defaults remain available at every field."
        actions={<div className="track-a-publish-actions"><Button className="button-secondary" onClick={saveDraft} disabled={!canManage}>Save draft</Button><Button onClick={publish} disabled={!canPublish || Boolean(errors.length)}>Publish</Button></div>}
      />

      <div className="track-a-status-row" aria-live="polite">
        <Badge tone={trackAOverrideCount ? "warning" : "neutral"}>{trackAOverrideCount ? "Brand/Site draft has overrides" : "Brand/Site uses Nurture defaults"}</Badge>
        <Badge tone={activeVersion ? "positive" : "neutral"}>{activeVersion ? `Published v${activeVersion}` : "No explicit publication yet"}</Badge>
        <span>Base: {record.baseTemplateVersion}</span>
        {record.draftUpdatedAt ? <span>Draft saved {new Date(record.draftUpdatedAt).toLocaleString()}</span> : null}
      </div>
      {!canManage ? <p className="track-a-message" role="status">Read-only Brand & Site access. Editing controls are disabled.</p> : null}
      {canManage && !canPublish ? <p className="track-a-message" role="status">You can edit and save drafts. Publishing requires Brand publish access.</p> : null}
      {message ? <p className="track-a-message" role="status">{message}</p> : null}

      <Card className="track-a-launch-checklist">
        <div className="card-heading"><div><p className="eyebrow">Launch checklist</p><h2>Release 1 handoffs</h2></div><Badge tone={errors.length ? "warning" : "positive"}>{errors.length ? `${errors.length} blocking` : "Track A ready"}</Badge></div>
        <ChecklistItem title="Brand & Site" detail="Logo, copy, navigation, metadata, media, preview, and publication." status={errors.length ? "Needs attention" : "Ready"} tone={errors.length ? "warning" : "positive"} />
        <ChecklistItem title="Offers" detail="Track D receives this public host's organization ID; Track A does not own commercial state." status="Track D" tone="accent" />
        <ChecklistItem title="Experience" detail="Track B can store versioned module settings through the opaque draft/publish extension seam without Track A interpreting them." status="Track B" tone="accent" />
        <ChecklistItem title="Onboarding" detail="Registration handoffs preserve the public organization candidate for Track C while tenant authority remains trusted-server work." status="Track C" tone="accent" />
        <ChecklistItem title="Governance" detail="Track E supplies brand.view/manage/publish plus production persistence and audit enforcement." status="Track E" tone="accent" />
      </Card>

      <div className="track-a-workspace">
        <fieldset className="track-a-editor-fieldset" disabled={!canManage}>
          <div className="track-a-editor">
            <details open>
              <summary>Brand</summary>
              <div className="track-a-form-grid">
                <FieldFrame label="Application name" provenance={provenance("brand", "applicationName")} onReset={() => resetField("brand", "applicationName")}>
                  <Input value={draft.brand.applicationName} onChange={(event) => updateBrand("applicationName", event.target.value)} />
                </FieldFrame>
                <FieldFrame label="Accent color" provenance={provenance("brand", "accentColor")} onReset={() => resetField("brand", "accentColor")} hint="Use a six-digit hex value. Nurture's default action accent is #0264EC.">
                  <div className="track-a-color-input"><input type="color" value={draft.brand.accentColor} onChange={(event) => updateBrand("accentColor", event.target.value)} aria-label="Choose accent color" /><Input value={draft.brand.accentColor} onChange={(event) => updateBrand("accentColor", event.target.value)} /></div>
                </FieldFrame>
                <FieldFrame label="Logo URL" provenance={provenance("brand", "logoUrl")} onReset={() => resetField("brand", "logoUrl")} hint="The canonical Nurture N remains the fallback when an organization logo fails.">
                  <Input value={draft.brand.logoUrl} onChange={(event) => updateBrand("logoUrl", event.target.value)} />
                </FieldFrame>
                <FieldFrame label="Logo text alternative" provenance={provenance("brand", "logoAlt")} onReset={() => resetField("brand", "logoAlt")}>
                  <Input value={draft.brand.logoAlt} onChange={(event) => updateBrand("logoAlt", event.target.value)} />
                </FieldFrame>
                <FieldFrame label="Appearance" provenance={provenance("brand", "appearance")} onReset={() => resetField("brand", "appearance")}>
                  <Select value={draft.brand.appearance} onChange={(event) => updateBrand("appearance", event.target.value as OrganizationConfiguration["brand"]["appearance"])}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></Select>
                </FieldFrame>
              </div>
            </details>

            <details open>
              <summary>Hero & calls to action</summary>
              <div className="track-a-form-grid">
                <FieldFrame label="Eyebrow" provenance={provenance("site", "eyebrow")} onReset={() => resetField("site", "eyebrow")}><Input value={draft.site.eyebrow} onChange={(event) => updateSite("eyebrow", event.target.value)} /></FieldFrame>
                <FieldFrame label="Headline" provenance={provenance("site", "headline")} onReset={() => resetField("site", "headline")}><TextArea rows={3} value={draft.site.headline} onChange={(event) => updateSite("headline", event.target.value)} /></FieldFrame>
                <FieldFrame label="Supporting text" provenance={provenance("site", "supportingText")} onReset={() => resetField("site", "supportingText")}><TextArea rows={5} value={draft.site.supportingText} onChange={(event) => updateSite("supportingText", event.target.value)} /></FieldFrame>
                <FieldFrame label="Primary CTA" provenance={provenance("site", "primaryCta")} onReset={() => resetField("site", "primaryCta")} hint="Use /experience, /offers, /register, or another owner-controlled destination; Track A does not implement those downstream flows.">
                  <div className="track-a-inline-fields"><Input aria-label="Primary CTA label" value={draft.site.primaryCta.label} onChange={(event) => updateSite("primaryCta", { ...draft.site.primaryCta, label: event.target.value })} /><Input aria-label="Primary CTA destination" value={draft.site.primaryCta.href} onChange={(event) => updateSite("primaryCta", { ...draft.site.primaryCta, href: event.target.value })} /></div>
                </FieldFrame>
                <FieldFrame label="Secondary CTA" provenance={provenance("site", "secondaryCta")} onReset={() => resetField("site", "secondaryCta")}>
                  <div className="track-a-inline-fields"><Input aria-label="Secondary CTA label" value={draft.site.secondaryCta.label} onChange={(event) => updateSite("secondaryCta", { ...draft.site.secondaryCta, label: event.target.value })} /><Input aria-label="Secondary CTA destination" value={draft.site.secondaryCta.href} onChange={(event) => updateSite("secondaryCta", { ...draft.site.secondaryCta, href: event.target.value })} /></div>
                </FieldFrame>
              </div>
            </details>

            <details>
              <summary>Hero media</summary>
              <div className="track-a-form-grid">
                <FieldFrame label="Media type" provenance={provenance("site", "heroMedia")} onReset={() => resetField("site", "heroMedia")} hint="YouTube, Vimeo, direct video, and images are supported. Playback never gates registration, purchase, or entitlement state.">
                  <Select value={draft.site.heroMedia.kind} onChange={(event) => updateSite("heroMedia", { ...draft.site.heroMedia, kind: event.target.value as OrganizationConfiguration["site"]["heroMedia"]["kind"] })}><option value="none">Nurture default mark</option><option value="image">Image</option><option value="youtube">YouTube</option><option value="vimeo">Vimeo</option><option value="video">Direct video</option></Select>
                </FieldFrame>
                <label className="track-a-field"><span>Media URL</span><Input value={draft.site.heroMedia.url} onChange={(event) => updateSite("heroMedia", { ...draft.site.heroMedia, url: event.target.value })} /></label>
                <label className="track-a-field"><span>Poster / static fallback URL</span><Input value={draft.site.heroMedia.posterUrl ?? ""} onChange={(event) => updateSite("heroMedia", { ...draft.site.heroMedia, posterUrl: event.target.value })} /></label>
                <label className="track-a-field"><span>Alt text / player title</span><Input value={draft.site.heroMedia.alt} onChange={(event) => updateSite("heroMedia", { ...draft.site.heroMedia, alt: event.target.value })} /></label>
                <label className="track-a-field"><span>Source / license page</span><Input value={draft.site.heroMedia.sourceUrl ?? ""} onChange={(event) => updateSite("heroMedia", { ...draft.site.heroMedia, sourceUrl: event.target.value })} /></label>
                <label className="track-a-field"><span>Creator</span><Input value={draft.site.heroMedia.creator ?? ""} onChange={(event) => updateSite("heroMedia", { ...draft.site.heroMedia, creator: event.target.value })} /></label>
                <label className="track-a-field"><span>Rights note</span><TextArea rows={3} value={draft.site.heroMedia.rightsNote ?? ""} onChange={(event) => updateSite("heroMedia", { ...draft.site.heroMedia, rightsNote: event.target.value })} /></label>
                <p className="muted track-a-full-row">Integration fixture: Google's YouTube IFrame API sample can be entered as <code>https://www.youtube.com/watch?v=M7lc1UVf-VE</code> for embed testing. It is not Nurture marketing media.</p>
              </div>
            </details>

            <details>
              <summary>Navigation</summary>
              <div className="track-a-repeat-list">
                {draft.site.navigation.map((item, index) => <div key={item.id} className="track-a-inline-fields"><Input aria-label={`Navigation ${index + 1} label`} value={item.label} onChange={(event) => updateNavigation(index, "label", event.target.value)} /><Input aria-label={`Navigation ${index + 1} destination`} value={item.href} onChange={(event) => updateNavigation(index, "href", event.target.value)} /></div>)}
                <button type="button" className="track-a-reset-link" onClick={() => resetField("site", "navigation")}>Reset navigation to Nurture defaults</button>
              </div>
            </details>

            <details>
              <summary>Feature / value sections</summary>
              <div className="track-a-repeat-list">
                {draft.site.features.map((feature, index) => <Card key={feature.id} className="track-a-feature-editor"><Input aria-label={`Feature ${index + 1} title`} value={feature.title} onChange={(event) => updateFeature(index, "title", event.target.value)} /><TextArea aria-label={`Feature ${index + 1} body`} rows={3} value={feature.body} onChange={(event) => updateFeature(index, "body", event.target.value)} /></Card>)}
                <button type="button" className="track-a-reset-link" onClick={() => resetField("site", "features")}>Reset feature sections to Nurture defaults</button>
              </div>
            </details>

            <details>
              <summary>Proof, contact & footer</summary>
              <div className="track-a-form-grid">
                <FieldFrame label="Proof heading" provenance={provenance("site", "proofHeading")} onReset={() => resetField("site", "proofHeading")}><Input value={draft.site.proofHeading ?? ""} onChange={(event) => updateSite("proofHeading", event.target.value)} /></FieldFrame>
                <FieldFrame label="Proof body" provenance={provenance("site", "proofBody")} onReset={() => resetField("site", "proofBody")}><TextArea rows={4} value={draft.site.proofBody ?? ""} onChange={(event) => updateSite("proofBody", event.target.value)} /></FieldFrame>
                <FieldFrame label="Contact email" provenance={provenance("site", "contactEmail")} onReset={() => resetField("site", "contactEmail")}><Input type="email" value={draft.site.contactEmail ?? ""} onChange={(event) => updateSite("contactEmail", event.target.value)} /></FieldFrame>
                <FieldFrame label="Footer tagline" provenance={provenance("site", "footerTagline")} onReset={() => resetField("site", "footerTagline")}><Input value={draft.site.footerTagline} onChange={(event) => updateSite("footerTagline", event.target.value)} /></FieldFrame>
                <FieldFrame label="Copyright" provenance={provenance("site", "copyrightText")} onReset={() => resetField("site", "copyrightText")}><Input value={draft.site.copyrightText} onChange={(event) => updateSite("copyrightText", event.target.value)} /></FieldFrame>
                <FieldFrame label="Privacy URL" provenance={provenance("site", "privacyHref")} onReset={() => resetField("site", "privacyHref")}><Input value={draft.site.privacyHref} onChange={(event) => updateSite("privacyHref", event.target.value)} /></FieldFrame>
                <FieldFrame label="Terms URL" provenance={provenance("site", "termsHref")} onReset={() => resetField("site", "termsHref")}><Input value={draft.site.termsHref} onChange={(event) => updateSite("termsHref", event.target.value)} /></FieldFrame>
              </div>
            </details>

            <details>
              <summary>Search & social metadata</summary>
              <div className="track-a-form-grid">
                <FieldFrame label="Home page title" provenance={provenance("metadata", "homeTitle")} onReset={() => resetField("metadata", "homeTitle")}><Input value={draft.metadata.homeTitle} onChange={(event) => updateMetadata("homeTitle", event.target.value)} /></FieldFrame>
                <FieldFrame label="Home description" provenance={provenance("metadata", "homeDescription")} onReset={() => resetField("metadata", "homeDescription")}><TextArea rows={4} value={draft.metadata.homeDescription} onChange={(event) => updateMetadata("homeDescription", event.target.value)} /></FieldFrame>
                <FieldFrame label="Social image URL" provenance={provenance("metadata", "socialImageUrl")} onReset={() => resetField("metadata", "socialImageUrl")}><Input value={draft.metadata.socialImageUrl ?? ""} onChange={(event) => updateMetadata("socialImageUrl", event.target.value)} /></FieldFrame>
              </div>
            </details>

            <Card className="track-a-validation-card">
              <div className="card-heading"><div><p className="eyebrow">Readiness</p><h2>Validation</h2></div><Badge tone={errors.length ? "warning" : "positive"}>{errors.length ? "Blocked" : "Publishable"}</Badge></div>
              {!issues.length ? <p>No configuration issues detected.</p> : <ul>{issues.map((issue, index) => <li key={`${issue.field}-${index}`}><strong>{issue.severity === "error" ? "Error" : "Review"}:</strong> {issue.message} <small>({issue.field})</small></li>)}</ul>}
              {warnings.length ? <p className="muted">Warnings do not block this Release 1 preview, but media provenance and static fallbacks should be resolved before production approval.</p> : null}
            </Card>

            <div className="track-a-destructive-row"><button type="button" onClick={resetDraft}>Reset Brand & Site draft to Nurture defaults</button><span>Other feature drafts and published configuration remain unchanged.</span></div>
          </div>
        </fieldset>

        <aside className="track-a-preview-panel">
          <div className="track-a-preview-toolbar">
            <div><p className="eyebrow">Draft preview</p><strong>{draft.brand.applicationName}</strong></div>
            <div role="group" aria-label="Preview size">
              {(["desktop", "tablet", "mobile"] as PreviewViewport[]).map((size) => <button key={size} type="button" className={viewport === size ? "active" : ""} aria-pressed={viewport === size} onClick={() => setViewport(size)}>{size}</button>)}
            </div>
          </div>
          <div className={`track-a-preview-frame track-a-preview-${viewport}`}><PublicSitePreview configuration={draft} /></div>
          <p className="muted">This preview renders the effective Brand & Site draft. Public routes continue to use the active published configuration until an authorized Publish succeeds.</p>

          <Card className="track-a-version-history">
            <h2>Publication history</h2>
            {!record.versions.length ? <p>No explicit organization publication yet. Public routes use safe Nurture defaults.</p> : record.versions.slice().reverse().map((version) => <div key={version.id}><div><strong>Version {version.version}</strong><small>{new Date(version.publishedAt).toLocaleString()}</small></div>{record.publication?.configurationVersionId === version.id ? <Badge tone="positive">Active</Badge> : <Badge>Immutable</Badge>}</div>)}
          </Card>
        </aside>
      </div>
    </div>
  );
}
