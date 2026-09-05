import type { OnboardingFlowDefinitionV2 } from "./contracts.js";

/** Nurture-owned fallback. Organization overrides stay in Track A's opaque configuration extension. */
export const defaultOnboardingFlowV2: OnboardingFlowDefinitionV2 = {
  schemaVersion: 2,
  id: "nurture.default",
  version: "2.0.0",
  welcomeTitle: "Welcome",
  welcomeBody: "Complete the required setup, then continue into your Experience.",
  requiresVerifiedEmail: true,
  completionPolicy: "all-required-steps",
  steps: [
    {
      id: "profile",
      route: "profile",
      label: "Profile",
      description: "Add the minimum profile information this organization needs.",
      required: true,
      questions: [
        { id: "displayName", label: "Display name", type: "text", required: true, purpose: "Used to address you in this organization.", profileField: "displayName" },
        { id: "phone", label: "Phone", type: "tel", required: false, purpose: "Optional contact detail. This does not grant SMS marketing consent.", profileField: "phone" },
        { id: "company", label: "Company", type: "text", required: false, purpose: "Optional organization-specific profile detail.", profileField: "company" },
      ],
    },
    {
      id: "ready",
      route: "ready",
      label: "Ready",
      description: "Review setup and continue into the Experience.",
      required: true,
      questions: [],
    },
  ],
};
