import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useOrganization } from "../../context/OrganizationContext";
import { functions } from "../../firebase";
import { FirebaseExperienceRetentionBridge } from "./firebaseRetentionBridge";
import { InAppTreatmentSurface } from "./InAppTreatmentSurface";
import { ExperienceHost } from "./ExperienceHost";
import type { ExperienceAccessMode, ExperienceSlot } from "./contracts";

export function ExperienceRetentionHost({ slot, accessMode, relativePath = "" }: { slot: ExperienceSlot; accessMode: ExperienceAccessMode; relativePath?: string }) {
  const { currentOrganizationId } = useOrganization();
  const [customerId, setCustomerId] = useState<string>();
  const bridge = useMemo(() => functions ? new FirebaseExperienceRetentionBridge(functions) : null, []);

  useEffect(() => {
    let cancelled = false;
    setCustomerId(undefined);
    if (accessMode !== "authenticated" || !functions || !currentOrganizationId) return;
    const callable = httpsCallable<{ organizationId: string }, { status: string; customerId: string }>(functions, "resolveExperienceCustomer");
    void callable({ organizationId: currentOrganizationId })
      .then((result) => { if (!cancelled && result.data.status === "ready") setCustomerId(result.data.customerId); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [accessMode, currentOrganizationId]);

  const placementId = slot === "primary" ? "experience.primary" : "experience.secondary";
  return <>
    {bridge && accessMode === "authenticated" && currentOrganizationId && customerId ? <InAppTreatmentSurface
      context={{ organizationId: currentOrganizationId, customerId, experienceId: `${currentOrganizationId}:${slot}`, mode: "authenticated" }}
      placementId={placementId}
      bridge={bridge}
    /> : null}
    <ExperienceHost slot={slot} accessMode={accessMode} relativePath={relativePath} />
  </>;
}
