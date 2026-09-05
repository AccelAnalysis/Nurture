import type { ExperienceRetentionManifest } from "./retention";

export const assessmentRetentionManifest: ExperienceRetentionManifest = {
  experienceId: "nurture.reference-assessment",
  moduleVersion: "1.0.0",
  meaningfulActivities: [
    {
      key: "assessment.completed",
      label: "Assessment completed",
      description: "A validated assessment completion returned by the reference Experience.",
      establishesActivation: true,
      supportsReactivation: true,
      payloadKeys: ["resultBand"],
    },
  ],
  premiumCapabilities: [
    {
      capabilityKey: "assessment.insights.premium",
      label: "Premium insights",
      placementId: "experience.contextual",
      safeReturnPath: "/app/experience",
    },
  ],
  placements: [{ id: "experience.contextual", label: "Contextual Experience message", presentation: "card" }],
};

export const checklistRetentionManifest: ExperienceRetentionManifest = {
  experienceId: "nurture.portability-checklist",
  moduleVersion: "1.0.0",
  meaningfulActivities: [
    {
      key: "checklist.milestone.completed",
      label: "Checklist milestone completed",
      description: "A validated domain milestone from a different Experience fixture.",
      supportsReactivation: true,
      payloadKeys: ["milestoneKey"],
    },
  ],
  premiumCapabilities: [
    {
      capabilityKey: "checklist.advanced-guidance",
      label: "Advanced guidance",
      placementId: "experience.contextual",
      safeReturnPath: "/app/experience",
    },
  ],
  placements: [{ id: "experience.contextual", label: "Contextual Experience message", presentation: "card" }],
};
