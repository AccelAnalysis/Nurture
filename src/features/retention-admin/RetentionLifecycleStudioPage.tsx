import { useEffect, useMemo, useState } from "react";
import { functions } from "../../firebase";
import { LoadingState, EmptyState } from "../../components/ui";
import type { AutomationDefinitionV3 } from "../../../shared/release3/contracts";
import { FirebaseRelease3LifecycleStudioPort } from "./firebasePort";
import { RetentionLifecycleStudio } from "./RetentionLifecycleStudio";

function starterDefinition(organizationId: string): AutomationDefinitionV3 {
  return {
    id: "retention-starter",
    organizationId,
    version: 1,
    name: "Retention starter",
    kind: "re-engagement",
    trigger: { eventType: "experience.inactive", schemaVersion: 1 },
    audience: { mode: "all", predicates: [{ fact: "engagement.state", operator: "eq", value: "inactive" }] },
    branches: [{ id: "default", actions: [{ type: "in-app", templateId: "retention-starter", templateVersion: 1, placementId: "experience.primary", purpose: "promotional" }] }],
    reentry: { kind: "after-cooldown", cooldownHours: 168 },
    conflict: { group: "retention", priority: "retention", caps: { customerPerDay: 1, customerPerWeek: 2, channelPerDay: 1 } },
    mode: "preview",
    enabled: false,
  };
}

export function RetentionLifecycleStudioPage({ organizationId, canPublish, canOperate }: { organizationId: string; canPublish: boolean; canOperate: boolean }) {
  const port = useMemo(() => functions ? new FirebaseRelease3LifecycleStudioPort(functions) : null, []);
  const [definition, setDefinition] = useState<AutomationDefinitionV3 | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!port) { setError("The authoritative lifecycle backend is unavailable."); return; }
    port.loadDefinitions(organizationId)
      .then((definitions) => {
        if (!cancelled) setDefinition(definitions.sort((a, b) => b.version - a.version)[0] ?? starterDefinition(organizationId));
      })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Lifecycle studio could not be loaded."); });
    return () => { cancelled = true; };
  }, [organizationId, port]);

  if (error) return <EmptyState title="Lifecycle studio unavailable" description={error} />;
  if (!port || !definition) return <LoadingState label="Loading Release 3 lifecycle studio…" />;
  return <RetentionLifecycleStudio key={`${organizationId}:${definition.id}:${definition.version}`} organizationId={organizationId} initialDefinition={definition} canPublish={canPublish} canOperate={canOperate} port={port} />;
}
