import type { UserPreferences } from "../../types/models";
import { emitIdentityLifecycleSignal } from "../identity/events";
import type { CustomerProfileChanges } from "../identity/model/contracts";
import { customerProfileRepository } from "../identity/services/customerProfileRepository";
import type {
  OnboardingDefinition,
  OnboardingExtension,
  OnboardingStepDefinition,
  OnboardingValue,
} from "./model/contracts";
import { onboardingRepository } from "./services/onboardingRepository";

export type ExperienceJsonValue =
  | string
  | number
  | boolean
  | null
  | ExperienceJsonValue[]
  | { [key: string]: ExperienceJsonValue };

export type ExperienceJsonObject = { [key: string]: ExperienceJsonValue };

export interface ExperienceOnboardingRequirementLike {
  id: string;
  label: string;
  completion: string;
}

export interface ExperienceOnboardingCompletionInput {
  experienceId: string;
  moduleId: string;
  stepId: string;
  result: ExperienceJsonObject;
}

export type ExperienceOnboardingResult =
  | { status: "accepted" }
  | { status: "unavailable"; reason: string };

/** Structurally compatible with Track B's ExperienceOnboardingBridge. */
export interface ExperienceOnboardingBridge {
  completeStep(input: ExperienceOnboardingCompletionInput): Promise<ExperienceOnboardingResult>;
}

export interface ExperienceOnboardingContext {
  identityId: string;
  customerId: string;
  definition: OnboardingDefinition;
}

export type ExperienceOnboardingContextProvider = () =>
  | ExperienceOnboardingContext
  | null
  | Promise<ExperienceOnboardingContext | null>;

function routeToken(value: string) {
  const token = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return token || "step";
}

/**
 * Convert Track B manifest requirements into Track C host-owned onboarding
 * steps. The module describes the requirement; Track C owns persistence,
 * ordering, validation, resume, and completion.
 */
export function experienceRequirementsToOnboardingExtension(
  moduleId: string,
  requirements: readonly ExperienceOnboardingRequirementLike[],
): OnboardingExtension {
  return {
    source: "experience",
    namespace: moduleId,
    steps: requirements.map((requirement) => ({
      id: requirement.id,
      route: routeToken(requirement.id),
      label: requirement.label,
      description: requirement.completion,
      optional: false,
    })),
  };
}

function ownedStepId(moduleId: string, stepId: string) {
  const prefix = `experience.${moduleId}.`;
  return stepId.startsWith(prefix) ? stepId : `${prefix}${stepId}`;
}

function validatedAnswers(step: OnboardingStepDefinition, result: ExperienceJsonObject) {
  const fields = step.fields ?? [];
  const allowed = new Set(fields.map((field) => field.id));
  const unknown = Object.keys(result).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new Error(`The Experience returned undeclared onboarding result fields: ${unknown.join(", ")}.`);
  }

  const answers: Record<string, OnboardingValue> = {};
  for (const field of fields) {
    const raw = result[field.id];
    if (raw === undefined) continue;
    if (field.type === "checkbox") {
      if (typeof raw !== "boolean") throw new Error(`${field.label} must be a boolean.`);
      answers[field.id] = raw;
      continue;
    }
    if (typeof raw !== "string") throw new Error(`${field.label} must be text.`);
    answers[field.id] = raw;
  }
  return answers;
}

async function applyProfileBindings(
  identityId: string,
  step: OnboardingStepDefinition,
  answers: Record<string, OnboardingValue>,
) {
  const changes: CustomerProfileChanges = {};
  const preferences: Partial<UserPreferences> = {};

  for (const field of step.fields ?? []) {
    const value = answers[field.id];
    if (field.profileField) {
      Object.assign(changes, {
        [field.profileField]: typeof value === "string" ? value.trim() || null : null,
      });
    }
    if (field.preferenceField && value !== undefined) {
      Object.assign(preferences, { [field.preferenceField]: value });
    }
  }

  if (Object.keys(preferences).length) changes.preferences = preferences;
  if (Object.keys(changes).length) await customerProfileRepository.update(identityId, changes);
}

/**
 * Build Track B's injected onboarding bridge without importing Track B.
 * Completion is accepted only for the current declared step owned by the
 * calling module. Agreement acceptance remains host UI/human action and cannot
 * be asserted by module code.
 */
export function createExperienceOnboardingBridge(
  getContext: ExperienceOnboardingContextProvider,
): ExperienceOnboardingBridge {
  return {
    async completeStep(input) {
      try {
        const context = await getContext();
        if (!context) return { status: "unavailable", reason: "Onboarding context is not available." };

        const stepId = ownedStepId(input.moduleId, input.stepId);
        const step = context.definition.steps.find((item) => item.id === stepId);
        if (!step) {
          return { status: "unavailable", reason: "This Experience onboarding step is not declared by the host definition." };
        }
        if (step.agreement) {
          return { status: "unavailable", reason: "Agreement steps must be completed through the Nurture onboarding interface." };
        }

        const loaded = await onboardingRepository.loadOrCreate(
          context.definition,
          context.identityId,
          context.customerId,
        );
        if (loaded.created) {
          await customerProfileRepository.update(context.identityId, { onboardingStatus: "in-progress" });
          emitIdentityLifecycleSignal(
            "onboarding.started",
            { identityId: context.identityId, customerId: context.customerId },
            { definitionId: context.definition.id, definitionVersion: context.definition.version },
          );
        }

        if (loaded.state.currentStepId !== step.id) {
          return { status: "unavailable", reason: "Complete the current onboarding step before this Experience step." };
        }

        const answers = validatedAnswers(step, input.result);
        const next = await onboardingRepository.completeStep(
          context.definition,
          loaded.state,
          step.id,
          answers,
          false,
        );
        await applyProfileBindings(context.identityId, step, answers);

        emitIdentityLifecycleSignal(
          "onboarding.step_completed",
          { identityId: context.identityId, customerId: context.customerId },
          {
            stepId: step.id,
            definitionVersion: context.definition.version,
            experienceId: input.experienceId,
            moduleId: input.moduleId,
          },
        );

        if (next.status === "complete") {
          await customerProfileRepository.update(context.identityId, { onboardingStatus: "complete" });
          emitIdentityLifecycleSignal(
            "onboarding.completed",
            { identityId: context.identityId, customerId: context.customerId },
            { definitionId: context.definition.id, definitionVersion: context.definition.version },
          );
        }

        return { status: "accepted" };
      } catch (error) {
        return {
          status: "unavailable",
          reason: error instanceof Error ? error.message : "Unable to complete the Experience onboarding step.",
        };
      }
    },
  };
}
