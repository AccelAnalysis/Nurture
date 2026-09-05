import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type { UserPreferences } from "../../types/models";
import { Button, Card, Input, LoadingState, PageHeader, Select, TextArea } from "../../components/ui";
import { emitIdentityLifecycleSignal } from "../identity/events";
import type { CustomerProfileChanges } from "../identity/model/contracts";
import { useAuth } from "../identity/auth";
import { Link, navigate, useRoute } from "../../router";
import { defaultOnboardingDefinition } from "./model/defaultDefinition";
import type { OnboardingFieldDefinition, OnboardingState, OnboardingValue } from "./model/contracts";
import { onboardingRepository } from "./services/onboardingRepository";

export const onboardingRoutePrefix = "/onboarding";

function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

function routeFor(stepRoute: string, returnTo: string) {
  return `${onboardingRoutePrefix}/${stepRoute}?returnTo=${encodeURIComponent(returnTo)}`;
}

function fieldValue(field: OnboardingFieldDefinition, state: OnboardingState, profile: NonNullable<ReturnType<typeof useAuth>["customerProfile"]>): OnboardingValue {
  const existing = state.answers[field.id];
  if (existing !== undefined) return existing;
  if (field.profileField) return profile[field.profileField] ?? "";
  if (field.preferenceField) return profile.preferences[field.preferenceField] as OnboardingValue;
  return field.type === "checkbox" ? false : "";
}

