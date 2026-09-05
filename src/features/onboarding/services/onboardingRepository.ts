import { identityCollections, identityDocumentStore } from "../../identity/services/identityDocumentStore";
import type {
  AgreementAcceptance,
  OnboardingDefinition,
  OnboardingState,
  OnboardingStepDefinition,
  OnboardingValue,
} from "../model/contracts";

function firstIncompleteStep(definition: OnboardingDefinition, state: OnboardingState) {
  return definition.steps.find((step) => state.steps[step.id] !== "complete" && state.steps[step.id] !== "skipped");
}

function allRequiredComplete(definition: OnboardingDefinition, state: OnboardingState) {
  return definition.steps
    .filter((step) => !step.optional)
    .every((step) => state.steps[step.id] === "complete");
}

function agreementCurrent(step: OnboardingStepDefinition, state: OnboardingState) {
  if (!step.agreement?.required) return true;
  return state.acceptedAgreements[step.agreement.id]?.version === step.agreement.version;
}

function createState(definition: OnboardingDefinition, identityId: string, customerId: string): OnboardingState {
  const now = new Date().toISOString();
  const steps = Object.fromEntries(
    definition.steps.map((step, index) => [step.id, index === 0 ? "current" : "not-started"]),
  ) as OnboardingState["steps"];
  return {
    identityId,
    customerId,
    definitionId: definition.id,
    definitionVersion: definition.version,
    status: "in-progress",
    currentStepId: definition.steps[0]?.id,
    steps,
    answers: {},
    acceptedAgreements: {},
    startedAt: now,
    lastActivityAt: now,
  };
}

function reconcile(definition: OnboardingDefinition, current: OnboardingState): OnboardingState {
  const steps = Object.fromEntries(definition.steps.map((step) => {
    const previous = current.steps[step.id] ?? "not-started";
    const status = previous === "complete" && !agreementCurrent(step, current) ? "not-started" : previous;
    return [step.id, status === "current" ? "not-started" : status];
  })) as OnboardingState["steps"];
  const candidate: OnboardingState = {
    ...current,
    definitionId: definition.id,
    definitionVersion: definition.version,
    steps,
    lastActivityAt: new Date().toISOString(),
  };
  const next = firstIncompleteStep(definition, candidate);
  if (next) {
    candidate.steps[next.id] = "current";
    candidate.currentStepId = next.id;
    if (candidate.status === "complete" || candidate.status === "abandoned") candidate.status = "in-progress";
    delete candidate.completedAt;
    delete candidate.abandonedAt;
  } else {
    candidate.currentStepId = undefined;
    candidate.status = "complete";
    candidate.completedAt = current.completedAt ?? new Date().toISOString();
  }
  return candidate;
}

function isEmptyRequired(value: OnboardingValue | undefined) {
  if (value === undefined) return true;
  if (typeof value === "boolean") return !value;
  if (typeof value === "string") return value.trim().length === 0;
  return value.length === 0;
}

function validateStep(step: OnboardingStepDefinition, answers: Record<string, OnboardingValue>, agreementAccepted: boolean) {
  for (const field of step.fields ?? []) {
    if (field.required && isEmptyRequired(answers[field.id])) {
      throw new Error(`${field.label} is required.`);
    }
  }
  if (step.agreement?.required && !agreementAccepted) {
    throw new Error(`${step.agreement.label} must be accepted to continue.`);
  }
}

export const onboardingRepository = {
  get(identityId: string) {
    return identityDocumentStore.read<OnboardingState>(identityCollections.onboarding, identityId);
  },

  async loadOrCreate(definition: OnboardingDefinition, identityId: string, customerId: string) {
    const existing = await this.get(identityId);
    if (!existing) {
      const state = createState(definition, identityId, customerId);
      await identityDocumentStore.write(identityCollections.onboarding, identityId, state, false);
      return { state, created: true };
    }
    if (existing.customerId !== customerId) throw new Error("Onboarding customer identity mismatch.");
    const state = reconcile(definition, existing);
    const changed = state.definitionId !== existing.definitionId
      || state.definitionVersion !== existing.definitionVersion
      || state.currentStepId !== existing.currentStepId
      || state.status !== existing.status
      || JSON.stringify(state.steps) !== JSON.stringify(existing.steps);
    if (changed) await identityDocumentStore.write(identityCollections.onboarding, identityId, state, false);
    return { state, created: false };
  },

  async completeStep(
    definition: OnboardingDefinition,
    current: OnboardingState,
    stepId: string,
    answers: Record<string, OnboardingValue>,
    agreementAccepted = false,
  ): Promise<OnboardingState> {
    const step = definition.steps.find((item) => item.id === stepId);
    if (!step) throw new Error("This onboarding step is not part of the current definition.");
    if (current.currentStepId !== stepId) throw new Error("Complete the current onboarding step before continuing.");
    validateStep(step, answers, agreementAccepted);

    const now = new Date().toISOString();
    const acceptedAgreements = { ...current.acceptedAgreements };
    if (step.agreement && agreementAccepted) {
      const acceptance: AgreementAcceptance = {
        agreementId: step.agreement.id,
        version: step.agreement.version,
        acceptedAt: now,
      };
      acceptedAgreements[step.agreement.id] = acceptance;
    }

    const next: OnboardingState = {
      ...current,
      status: "in-progress",
      steps: { ...current.steps, [stepId]: "complete" },
      answers: { ...current.answers, ...answers },
      acceptedAgreements,
      lastActivityAt: now,
    };
    const nextStep = firstIncompleteStep(definition, next);
    if (nextStep) {
      next.steps[nextStep.id] = "current";
      next.currentStepId = nextStep.id;
    } else if (allRequiredComplete(definition, next)) {
      next.status = "complete";
      next.currentStepId = undefined;
      next.completedAt = now;
    }
    await identityDocumentStore.write(identityCollections.onboarding, current.identityId, next, false);
    return next;
  },

  async skipCurrentStep(definition: OnboardingDefinition, current: OnboardingState): Promise<OnboardingState> {
    const step = definition.steps.find((item) => item.id === current.currentStepId);
    if (!step?.optional) throw new Error("The current onboarding step is required.");
    const now = new Date().toISOString();
    const next: OnboardingState = {
      ...current,
      steps: { ...current.steps, [step.id]: "skipped" },
      lastActivityAt: now,
    };
    const nextStep = firstIncompleteStep(definition, next);
    if (nextStep) {
      next.steps[nextStep.id] = "current";
      next.currentStepId = nextStep.id;
    } else if (allRequiredComplete(definition, next)) {
      next.status = "complete";
      next.currentStepId = undefined;
      next.completedAt = now;
    }
    await identityDocumentStore.write(identityCollections.onboarding, current.identityId, next, false);
    return next;
  },

  async markAbandoned(current: OnboardingState): Promise<OnboardingState> {
    if (current.status === "complete") return current;
    const now = new Date().toISOString();
    const next = { ...current, status: "abandoned" as const, abandonedAt: now, lastActivityAt: now };
    await identityDocumentStore.write(identityCollections.onboarding, current.identityId, next, false);
    return next;
  },
};
