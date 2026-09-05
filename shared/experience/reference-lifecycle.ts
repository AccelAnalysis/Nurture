import type { EventPayload, JsonValue } from "../analytics/contracts.js";
import type {
  ExperienceMilestoneDefinition,
  ExperienceMilestoneEvidenceValidator,
} from "./lifecycle.js";

export const REFERENCE_ASSESSMENT_MODULE_ID = "nurture.reference-assessment";
export const REFERENCE_ASSESSMENT_MODULE_VERSION = "1.0.0";
export const REFERENCE_ASSESSMENT_MILESTONE_KEY = "reference-assessment.completed";
export const REFERENCE_ASSESSMENT_VALIDATOR_ID = "reference-assessment-completion-v1";

export const REFERENCE_ASSESSMENT_QUESTIONS = [
  {
    id: "clarity",
    prompt: "How clear does your next step feel right now?",
    options: [
      { id: "very-clear", label: "Very clear" },
      { id: "mostly-clear", label: "Mostly clear" },
      { id: "still-forming", label: "Still forming" },
    ],
  },
  {
    id: "momentum",
    prompt: "How much momentum do you feel toward that next step?",
    options: [
      { id: "strong", label: "Strong momentum" },
      { id: "some", label: "Some momentum" },
      { id: "reset", label: "I need a reset" },
    ],
  },
  {
    id: "support",
    prompt: "Which kind of support would be most useful next?",
    options: [
      { id: "prompt", label: "A focused prompt" },
      { id: "example", label: "A practical example" },
      { id: "reflect", label: "Time to reflect" },
    ],
  },
] as const;

export const REFERENCE_CHECKLIST_MODULE_ID = "nurture.reference-checklist";
export const REFERENCE_CHECKLIST_MODULE_VERSION = "1.0.0";
export const REFERENCE_CHECKLIST_MILESTONE_KEY = "reference-checklist.completed";
export const REFERENCE_CHECKLIST_VALIDATOR_ID = "reference-checklist-completion-v1";

export const REFERENCE_CHECKLIST_ITEMS = [
  { id: "choose-action", label: "Choose the next action" },
  { id: "focused-time", label: "Set aside focused time" },
  { id: "mark-complete", label: "Return and mark it complete" },
] as const;

export const REFERENCE_EXPERIENCE_MILESTONE_DEFINITIONS: readonly ExperienceMilestoneDefinition[] = [
  {
    moduleId: REFERENCE_ASSESSMENT_MODULE_ID,
    moduleVersion: REFERENCE_ASSESSMENT_MODULE_VERSION,
    milestoneKey: REFERENCE_ASSESSMENT_MILESTONE_KEY,
    description: "All Momentum Check questions were accepted by the owning domain validator.",
    activation: true,
    evidenceValidatorId: REFERENCE_ASSESSMENT_VALIDATOR_ID,
    evidenceVersion: 1,
  },
  {
    moduleId: REFERENCE_CHECKLIST_MODULE_ID,
    moduleVersion: REFERENCE_CHECKLIST_MODULE_VERSION,
    milestoneKey: REFERENCE_CHECKLIST_MILESTONE_KEY,
    description: "All Next-Step Checklist items were accepted by the owning domain validator.",
    activation: true,
    evidenceValidatorId: REFERENCE_CHECKLIST_VALIDATOR_ID,
    evidenceVersion: 1,
  },
];

function objectValue(value: JsonValue | undefined): Record<string, JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : null;
}

function stringValue(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const assessmentValidator: ExperienceMilestoneEvidenceValidator = {
  validate({ command }) {
    const evidence = command.evidence;
    const answers = evidence.answers;
    if (!Array.isArray(answers) || answers.length !== REFERENCE_ASSESSMENT_QUESTIONS.length) {
      return { ok: false, reason: "A complete set of reference assessment answers is required." };
    }

    const submitted = new Map<string, string>();
    for (const rawAnswer of answers) {
      const answer = objectValue(rawAnswer);
      if (!answer) return { ok: false, reason: "Each assessment answer must be a structured value." };
      const questionId = stringValue(answer.questionId);
      const optionId = stringValue(answer.optionId);
      if (!questionId || !optionId || submitted.has(questionId)) {
        return { ok: false, reason: "Assessment evidence contains a missing or duplicate question." };
      }
      submitted.set(questionId, optionId);
    }

    for (const question of REFERENCE_ASSESSMENT_QUESTIONS) {
      const selected = submitted.get(question.id);
      if (!selected || !question.options.some((option) => option.id === selected)) {
        return { ok: false, reason: `Assessment evidence is invalid for question ${question.id}.` };
      }
    }

    return {
      ok: true,
      safePayload: {
        completedQuestions: REFERENCE_ASSESSMENT_QUESTIONS.length,
      },
    };
  },
};

const checklistValidator: ExperienceMilestoneEvidenceValidator = {
  validate({ command }) {
    const completed = command.evidence.completedItemIds;
    if (!Array.isArray(completed)) {
      return { ok: false, reason: "A complete checklist item set is required." };
    }
    const ids = new Set(completed.filter((value): value is string => typeof value === "string"));
    if (ids.size !== REFERENCE_CHECKLIST_ITEMS.length) {
      return { ok: false, reason: "The checklist evidence is incomplete." };
    }
    for (const item of REFERENCE_CHECKLIST_ITEMS) {
      if (!ids.has(item.id)) return { ok: false, reason: `Checklist evidence is missing ${item.id}.` };
    }
    return {
      ok: true,
      safePayload: {
        completedItems: REFERENCE_CHECKLIST_ITEMS.length,
      },
    };
  },
};

export const REFERENCE_EXPERIENCE_EVIDENCE_VALIDATORS: Readonly<Record<string, ExperienceMilestoneEvidenceValidator>> = {
  [REFERENCE_ASSESSMENT_VALIDATOR_ID]: assessmentValidator,
  [REFERENCE_CHECKLIST_VALIDATOR_ID]: checklistValidator,
};

export function referenceAssessmentEvidence(
  answers: Readonly<Record<string, string>>,
): EventPayload {
  return {
    answers: REFERENCE_ASSESSMENT_QUESTIONS.map((question) => ({
      questionId: question.id,
      optionId: answers[question.id] ?? "",
    })),
  };
}
