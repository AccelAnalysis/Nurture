import { useState } from "react";
import { Badge, Card } from "../../../components/ui";
import type { ExperienceModule, ExperienceModuleRenderContext } from "../contracts";

const checklistItems = ["Choose the next action", "Set aside focused time", "Return and mark it complete"] as const;

function Checklist({ context }: { context: ExperienceModuleRenderContext }) {
  const [complete, setComplete] = useState<Set<number>>(() => new Set());
  const allComplete = complete.size === checklistItems.length;

  const toggle = (index: number) => {
    const next = new Set(complete);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setComplete(next);
    context.submitEvent("experience.reference-checklist.item_toggled", { item: index + 1, complete: next.has(index) });
    if (next.size === checklistItems.length) {
      context.submitEvent(
        "experience.reference-checklist.completed",
        { itemCount: checklistItems.length },
        `reference-checklist-completed-${context.experience.id}`,
      );
    }
  };

  return (
    <Card>
      <Badge tone={allComplete ? "positive" : "accent"}>{allComplete ? "Complete" : "Portability fixture"}</Badge>
      <h2>{typeof context.configuration.title === "string" ? context.configuration.title : "Next-Step Checklist"}</h2>
      <p>This secondary module is intentionally a different domain from the assessment fixture. It uses the same host identity, routing, access, state, and event contracts.</p>
      <div className="reference-checklist" role="group" aria-label="Reference checklist">
        {checklistItems.map((item, index) => (
          <label key={item} className="reference-checklist-row">
            <input type="checkbox" checked={complete.has(index)} onChange={() => toggle(index)} />
            <span>{item}</span>
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
    contractVersion: "1.0.0",
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
        description: "Browser-observed checklist interaction.",
        source: "browser",
      },
      {
        name: "experience.reference-checklist.completed",
        description: "Browser-observed completion of the secondary portability fixture.",
        source: "browser",
        requiresServerValidation: true,
      },
    ],
    profileRequirements: [],
    onboardingRequirements: [],
    activityDefinition: {
      meaningfulEvent: "experience.reference-checklist.completed",
      description: "Completing the checklist is meaningful activity; opening the page is not.",
      pageViewCountsAsActivity: false,
    },
    dataContract: {
      scope: "session-only",
      retention: "This fixture is intentionally non-persistent.",
      export: "No durable checklist data is created.",
      migration: "No persisted module records exist in the reference fixture.",
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
