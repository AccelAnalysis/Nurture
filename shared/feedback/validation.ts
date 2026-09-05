import { FeedbackError, type SurveyDraft, type SurveyQuestion, type SurveyAnswers, type ReferralProgramDraft } from "./contracts.js";

export function invariant(value: unknown, code: ConstructorParameters<typeof FeedbackError>[0], message?: string): asserts value {
  if (!value) throw new FeedbackError(code, message);
}
export function record(value: unknown): Record<string, unknown> {
  invariant(value !== null && typeof value === "object" && !Array.isArray(value), "invalid-input");
  const prototype = Object.getPrototypeOf(value);
  invariant(prototype === Object.prototype || prototype === null, "invalid-input");
  return value as Record<string, unknown>;
}
export function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  invariant(Object.keys(value).every(key => keys.includes(key)), "invalid-input", "Unknown field.");
}
export function text(value: unknown, max: number, min = 1): string {
  invariant(typeof value === "string" && value.trim().length >= min && value.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), "invalid-input");
  return value.trim();
}
export function id(value: unknown): string {
  const result = text(value, 128); invariant(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(result), "invalid-input"); return result;
}
export function integer(value: unknown, min: number, max: number): number {
  invariant(Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max, "invalid-input"); return value as number;
}
function boolean(value: unknown): boolean { invariant(typeof value === "boolean", "invalid-input"); return value; }
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  invariant(typeof value === "string" && allowed.includes(value as T), "invalid-input"); return value as T;
}
export function validateSurvey(value: unknown): SurveyDraft {
  const input = record(value);
  onlyKeys(input, ["title", "kind", "privacy", "requireSignIn", "audience", "questions", "expiryHours", "cooldownHours"]);
  invariant(Array.isArray(input.questions) && input.questions.length > 0 && input.questions.length <= 20, "invalid-input");
  const questions: SurveyQuestion[] = input.questions.map(raw => {
    const q = record(raw); const base = { id: id(q.id), label: text(q.label, 500), required: boolean(q.required) };
    switch (q.type) {
      case "nps": onlyKeys(q, ["id", "label", "required", "type"]); return { ...base, type: "nps" };
      case "rating": {
        onlyKeys(q, ["id", "label", "required", "type", "min", "max"]);
        const min = integer(q.min, 0, 9); const max = integer(q.max, min + 1, 10);
        return { ...base, type: "rating", min, max };
      }
      case "choice": {
        onlyKeys(q, ["id", "label", "required", "type", "options"]);
        invariant(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 12, "invalid-input");
        const options = q.options.map(item => text(item, 120));
        invariant(new Set(options).size === options.length, "invalid-input"); return { ...base, type: "choice", options };
      }
      case "text": onlyKeys(q, ["id", "label", "required", "type", "maxLength"]); return { ...base, type: "text", maxLength: integer(q.maxLength, 1, 2000) };
      default: throw new FeedbackError("invalid-input", "Unsupported question type.");
    }
  });
  invariant(new Set(questions.map(q => q.id)).size === questions.length, "invalid-input", "Question identifiers must be unique.");
  const kind = oneOf(input.kind, ["satisfaction", "nps", "data-gathering", "research", "onboarding-feedback", "cancellation-feedback"]);
  const nps = questions.filter(q => q.type === "nps");
  invariant(kind === "nps" ? nps.length === 1 && nps[0].required : nps.length === 0, "invalid-input", "Only an NPS survey may contain one required NPS question.");
  const privacy = oneOf(input.privacy, ["identified", "anonymous"]);
  const requireSignIn = boolean(input.requireSignIn);
  invariant(!(privacy === "anonymous" && requireSignIn), "invalid-input", "Anonymous surveys cannot require account sign-in.");
  return { title: text(input.title, 160), kind, privacy, requireSignIn,
    audience: oneOf(input.audience, ["all-eligible", "configured-segment"]), questions,
    expiryHours: integer(input.expiryHours, 1, 24 * 90), cooldownHours: integer(input.cooldownHours, 1, 24 * 365) };
}
export function validateAnswers(survey: SurveyDraft, raw: unknown): SurveyAnswers {
  const input = record(raw); onlyKeys(input, survey.questions.map(q => q.id));
  const result: SurveyAnswers = Object.create(null) as SurveyAnswers;
  for (const q of survey.questions) {
    const answer = Object.hasOwn(input, q.id) ? input[q.id] : undefined;
    if (answer === undefined || answer === "") { invariant(!q.required, "invalid-input", `Answer required: ${q.id}`); continue; }
    if (q.type === "nps") result[q.id] = integer(answer, 0, 10);
    else if (q.type === "rating") result[q.id] = integer(answer, q.min, q.max);
    else if (q.type === "choice") result[q.id] = oneOf(answer, q.options);
    else result[q.id] = text(answer, q.maxLength);
  }
  return result;
}
export function validateProgram(raw: unknown): ReferralProgramDraft {
  const input = record(raw);
  onlyKeys(input, ["title", "terms", "active", "attribution", "windowDays", "cooldownHours", "invitationExpiryHours", "qualification", "qualificationHoldHours", "maxQualifiedPerReferrer", "benefits"]);
  invariant(Array.isArray(input.benefits) && input.benefits.length <= 2, "invalid-input");
  const benefits = input.benefits.map(rawBenefit => {
    const b = record(rawBenefit); onlyKeys(b, ["beneficiary", "kind", "units"]);
    return { beneficiary: oneOf(b.beneficiary, ["referrer", "referred"]), kind: oneOf(b.kind, ["test-credit"]), units: integer(b.units, 1, 10000) };
  });
  invariant(new Set(benefits.map(b => b.beneficiary)).size === benefits.length, "invalid-input");
  return { title: text(input.title, 160), terms: text(input.terms, 4000), active: boolean(input.active),
    attribution: oneOf(input.attribution, ["first-touch", "last-touch"]), windowDays: integer(input.windowDays, 1, 365),
    cooldownHours: integer(input.cooldownHours, 1, 8760), invitationExpiryHours: integer(input.invitationExpiryHours, 1, 2160), qualification: oneOf(input.qualification, ["paid-subscription"]),
    qualificationHoldHours: integer(input.qualificationHoldHours, 0, 2160), maxQualifiedPerReferrer: integer(input.maxQualifiedPerReferrer, 1, 10000), benefits };
}
export function classifyFeedback(survey: SurveyDraft, answers: SurveyAnswers): "positive" | "negative" | "neutral" {
  if (survey.kind === "nps") {
    const q = survey.questions.find(item => item.type === "nps")!; const score = answers[q.id];
    return typeof score !== "number" ? "neutral" : score >= 9 ? "positive" : score <= 6 ? "negative" : "neutral";
  }
  // Research/data gathering/cancellation are not silently converted to satisfaction scores.
  if (survey.kind !== "satisfaction" && survey.kind !== "onboarding-feedback") return "neutral";
  const q = survey.questions.find(item => item.type === "rating");
  if (!q || q.type !== "rating" || typeof answers[q.id] !== "number") return "neutral";
  const relative = ((answers[q.id] as number) - q.min) / (q.max - q.min);
  return relative >= 0.75 ? "positive" : relative <= 0.25 ? "negative" : "neutral";
}
