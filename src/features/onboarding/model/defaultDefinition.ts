import { identityPolicy } from "../../identity/policy";
import type { OnboardingDefinition, OnboardingExtension, OnboardingStepDefinition } from "./contracts";

export const defaultOnboardingDefinition: OnboardingDefinition = {
  id: "nurture.release-1.default",
  version: "1.0.0",
  welcomeTitle: "Set up your Nurture profile",
  welcomeBody: "Complete the minimum account setup, then continue into your participant experience.",
  requiresVerifiedEmail: identityPolicy.requireEmailVerificationBeforeOnboarding,
  steps: [
    {
      id: "profile",
      route: "profile",
      label: "Profile",
      description: "Add the minimum information Experiences can use to address you appropriately.",
      optional: false,
      fields: [
        {
          id: "displayName",
          label: "Display name",
          type: "text",
          required: true,
          purpose: "Shown in participant account surfaces.",
          profileField: "displayName",
          placeholder: "How should Nurture address you?",
        },
        {
          id: "firstName",
          label: "First name",
          type: "text",
          required: false,
          purpose: "Optional profile detail for Experiences that need a first name.",
          profileField: "firstName",
        },
        {
          id: "lastName",
          label: "Last name",
          type: "text",
          required: false,
          purpose: "Optional profile detail for Experiences that need a last name.",
          profileField: "lastName",
        },
        {
          id: "phone",
          label: "Phone",
          type: "tel",
          required: false,
          purpose: "Optional account contact detail. It does not grant SMS marketing consent.",
          profileField: "phone",
          placeholder: "Optional",
        },
      ],
    },
    {
      id: "preferences",
      route: "preferences",
      label: "Preferences",
      description: "Choose default account notification preferences. Consent-specific messaging rules remain separate.",
      optional: false,
      fields: [
        {
          id: "emailNotifications",
          label: "Email account notifications",
          type: "checkbox",
          required: false,
          purpose: "Controls account notification preference; it is not marketing consent.",
          preferenceField: "emailNotifications",
        },
        {
          id: "smsNotifications",
          label: "SMS account notifications",
          type: "checkbox",
          required: false,
          purpose: "Controls account notification preference; it is not marketing consent.",
          preferenceField: "smsNotifications",
        },
        {
          id: "pushNotifications",
          label: "In-app and push notifications",
          type: "checkbox",
          required: false,
          purpose: "Controls participant notification preference where supported.",
          preferenceField: "pushNotifications",
        },
      ],
    },
    {
      id: "ready",
      route: "ready",
      label: "Ready",
      description: "Review completion and continue into the participant application.",
      optional: false,
    },
  ],
};

function namespacedStep(extension: OnboardingExtension, step: OnboardingStepDefinition): OnboardingStepDefinition {
  const prefix = `${extension.source}.${extension.namespace}.`;
  const id = step.id.startsWith(prefix) ? step.id : `${prefix}${step.id}`;
  const route = step.route.startsWith(`${extension.source}-${extension.namespace}-`)
    ? step.route
    : `${extension.source}-${extension.namespace}-${step.route}`;
  return { ...step, id, route };
}

/**
 * Track A can supply organization steps and Track B can supply Experience steps
 * without either track importing or replacing the onboarding implementation.
 */
export function resolveOnboardingDefinition(
  base: OnboardingDefinition = defaultOnboardingDefinition,
  extensions: OnboardingExtension[] = [],
): OnboardingDefinition {
  const extensionSteps = extensions.flatMap((extension) => extension.steps.map((step) => namespacedStep(extension, step)));
  const allSteps = [...base.steps, ...extensionSteps];
  const ids = new Set<string>();
  const routes = new Set<string>();
  for (const step of allSteps) {
    if (ids.has(step.id)) throw new Error(`Duplicate onboarding step id: ${step.id}`);
    if (routes.has(step.route)) throw new Error(`Duplicate onboarding step route: ${step.route}`);
    ids.add(step.id);
    routes.add(step.route);
  }
  return {
    ...base,
    version: extensions.length ? `${base.version}+${extensions.map((item) => `${item.source}.${item.namespace}`).join("+")}` : base.version,
    steps: allSteps,
  };
}
