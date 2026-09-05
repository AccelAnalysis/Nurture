import { useMemo, useState, type FormEvent } from "react";
import { Button, Card, Input, Select } from "../../components/ui";
import { Link } from "../../router";
import type {
  AuthoritativeCustomerDataMode,
  CaptureLeadResult,
  LeadAttributionCandidates,
  LeadCaptureConfiguration,
} from "../../../shared/customer/contracts.js";
import { customerFoundationClient, createCommandId, createLeadLinkProof } from "./client";
import { pendingLeadLinkFromCapture, savePendingLeadLink } from "./leadLinkProofStore";

export interface LeadCaptureFormProps {
  organizationId: string;
  dataMode: AuthoritativeCustomerDataMode;
  configuration: LeadCaptureConfiguration;
  captureSource: string;
  policyVersion: string;
  attribution?: LeadAttributionCandidates;
  registrationReturnTo?: string;
  onCaptured?: (result: CaptureLeadResult) => void;
}

function registrationHref(props: Pick<LeadCaptureFormProps, "organizationId" | "dataMode" | "captureSource" | "registrationReturnTo">) {
  const query = new URLSearchParams({
    entryPoint: "public",
    organizationId: props.organizationId,
    dataMode: props.dataMode,
    source: props.captureSource,
  });
  if (props.registrationReturnTo) query.set("returnTo", props.registrationReturnTo);
  return `/register?${query.toString()}`;
}

export function LeadCaptureForm(props: LeadCaptureFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [emailMarketing, setEmailMarketing] = useState(false);
  const [smsMarketing, setSmsMarketing] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<CaptureLeadResult | null>(null);
  const attempt = useMemo(() => ({ idempotencyKey: createCommandId("lead-capture"), linkProof: createLeadLinkProof() }), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (props.configuration.emailMarketingConsent === "required" && !emailMarketing) {
        throw new Error("Email marketing permission is required by this form configuration.");
      }
      if (props.configuration.smsMarketingConsent === "required" && !smsMarketing) {
        throw new Error("SMS marketing permission is required by this form configuration.");
      }
      const consents = [];
      if (emailMarketing) consents.push({ channel: "email" as const, purpose: "marketing" as const, decision: "granted" as const, policyVersion: props.configuration.consentPolicyVersion });
      if (smsMarketing) consents.push({ channel: "sms" as const, purpose: "marketing" as const, decision: "granted" as const, policyVersion: props.configuration.consentPolicyVersion });
      const result = await customerFoundationClient.captureLead({
        organizationId: props.organizationId,
        dataMode: props.dataMode,
        idempotencyKey: attempt.idempotencyKey,
        linkProof: attempt.linkProof,
        contact: {
          name: name.trim(),
          email: email.trim(),
          ...(props.configuration.collectPhone !== "hidden" && phone.trim() ? { phone: phone.trim() } : {}),
          ...(props.configuration.collectCompany !== "hidden" && company.trim() ? { company: company.trim() } : {}),
          customFields,
        },
        attribution: props.attribution,
        captureSource: props.captureSource,
        policyVersion: props.policyVersion,
        consents,
        website,
      });
      savePendingLeadLink(pendingLeadLinkFromCapture(result, props.dataMode));
      setCaptured(result);
      props.onCaptured?.(result);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to save your information.");
    } finally {
      setBusy(false);
    }
  };

  if (captured) {
    return (
      <Card className="form-card">
        <p role="status">Your information was saved. Continue when you are ready to create or connect your account.</p>
        <Link className="button" href={registrationHref(props)}>Continue to registration</Link>
      </Card>
    );
  }

  return (
    <Card className="form-card">
      <form onSubmit={submit} noValidate={false}>
        <label>Name<Input required autoComplete="name" value={name} maxLength={160} onChange={(event) => setName(event.target.value)} /></label>
        <label>Email<Input required autoComplete="email" type="email" value={email} maxLength={320} onChange={(event) => setEmail(event.target.value)} /></label>
        {props.configuration.collectPhone !== "hidden" ? (
          <label>Phone<Input required={props.configuration.collectPhone === "required"} autoComplete="tel" type="tel" value={phone} maxLength={40} onChange={(event) => setPhone(event.target.value)} /></label>
        ) : null}
        {props.configuration.collectCompany !== "hidden" ? (
          <label>Company<Input required={props.configuration.collectCompany === "required"} autoComplete="organization" value={company} maxLength={160} onChange={(event) => setCompany(event.target.value)} /></label>
        ) : null}
        {props.configuration.customFields.map((field) => (
          <label key={field.id}>
            {field.label}
            {field.type === "select" ? (
              <Select required={field.required} value={customFields[field.id] ?? ""} onChange={(event) => setCustomFields((current) => ({ ...current, [field.id]: event.target.value }))}>
                <option value="">Select…</option>
                {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            ) : (
              <Input required={field.required} maxLength={field.maxLength ?? 500} value={customFields[field.id] ?? ""} onChange={(event) => setCustomFields((current) => ({ ...current, [field.id]: event.target.value }))} />
            )}
          </label>
        ))}
        {props.configuration.emailMarketingConsent !== "hidden" ? (
          <label className="toggle-row">
            <span>Send me relevant email updates<small>Marketing permission · policy {props.configuration.consentPolicyVersion}</small></span>
            <input type="checkbox" checked={emailMarketing} required={props.configuration.emailMarketingConsent === "required"} onChange={(event) => setEmailMarketing(event.target.checked)} />
          </label>
        ) : null}
        {props.configuration.smsMarketingConsent !== "hidden" ? (
          <label className="toggle-row">
            <span>Allow SMS marketing<small>Permission is recorded separately. Release 2 does not send SMS.</small></span>
            <input type="checkbox" checked={smsMarketing} required={props.configuration.smsMarketingConsent === "required"} onChange={(event) => setSmsMarketing(event.target.checked)} />
          </label>
        ) : null}
        <label style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
          Website<Input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
        </label>
        {error ? <p className="form-message" role="alert">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Continue"}</Button>
      </form>
    </Card>
  );
}
