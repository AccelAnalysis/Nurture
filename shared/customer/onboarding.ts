import type {
  LegacyIdentityOnboardingState,
  OnboardingAnswer,
  OnboardingFlowDefinitionV2,
  OnboardingProgressScope,
  OnboardingProgressV2,
  OnboardingStepDefinitionV2,
  OnboardingStepMutationResult,
  OnboardingStepProgressStatus,
} from "./contracts";

function safePart(value: string) {
  return encodeURIComponent(value.trim());
}

export function onboardingProgressId(scope: OnboardingProgressScope): string {
  return [scope.organizationId, scope.dataMode, scope.customerId, scope.experienceId ?? "default", scope.flowId]
    .map(safePart)
    .join("~");
}

function requiredAnswerMissing(value: OnboardingAnswer | undefined): boolean {
  if (value === undefined) return true;
  if (typeof value === "boolean") return value === false;
  if (typeof value === "string") return value.trim().length === 0;
  return value.length === 0;
}

export function validateOnboardingFlowDefinition(definition: OnboardingFlowDefinitionV2): OnboardingFlowDefinitionV2 {
  if (definition.schemaVersion !== 2) throw new Error("Unsupported onboarding schema version.");
  if (!definition.id.trim() || !definition.version.trim()) throw new Error("Onboarding flow ID and version are required.");
  if (!definition.steps.length || definition.steps.length > 50) throw new Error("Onboarding must contain between 1 and 50 steps.");

  const ids = new Set<string>();
  const routes = new Set<string>();
  for (const step of definition.steps) {
    if (!step.id.trim() || !step.route.trim()) throw new Error("Every onboarding step needs an ID and route.");
    if (ids.has(step.id)) throw new Error(`Duplicate onboarding step ID: ${step.id}`);
    if (routes.has(step.route)) throw new Error(`Duplicate onboarding step route: ${step.route}`);
    ids.add(step.id);
    routes.add(step.route);

    if (step.questions.length > 25) throw new Error(`Onboarding step ${step.id} has too many questions.`);
    const questionIds = new Set<string>();
    for (const question of step.questions) {
      if (questionIds.has(question.id)) throw new Error(`Duplicate onboarding question ID: ${question.id}`);
      questionIds.add(question.id);
      if (question.type === "select" && !question.options?.length) throw new Error(`${question.label} needs at least one option.`);
    }
  }
  return definition;
}

function firstIncompleteStep(definition: OnboardingFlowDefinitionV2, progress: OnboardingProgressV2) {
  return definition.steps.find((step) => progress.steps[step.id] !== "complete" && progress.steps[step.id] !== "skipped");
}

function allRequiredComplete(definition: OnboardingFlowDefinitionV2, progress: OnboardingProgressV2) {
  return definition.steps.filter((step) => step.required).every((step) => progress.steps[step.id] === "complete");
}

function setStepStatus(
  steps: Record<string, OnboardingStepProgressStatus>,
  stepId: string,
  status: OnboardingStepProgressStatus,
): Record<string, OnboardingStepProgressStatus> {
  const next: Record<string, OnboardingStepProgressStatus> = { ...steps };
  next[stepId] = status;
  return next;
}

function withoutAbandonment(progress: OnboardingProgressV2): OnboardingProgressV2 {
  const { abandonedAt: _abandonedAt, ...rest } = progress;
  return rest;
}

function asCompleted(progress: OnboardingProgressV2, completedAt: string): OnboardingProgressV2 {
  const { currentStepId: _currentStepId, ...rest } = progress;
  return { ...rest, status: "complete", completedAt };
}

export function createOnboardingProgress(
  scope: OnboardingProgressScope,
  definition: OnboardingFlowDefinitionV2,
  now: string,
): OnboardingProgressV2 {
  validateOnboardingFlowDefinition(definition);
  if (scope.flowId !== definition.id) throw new Error("Onboarding scope and flow definition do not match.");

  const steps: Record<string, OnboardingStepProgressStatus> = {};
  definition.steps.forEach((step, index) => {
    steps[step.id] = index === 0 ? "current" : "not-started";
  });
  const first = definition.steps[0];

  return {
    schemaVersion: 2,
    progressId: onboardingProgressId(scope),
    scope: { ...scope },
    flowVersion: definition.version,
    status: "in-progress",
    ...(first ? { currentStepId: first.id } : {}),
    steps,
    answers: {},
    acceptedAgreementVersions: {},
    experienceEvidence: {},
    startedAt: now,
    lastActivityAt: now,
  };
}

function validateStepAnswers(step: OnboardingStepDefinitionV2, answers: Record<string, OnboardingAnswer>) {
  const permitted = new Set(step.questions.map((question) => question.id));
  for (const key of Object.keys(answers)) {
    if (!permitted.has(key)) throw new Error(`Unexpected onboarding answer: ${key}`);
  }
  for (const question of step.questions) {
    if (question.required && requiredAnswerMissing(answers[question.id])) throw new Error(`${question.label} is required.`);
  }
}

