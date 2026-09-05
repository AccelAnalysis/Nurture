import { useState } from "react";
import {
  REFERENCE_CHECKLIST_ITEMS,
  REFERENCE_CHECKLIST_MILESTONE_KEY,
} from "../../../../shared/experience/reference-lifecycle";
import { Badge, Card } from "../../../components/ui";
import type { ExperienceModule, ExperienceModuleRenderContext } from "../contracts";

function completionActionId(context: ExperienceModuleRenderContext) {
  const subject = context.customerId ?? context.identityId ?? "public-session";
  return `reference-checklist-completed:${context.experience.id}:${subject}:v1`;
}

function Checklist({ context }: { context: ExperienceModuleRenderContext }) {
  const [complete, setComplete] = useState<Set<string>>(() => new Set());
  const allComplete = complete.size === REFERENCE_CHECKLIST_ITEMS.length;

  const toggle = (itemId: string) => {
    const next = new Set(complete);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    setComplete(next);
    context.submitEvent("experience.reference-checklist.item_toggled", { itemId, complete: next.has(itemId) });
    if (next.size === REFERENCE_CHECKLIST_ITEMS.length) {
      const actionId = completionActionId(context);
      context.submitEvent(
        "experience.reference-checklist.completed",
        { itemCount: REFERENCE_CHECKLIST_ITEMS.length },
        actionId,
      );
      void context.reachMilestone(
        REFERENCE_CHECKLIST_MILESTONE_KEY,
        actionId,
        { completedItemIds: Array.from(next) },
      );
    }
  };

  return (
    <Card>
      <Badge tone={allComplete ? "positive" : "accent"}>{allComplete ? "Complete" : "Portability fixture"}</Badge>
      <h2>{typeof context.configuration.title === "string" ? context.configuration.title : "Next-Step Checklist"}</h2>
      <p>This secondary module is intentionally a different domain from the assessment fixture. It uses the same host identity, routing, access, typed activity, and trusted milestone command contracts.</p>
      <div className="reference-checklist" role="group" aria-label="Reference checklist">
        {REFERENCE_CHECKLIST_ITEMS.map((item) => (
          <label key={item.id} className="reference-checklist-row">
            <input type="checkbox" checked={complete.has(item.id)} onChange={() => toggle(item.id)} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      <p className="muted">This fixture is not a second lifecycle engine and does not define Nurture's business domain.</p>
    </Card>
  );
}

export const referenceChecklistModule: ExperienceModule = {
  manifest: {
    id: "nurture.reference-checklist",
    version: "1.0.0",
    contractVersion: "1.1.0",
    name: "Next-Step Checklist",
    description: "A second minimal module used to prove that a different Experience can register without changing the host lifecycle architecture.",
    icon: "/brand/logo/nurture-n.svg",
    routes: [
      { path: "", label: "Checklist", access: ["authenticated"], capability: "nurture.reference-checklist.use" },
    ],
    navigation: [
      { path: "", label: "Checklist", description: "A second-domain portability fixture.", access: ["authenticated"], capability: "nurture.reference-checklist.use" },
    ],
    configurationSchema: {
      title: { type: "string", label: "Checklist title", required: true },
    },
    defaults: {
      title: "Next-Step Checklist",
    },
    capabilities: [
      {
        key: "nurture.reference-checklist.use",
        label: "Checklist",
        description: "Use the authenticated secondary reference Experience.",
        availability: ["authenticated"],
      },
    ],
    eventDefinitions: [
      {
        name: "experience.reference-checklist.item_toggled",
        description: "Browser-observed ordinary checklist interaction.",
        source: "browser",
        schemaVersion: 1,
        maxPayloadBytes: 384,
        payloadSchema: {
          itemId: {
            type: "string",
            required: true,
            maxLength: 40,
            allowedValues: REFERENCE_CHECKLIST_ITEMS.map((item) => item.id),
          },
          complete: { type: "boolean", required: true },
        },
      },
      {
        name: "experience.reference-checklist.completed",
        description: "Browser-observed checklist completion candidate; shared activation still requires trusted validation.",
        source: "browser",
        schemaVersion: 1,
        maxPayloadBytes: 256,
        payloadSchema: {
          itemCount: {
            type: "number",
            required: true,
            integer: true,
            min: REFERENCE_CHECKLIST_ITEMS.length,
            max: REFERENCE_CHECKLIST_ITEMS.length,
          },
        },
        requiresServerValidation: true,
      },
    ],
    profileRequirements: [],
    onboardingRequirements: [],
    activityDefinition: {
      meaningfulEvent: "experience.reference-checklist.completed",
      description: "Completing the checklist is meaningful activity; opening the route is not activation.",
      pageViewCountsAsActivity: false,
      activation: {
        moduleEvent: "experience.reference-checklist.completed",
        milestoneKey: REFERENCE_CHECKLIST_MILESTONE_KEY,
        verification: "trusted-domain-action",
      },
    },
    dataContract: {
      scope: "session-only",
      retention: "This fixture is intentionally non-persistent.",
      export: "No durable checklist data is created.",
      migration: "No persisted checklist records exist in the reference fixture.",
    },
    compatibility: {
      hostContract: "1.x",
      hostVersion: ">=0.1.0",
      unavailableBehavior: "Host renders a standardized unavailable state.",
    },
  },
  render(context) {
    return <Checklist context={context} />;
  },
};
