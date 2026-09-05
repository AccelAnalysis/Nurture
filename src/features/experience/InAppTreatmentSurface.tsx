import { useEffect, useRef, useState } from "react";
import type { InAppTreatmentIntent } from "../../../shared/release3/contracts";
import { buildTreatmentInteraction, type ExperienceRetentionBridge, type ExperienceRetentionContext } from "./retention";
import "./retention.css";

export interface InAppTreatmentSurfaceProps {
  context: ExperienceRetentionContext;
  placementId: string;
  bridge: ExperienceRetentionBridge;
  onCommercialNavigation?: (href: string) => void;
}

export function InAppTreatmentSurface({ context, placementId, bridge, onCommercialNavigation }: InAppTreatmentSurfaceProps) {
  const [treatment, setTreatment] = useState<InAppTreatmentIntent | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "dismissed" | "expired" | "error">("loading");
  const [error, setError] = useState<string>();
  const presented = useRef<string>();

  useEffect(() => {
    let active = true;
    setState("loading");
    setError(undefined);
    void bridge.loadTreatment({ context, placementId }).then((next) => {
      if (!active) return;
      if (!next) { setTreatment(null); setState("empty"); return; }
      if (next.expiresAt && Date.parse(next.expiresAt) <= Date.now()) { setTreatment(null); setState("expired"); return; }
      setTreatment(next);
      setState("ready");
    }).catch((cause) => {
      if (!active) return;
      setState("error");
      setError(cause instanceof Error ? cause.message : "Unable to load lifecycle treatment.");
    });
    return () => { active = false; };
  }, [bridge, context, placementId]);

  useEffect(() => {
    if (state !== "ready" || !treatment || presented.current === treatment.treatmentId) return;
    presented.current = treatment.treatmentId;
    void bridge.recordTreatmentInteraction(buildTreatmentInteraction({ treatment, interaction: "presented", occurredAt: new Date().toISOString() }));
  }, [bridge, state, treatment]);

  async function dismiss() {
    if (!treatment) return;
    await bridge.recordTreatmentInteraction(buildTreatmentInteraction({ treatment, interaction: "dismissed", occurredAt: new Date().toISOString() }));
    setState("dismissed");
  }

  async function act() {
    if (!treatment?.cta) return;
    await bridge.recordTreatmentInteraction(buildTreatmentInteraction({ treatment, interaction: "acted", occurredAt: new Date().toISOString() }));
    const handoff = await bridge.startCommercialHandoff({ context, treatment });
    if (onCommercialNavigation) onCommercialNavigation(handoff.href);
    else window.location.assign(handoff.href);
  }

  if (state === "loading") return <p className="r3-treatment__status" aria-live="polite">Checking for current lifecycle treatment…</p>;
  if (state === "error") return <p className="r3-treatment__status" role="status">{error}</p>;
  if (state === "empty" || state === "dismissed" || state === "expired" || !treatment) return null;

  return <aside className="r3-treatment" aria-labelledby={`${treatment.treatmentId}-title`}>
    <div className="r3-treatment__header">
      <div><p className="r3-treatment__status">Nurture lifecycle message</p><h2 id={`${treatment.treatmentId}-title`}>{treatment.title}</h2></div>
      <button type="button" onClick={() => void dismiss()} aria-label={`Dismiss ${treatment.title}`}>Dismiss</button>
    </div>
    <p>{treatment.body}</p>
    {treatment.cta ? <div className="r3-treatment__actions"><button type="button" onClick={() => void act()}>{treatment.cta.label}</button></div> : null}
  </aside>;
}