export function completeOnboardingStep(
  definition: OnboardingFlowDefinitionV2,
  current: OnboardingProgressV2,
  input: { stepId: string; answers: Record<string, OnboardingAnswer>; agreementAccepted?: boolean; experienceEvidenceId?: string },
  now: string,
): OnboardingStepMutationResult {
  validateOnboardingFlowDefinition(definition);
  if (definition.id !== current.scope.flowId || definition.version !== current.flowVersion) {
    throw new Error("Onboarding progress must use its pinned flow version.");
  }

  const step = definition.steps.find((candidate) => candidate.id === input.stepId);
  if (!step) throw new Error("This onboarding step is not part of the pinned flow.");
  if (current.steps[step.id] === "complete") return { progress: current, stepCompletedNow: false, onboardingCompletedNow: false };
  if (current.status === "complete") return { progress: current, stepCompletedNow: false, onboardingCompletedNow: false };
  if (current.currentStepId !== step.id) throw new Error("Complete the current onboarding step before continuing.");
  validateStepAnswers(step, input.answers);

  const acceptedAgreementVersions = { ...current.acceptedAgreementVersions };
  if (step.agreement) {
    const alreadyAccepted = acceptedAgreementVersions[step.agreement.id] === step.agreement.version;
    if (step.agreement.required && !alreadyAccepted && input.agreementAccepted !== true) {
      throw new Error(`${step.agreement.label} must be accepted to continue.`);
    }
    if (input.agreementAccepted === true) acceptedAgreementVersions[step.agreement.id] = step.agreement.version;
  }

  const experienceEvidence = { ...current.experienceEvidence };
  if (step.experienceRequirement?.required) {
    const evidenceId = input.experienceEvidenceId?.trim();
    if (!evidenceId) throw new Error(`${step.experienceRequirement.label} must be completed before continuing.`);
    experienceEvidence[step.experienceRequirement.requirementId] = evidenceId;
  } else if (step.experienceRequirement && input.experienceEvidenceId?.trim()) {
    experienceEvidence[step.experienceRequirement.requirementId] = input.experienceEvidenceId.trim();
  }

  const advanced: OnboardingProgressV2 = {
    ...current,
    status: "in-progress",
    steps: setStepStatus(current.steps, step.id, "complete"),
    answers: { ...current.answers, ...input.answers },
    acceptedAgreementVersions,
    experienceEvidence,
    lastActivityAt: now,
  };
  let progress: OnboardingProgressV2 = withoutAbandonment(advanced);

  const next = firstIncompleteStep(definition, progress);
  if (next) {
    progress = {
      ...progress,
      steps: setStepStatus(progress.steps, next.id, "current"),
      currentStepId: next.id,
    };
  } else if (allRequiredComplete(definition, progress)) {
    progress = asCompleted(progress, current.completedAt ?? now);
  }

  return {
    progress,
    stepCompletedNow: true,
    onboardingCompletedNow: progress.status === "complete",
  };
}

export function resumeOnboardingProgress(current: OnboardingProgressV2, now: string): OnboardingProgressV2 {
  if (current.status !== "abandoned") return current;
  const resumed: OnboardingProgressV2 = { ...current, status: "in-progress", lastActivityAt: now };
  return withoutAbandonment(resumed);
}

export function inferOnboardingAbandonment(current: OnboardingProgressV2, now: string, inactivityMs: number): OnboardingProgressV2 {
  if (current.status === "complete" || current.status === "abandoned") return current;
  if (!Number.isFinite(inactivityMs) || inactivityMs <= 0) throw new Error("A positive onboarding inactivity interval is required.");

  const last = Date.parse(current.lastActivityAt);
  const currentTime = Date.parse(now);
  if (!Number.isFinite(last) || !Number.isFinite(currentTime) || currentTime - last < inactivityMs) return current;
  return { ...current, status: "abandoned", abandonedAt: now, lastActivityAt: now };
}

/** Non-destructive R1 migration into one explicitly selected tenant scope. */
export function migrateLegacyIdentityOnboarding(
  legacy: LegacyIdentityOnboardingState,
  scope: OnboardingProgressScope,
  definition: OnboardingFlowDefinitionV2,
  now: string,
): OnboardingProgressV2 {
  let progress: OnboardingProgressV2 = createOnboardingProgress(scope, definition, legacy.startedAt ?? now);
  progress = {
    ...progress,
    answers: { ...legacy.answers },
    lastActivityAt: legacy.lastActivityAt || now,
    migration: {
      source: "identityOnboarding",
      sourceIdentityId: legacy.identityId,
      sourceDefinitionId: legacy.definitionId,
      sourceDefinitionVersion: legacy.definitionVersion,
      migratedAt: now,
    },
  };

  let steps: Record<string, OnboardingStepProgressStatus> = { ...progress.steps };
  const acceptedAgreementVersions = { ...progress.acceptedAgreementVersions };
  for (const step of definition.steps) {
    if (legacy.steps[step.id] !== "complete") continue;
    if (step.agreement) {
      const evidence = legacy.acceptedAgreements[step.agreement.id];
      if (!evidence || evidence.version !== step.agreement.version) continue;
      acceptedAgreementVersions[step.agreement.id] = evidence.version;
    }
    steps = setStepStatus(steps, step.id, "complete");
  }
  for (const step of definition.steps) {
    if (steps[step.id] === "current") steps = setStepStatus(steps, step.id, "not-started");
  }
  progress = { ...progress, steps, acceptedAgreementVersions };

  const next = firstIncompleteStep(definition, progress);
  if (next) {
    progress = {
      ...progress,
      status: "in-progress",
      steps: setStepStatus(progress.steps, next.id, "current"),
      currentStepId: next.id,
    };
  } else if (allRequiredComplete(definition, progress)) {
    progress = asCompleted(progress, legacy.completedAt ?? now);
  }
  return progress;
}
