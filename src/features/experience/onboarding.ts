import type {
  ExperienceModuleManifest,
  ExperienceOnboardingFieldDefinition,
  ExperienceOnboardingStepDefinition,
} from "./contracts";

type TrackCPreferenceField = "theme" | "emailNotifications" | "smsNotifications" | "pushNotifications";

type TrackCOnboardingFieldDefinition = Omit<ExperienceOnboardingFieldDefinition, "preferenceField"> & {
  preferenceField?: TrackCPreferenceField;
};

type TrackCOnboardingStepDefinition = Omit<ExperienceOnboardingStepDefinition, "fields"> & {
  fields?: TrackCOnboardingFieldDefinition[];
};

export interface TrackCExperienceOnboardingExtension {
  source: "experience";
  namespace: string;
  steps: TrackCOnboardingStepDefinition[];
}

const TRACK_C_PREFERENCE_FIELDS = new Set<TrackCPreferenceField>([
  "theme",
  "emailNotifications",
  "smsNotifications",
  "pushNotifications",
]);

function toTrackCPreferenceField(value: string | undefined): TrackCPreferenceField | undefined {
  if (!value) return undefined;
  if (!TRACK_C_PREFERENCE_FIELDS.has(value as TrackCPreferenceField)) {
    throw new Error(`Experience onboarding preference field "${value}" is not supported by the Track C account contract.`);
  }
  return value as TrackCPreferenceField;
}

function projectField(field: ExperienceOnboardingFieldDefinition): TrackCOnboardingFieldDefinition {
  return {
    id: field.id,
    label: field.label,
    type: field.type,
    required: field.required,
    purpose: field.purpose,
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    ...(field.profileField ? { profileField: field.profileField } : {}),
    ...(field.preferenceField ? { preferenceField: toTrackCPreferenceField(field.preferenceField) } : {}),
    ...(field.options ? { options: field.options } : {}),
  };
}

/**
 * Produces the exact public shape consumed by Track C's `OnboardingExtension`.
 * Track C remains authoritative for definition reconciliation, persistence,
 * completion, verification policy, and route gating.
 */
export function createExperienceOnboardingExtension(
  manifest: ExperienceModuleManifest,
): TrackCExperienceOnboardingExtension | null {
  if (manifest.onboardingRequirements.length === 0) return null;

  const steps: TrackCOnboardingStepDefinition[] = manifest.onboardingRequirements.map((requirement) => ({
    id: requirement.id,
    route: requirement.route,
    label: requirement.label,
    description: requirement.description,
    optional: requirement.optional,
    ...(requirement.fields ? { fields: requirement.fields.map(projectField) } : {}),
    ...(requirement.agreement ? { agreement: requirement.agreement } : {}),
  }));

  return {
    source: "experience",
    namespace: manifest.id,
    steps,
  };
}
