import type { Experience, ExperienceModuleRegistration, ExperienceSlot } from "./contracts";

const registrations = new Map<ExperienceSlot, ExperienceModuleRegistration>();

function validateRegistration(registration: ExperienceModuleRegistration) {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9-]+)+$/.test(registration.id)) {
    throw new Error(`Experience module id "${registration.id}" must be a stable namespaced identifier.`);
  }
  if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(registration.moduleVersion)) {
    throw new Error(`Experience module "${registration.id}" must declare a semantic version.`);
  }
}

/**
 * Registers trusted, developer-supplied modules. This is deliberately not a
 * remote-script or arbitrary-manifest loader. Runtime installation/review is a
 * later product concern with a separate trust policy.
 */
export function registerExperienceModule(registration: ExperienceModuleRegistration) {
  validateRegistration(registration);
  const existing = registrations.get(registration.slot);
  if (existing && existing.id !== registration.id) {
    throw new Error(`Experience slot "${registration.slot}" is already registered to "${existing.id}".`);
  }
  registrations.set(registration.slot, registration);
}

export function getExperienceRegistration(slot: ExperienceSlot) {
  return registrations.get(slot) ?? null;
}

export function listExperienceRegistrations() {
  return Array.from(registrations.values());
}

export function createRegisteredExperience(
  registration: ExperienceModuleRegistration,
  organizationId: string | null,
): Experience {
  return {
    id: `${organizationId ?? "public"}:${registration.slot}:${registration.id}`,
    organizationId,
    moduleId: registration.id,
    moduleVersion: registration.moduleVersion,
    slot: registration.slot,
    status: "published",
    configurationVersion: "reference-defaults-v1",
    configuration: registration.defaultConfiguration,
  };
}

registerExperienceModule({
  id: "nurture.reference-assessment",
  moduleVersion: "1.0.0",
  slot: "primary",
  defaultConfiguration: {
    title: "Momentum Check",
    completionMessage: "You have a clearer signal for what to do next.",
  },
  loader: async () => (await import("./modules/referenceAssessment")).referenceAssessmentModule,
});

registerExperienceModule({
  id: "nurture.reference-checklist",
  moduleVersion: "1.0.0",
  slot: "secondary",
  defaultConfiguration: {
    title: "Next-Step Checklist",
  },
  loader: async () => (await import("./modules/referenceChecklist")).referenceChecklistModule,
});
