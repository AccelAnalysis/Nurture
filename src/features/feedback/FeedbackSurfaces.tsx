import { useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/ui";
import { functions } from "../../firebase";
import { createFeedbackClient, feedbackFragment } from "./client";
import { FeedbackAdminPage } from "./FeedbackAdminPage";
import { ReferralCenter, SurveyPage } from "./ParticipantFeedback";
import type { ConfigurationKind } from "../../../shared/feedback/api";

function applicationKey(organizationId: string) {
  return `org:${organizationId}`;
}
function proofKey(organizationId: string) {
  return `nurture:r4:referral:${organizationId}`;
}
function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function PublicSurveySurface({ organizationId }: { organizationId: string }) {
  const api = useMemo(() => functions ? createFeedbackClient(functions, applicationKey(organizationId)) : null, [organizationId]);
  const token = typeof window === "undefined" ? null : feedbackFragment(window.location.hash, "invitation");
  if (!api) return <ErrorState message="Feedback is unavailable because the application backend is not configured." />;
  return <div className="content-width page-section"><SurveyPage api={api} token={token} /></div>;
}

/** Capture only an opaque referral receipt. A forged/tampered value has no authority and fails server validation. */
export function PublicReferralCapture({ organizationId }: { organizationId: string }) {
  const api = useMemo(() => functions ? createFeedbackClient(functions, applicationKey(organizationId)) : null, [organizationId]);
  const [state, setState] = useState<"idle" | "capturing" | "captured" | "unavailable">("idle");
  useEffect(() => {
    if (!api || typeof window === "undefined") return;
    const code = feedbackFragment(window.location.hash, "referral");
    if (!code) return;
    let live = true; const store = storage(); const previousProof = store?.getItem(proofKey(organizationId)) ?? undefined;
    setState("capturing");
    void api.capture(code, previousProof).then(result => {
      if (!live) return;
      store?.setItem(proofKey(organizationId), result.proof);
      setState("captured");
      if (window.location.hash.includes("referral=")) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }, () => { if (live) setState("unavailable"); });
    return () => { live = false; };
  }, [api, organizationId]);
  if (state === "capturing") return <p className="content-width feedback-notice" role="status">Applying referral attribution…</p>;
  if (state === "captured") return <p className="content-width feedback-notice" role="status">Referral attribution recorded. Continue normally; your access and choices are unchanged.</p>;
  if (state === "unavailable") return <p className="content-width feedback-notice" role="status">This referral link could not be applied. You can still continue normally.</p>;
  return null;
}

/** Bind the opaque public receipt only after the existing identity/customer boundary can resolve the authenticated customer. */
export function PendingReferralBinding({ organizationId }: { organizationId: string }) {
  const api = useMemo(() => functions ? createFeedbackClient(functions, applicationKey(organizationId)) : null, [organizationId]);
  useEffect(() => {
    if (!api) return;
    const store = storage(); const proof = store?.getItem(proofKey(organizationId)); if (!proof) return;
    let live = true;
    void api.bind(proof).then(result => {
      if (!live) return;
      if (["registered", "pending-qualification", "qualified", "rejected", "reversed"].includes(result.status)) store?.removeItem(proofKey(organizationId));
    }, () => undefined);
    return () => { live = false; };
  }, [api, organizationId]);
  return null;
}

export function ParticipantReferralSurface({ organizationId }: { organizationId: string }) {
  const api = useMemo(() => functions ? createFeedbackClient(functions, applicationKey(organizationId)) : null, [organizationId]);
  if (!api) return <ErrorState message="Referrals are unavailable because the application backend is not configured." />;
  return <ReferralCenter api={api} programId="primary-referral-program" publicOrigin={window.location.origin} />;
}

export function OrganizationFeedbackAdminSurface({ organizationId, kind }: { organizationId: string; kind: ConfigurationKind }) {
  const api = useMemo(() => functions ? createFeedbackClient(functions, applicationKey(organizationId)) : null, [organizationId]);
  if (!api) return <ErrorState message="Feedback administration is unavailable because the application backend is not configured." />;
  return <FeedbackAdminPage api={api} initialKind={kind} />;
}

export function FeedbackBackendPending() {
  return <LoadingState label="Preparing feedback services…" />;
}
