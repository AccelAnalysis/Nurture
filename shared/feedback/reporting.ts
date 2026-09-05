import { FeedbackError, type SurveyResponse, type SurveyDraft, type NpsReport } from "./contracts.js";
import { invariant, validateAnswers } from "./validation.js";
/** Pure, projection-only reporting. Calling this cannot enqueue invitations or rewards. */
export function reportNps(survey: SurveyDraft, versionId: string, responses: readonly SurveyResponse[], fromDay: string, toDay: string, anonymousMinimum = 5): NpsReport {
  invariant(survey.kind === "nps" && /^\d{4}-\d{2}-\d{2}$/.test(fromDay) && /^\d{4}-\d{2}-\d{2}$/.test(toDay) && fromDay <= toDay, "invalid-input");
  invariant(Number.isSafeInteger(anonymousMinimum) && anonymousMinimum >= 5, "invalid-input");
  for (const day of [fromDay, toDay]) {
    const date = new Date(`${day}T00:00:00Z`);
    invariant(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day, "invalid-input");
  }
  if (survey.privacy === "anonymous") {
    const monthEnd = new Date(Date.UTC(Number(fromDay.slice(0, 4)), Number(fromDay.slice(5, 7)), 0)).toISOString().slice(0, 10);
    invariant(fromDay.endsWith("-01") && toDay === monthEnd, "invalid-input", "Anonymous reporting uses fixed calendar months.");
  }
  const question = survey.questions.find(q => q.type === "nps")!;
  const seen = new Set<string>(); let promoters = 0; let passives = 0; let detractors = 0; let invalidResponses = 0;
  for (const response of responses) {
    if (response.versionId !== versionId || response.privacy !== survey.privacy || response.receivedDay < fromDay || response.receivedDay > toDay || seen.has(response.id)) continue;
    seen.add(response.id);
    let answers;
    try { answers = validateAnswers(survey, response.answers); }
    catch (error) { if (!(error instanceof FeedbackError)) throw error; invalidResponses++; continue; }
    const score = answers[question.id] as number;
    if (score >= 9) promoters++; else if (score >= 7) passives++; else detractors++;
  }
  const count = promoters + passives + detractors;
  const base = { versionId, audience: survey.audience, privacy: survey.privacy, fromDay, toDay };
  if (survey.privacy === "anonymous" && count < anonymousMinimum) return { ...base, status: "privacy-threshold", count: null, promoters: null, passives: null, detractors: null, score: null, invalidResponses: null };
  return { ...base, status: count ? "ready" : "no-responses", count, promoters, passives, detractors, invalidResponses, score: count ? Math.round((promoters - detractors) / count * 10000) / 100 : null };
}