export function OnboardingRouteBoundary({ step }: { step?: string }) {
  const route = useRoute();
  const { firebaseUser, customerProfile, updateCustomerProfile } = useAuth();
  const definition = defaultOnboardingDefinition;
  const returnTo = safeReturnTo(route.query.get("returnTo"));
  const [progress, setProgress] = useState<OnboardingState | null>(null);
  const [draft, setDraft] = useState<Record<string, OnboardingValue>>({});
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser || !customerProfile) return;
    let active = true;
    const load = async () => {
      try {
        if (definition.requiresVerifiedEmail && !firebaseUser.emailVerified) {
          navigate(`/verify-email?returnTo=${encodeURIComponent(`${onboardingRoutePrefix}?returnTo=${encodeURIComponent(returnTo)}`)}`, true);
          return;
        }
        const result = await onboardingRepository.loadOrCreate(definition, firebaseUser.uid, customerProfile.customerId);
        if (!active) return;
        setProgress(result.state);
        if (result.created) {
          await updateCustomerProfile({ onboardingStatus: "in-progress" });
          emitIdentityLifecycleSignal("onboarding.started", {
            identityId: firebaseUser.uid,
            customerId: customerProfile.customerId,
          }, { definitionId: definition.id, definitionVersion: definition.version });
        }
        if (result.state.status === "complete") {
          navigate(returnTo, true);
          return;
        }
        const current = definition.steps.find((item) => item.id === result.state.currentStepId);
        if (current && step !== current.route) navigate(routeFor(current.route, returnTo), true);
      } catch (reason: unknown) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load onboarding.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [customerProfile?.customerId, firebaseUser?.uid, step]);

  const activeStep = useMemo(() => {
    if (!progress?.currentStepId) return null;
    return definition.steps.find((item) => item.id === progress.currentStepId) ?? null;
  }, [progress]);

  useEffect(() => {
    if (!activeStep || !progress || !customerProfile) return;
    const nextDraft = Object.fromEntries((activeStep.fields ?? []).map((field) => [field.id, fieldValue(field, progress, customerProfile)]));
    setDraft(nextDraft);
    const agreement = activeStep.agreement;
    setAgreementAccepted(Boolean(agreement && progress.acceptedAgreements[agreement.id]?.version === agreement.version));
    setError(null);
  }, [activeStep?.id, customerProfile?.updatedAt, progress?.lastActivityAt]);

  if (!progress || !activeStep || !customerProfile || !firebaseUser) {
    return <main className="auth-shell"><LoadingState label="Preparing onboarding…" /></main>;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await onboardingRepository.completeStep(definition, progress, activeStep.id, draft, agreementAccepted);

      const profileChanges: CustomerProfileChanges = {};
      const preferenceChanges: Partial<UserPreferences> = {};
      for (const field of activeStep.fields ?? []) {
        const value = draft[field.id];
        if (field.profileField) Object.assign(profileChanges, { [field.profileField]: typeof value === "string" ? value.trim() || null : null });
        if (field.preferenceField && value !== undefined) Object.assign(preferenceChanges, { [field.preferenceField]: value });
      }
      if (Object.keys(preferenceChanges).length) profileChanges.preferences = preferenceChanges;
      if (Object.keys(profileChanges).length) await updateCustomerProfile(profileChanges);

      emitIdentityLifecycleSignal("onboarding.step_completed", {
        identityId: firebaseUser.uid,
        customerId: customerProfile.customerId,
      }, { stepId: activeStep.id, definitionVersion: definition.version });

      if (next.status === "complete") {
        await updateCustomerProfile({ onboardingStatus: "complete" });
        emitIdentityLifecycleSignal("onboarding.completed", {
          identityId: firebaseUser.uid,
          customerId: customerProfile.customerId,
        }, { definitionId: definition.id, definitionVersion: definition.version });
        navigate(returnTo, true);
        return;
      }

      setProgress(next);
      const nextStep = definition.steps.find((item) => item.id === next.currentStepId);
      if (nextStep) navigate(routeFor(nextStep.route, returnTo), true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to save this onboarding step.");
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await onboardingRepository.skipCurrentStep(definition, progress);
      setProgress(next);
      const nextStep = definition.steps.find((item) => item.id === next.currentStepId);
      if (nextStep) navigate(routeFor(nextStep.route, returnTo), true);
      else navigate(returnTo, true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to skip this onboarding step.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <Link className="brand" href="/"><img src="/brand/logo/nurture-n.svg" alt="" /><span>Nurture</span></Link>
      <section className="auth-card-wrap">
        <PageHeader eyebrow="Registration + onboarding" title={activeStep.label} description={activeStep.description} />
        <Card>
          <p>{definition.welcomeBody}</p>
          <ol className="compact-steps" aria-label="Onboarding progress">
            {definition.steps.map((item) => {
              const status = progress.steps[item.id];
              return <li key={item.id} className={status === "complete" ? "done" : status === "current" ? "active" : undefined}>{item.label}</li>;
            })}
          </ol>
        </Card>
        <Card className="form-card">
          <form onSubmit={submit}>
            {(activeStep.fields ?? []).map((field) => (
              <OnboardingField key={field.id} field={field} value={draft[field.id]} onChange={(value) => setDraft((current) => ({ ...current, [field.id]: value }))} />
            ))}
            {activeStep.agreement ? (
              <label className="toggle-row">
                <span>
                  {activeStep.agreement.label} <small>Version {activeStep.agreement.version}</small>
                  {activeStep.agreement.href ? <> · <a href={activeStep.agreement.href} target="_blank" rel="noreferrer">Review</a></> : null}
                </span>
                <input type="checkbox" checked={agreementAccepted} onChange={(event: ChangeEvent<HTMLInputElement>) => setAgreementAccepted(event.target.checked)} required={activeStep.agreement.required} />
              </label>
            ) : null}
            {activeStep.id === "ready" ? <p>Your account setup is ready. Continuing marks onboarding complete and hands you to the participant application.</p> : null}
            {error ? <p className="form-message" role="alert">{error}</p> : null}
            <div className="demo-actions">
              <Button disabled={busy}>{busy ? "Saving…" : activeStep.id === "ready" ? "Finish onboarding" : "Continue"}</Button>
              {activeStep.optional ? <Button type="button" className="button-secondary" disabled={busy} onClick={skip}>Skip for now</Button> : null}
            </div>
          </form>
        </Card>
      </section>
    </main>
  );
}

function OnboardingField({ field, value, onChange }: { field: OnboardingFieldDefinition; value: OnboardingValue | undefined; onChange: (value: OnboardingValue) => void }) {
  if (field.type === "checkbox") {
    return (
      <label className="toggle-row">
        <span>{field.label}<small>{field.purpose}</small></span>
        <input type="checkbox" checked={Boolean(value)} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)} />
      </label>
    );
  }
  if (field.type === "textarea") {
    return <label>{field.label}<TextArea required={field.required} placeholder={field.placeholder} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} /><small>{field.purpose}</small></label>;
  }
  if (field.type === "select") {
    return <label>{field.label}<Select required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select><small>{field.purpose}</small></label>;
  }
  return <label>{field.label}<Input required={field.required} type={field.type} placeholder={field.placeholder} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} /><small>{field.purpose}</small></label>;
}
