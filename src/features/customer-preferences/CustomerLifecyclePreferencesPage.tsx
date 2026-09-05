import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { EmptyState, LoadingState } from "../../components/ui";
import { useOrganization } from "../../context/OrganizationContext";
import { functions } from "../../firebase";
import type { CustomerControlSnapshot } from "../../../shared/release3/customer-control";
import { CustomerLifecyclePreferences } from "./CustomerLifecyclePreferences";
import { FirebaseCustomerLifecycleControlPort } from "./firebasePort";

export function CustomerLifecyclePreferencesPage() {
  const { currentOrganizationId } = useOrganization();
  const port = useMemo(() => functions ? new FirebaseCustomerLifecycleControlPort(functions) : null, []);
  const [customerId, setCustomerId] = useState<string>();
  const [snapshot, setSnapshot] = useState<CustomerControlSnapshot>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setCustomerId(undefined); setSnapshot(undefined); setError(undefined);
    if (!functions || !port || !currentOrganizationId) { setError("Lifecycle preferences require an active organization and Firebase Functions."); return; }
    const resolve = httpsCallable<{ organizationId: string }, { status: string; customerId: string }>(functions, "resolveExperienceCustomer");
    void resolve({ organizationId: currentOrganizationId })
      .then((result) => {
        if (cancelled || result.data.status !== "ready") return;
        setCustomerId(result.data.customerId);
        return port.load(currentOrganizationId, result.data.customerId).then((loaded) => { if (!cancelled) setSnapshot(loaded); });
      })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Lifecycle preferences could not be loaded."); });
    return () => { cancelled = true; };
  }, [currentOrganizationId, port]);

  if (error) return <EmptyState title="Lifecycle preferences unavailable" description={error} />;
  if (!currentOrganizationId || !customerId || !snapshot || !port) return <LoadingState label="Loading lifecycle preferences…" />;
  return <CustomerLifecyclePreferences organizationId={currentOrganizationId} customerId={customerId} initial={snapshot} port={port} />;
}
