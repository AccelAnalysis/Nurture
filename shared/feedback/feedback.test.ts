import { describe, expect, it } from "vitest";
import { defaultReferralProgram, defaultSurvey } from "./defaults";
import type { SurveyResponse } from "./contracts";
import { reportNps } from "./reporting";
import { classifyFeedback, validateAnswers, validateProgram, validateSurvey } from "./validation";

describe("Release 4 feedback contracts", () => {
  it("ships six independent Nurture survey defaults", () => {
    const kinds = ["satisfaction", "nps", "data-gathering", "research", "onboarding-feedback", "cancellation-feedback"] as const;
    const surveys = kinds.map(defaultSurvey);
    expect(surveys.map(item => item.kind)).toEqual(kinds);
    surveys[0].title = "Changed locally";
    expect(defaultSurvey("satisfaction").title).not.toBe("Changed locally");
  });

  it("requires exactly one required 0-10 NPS question for NPS surveys", () => {
    const nps = validateSurvey(defaultSurvey("nps"));
    expect(nps.questions.filter(q => q.type === "nps")).toHaveLength(1);
    expect(() => validateAnswers(nps, { recommendation: 11 })).toThrow();
    expect(validateAnswers(nps, { recommendation: 10 }).recommendation).toBe(10);
    expect(classifyFeedback(nps, { recommendation: 9 })).toBe("positive");
    expect(classifyFeedback(nps, { recommendation: 6 })).toBe("negative");
    expect(classifyFeedback(nps, { recommendation: 8 })).toBe("neutral");
  });

  it("does not silently convert research or cancellation feedback into satisfaction", () => {
    const research = defaultSurvey("research");
    const cancellation = defaultSurvey("cancellation-feedback");
    expect(classifyFeedback(research, { feedback: "Excellent" })).toBe("neutral");
    expect(classifyFeedback(cancellation, { feedback: "Very unhappy" })).toBe("neutral");
  });

  it("rejects sign-in-required surveys that claim anonymous mode", () => {
    const survey = defaultSurvey("satisfaction");
    expect(() => validateSurvey({ ...survey, privacy: "anonymous", requireSignIn: true })).toThrow();
  });

  it("computes NPS with passives in the denominator and keeps version boundaries", () => {
    const survey = defaultSurvey("nps");
    const response = (id: string, score: number, versionId = "v1"): SurveyResponse => ({
      id, surveyId: "nps", versionId, privacy: "identified", answers: { recommendation: score }, receivedDay: "2026-09-05",
      customerId: `customer-${id}`, invitationId: `invite-${id}`, receivedAt: Date.parse("2026-09-05T12:00:00Z"),
    });
    const report = reportNps(survey, "v1", [response("p", 10), response("passive", 8), response("d", 2), response("other", 10, "v2")], "2026-09-01", "2026-09-30");
    expect(report).toMatchObject({ status: "ready", count: 3, promoters: 1, passives: 1, detractors: 1, score: 0 });
  });

  it("distinguishes no responses from an NPS score of zero", () => {
    const report = reportNps(defaultSurvey("nps"), "v1", [], "2026-09-01", "2026-09-30");
    expect(report.status).toBe("no-responses");
    expect(report.score).toBeNull();
    expect(report.count).toBe(0);
  });

  it("suppresses small anonymous cohorts instead of revealing their size", () => {
    const survey = { ...defaultSurvey("nps"), privacy: "anonymous" as const };
    const responses: SurveyResponse[] = [0, 1, 2, 3].map(index => ({ id: `r${index}`, surveyId: "nps", versionId: "v1", privacy: "anonymous", answers: { recommendation: 10 }, receivedDay: "2026-09-05" }));
    const report = reportNps(survey, "v1", responses, "2026-09-01", "2026-09-30", 5);
    expect(report).toMatchObject({ status: "privacy-threshold", count: null, score: null, invalidResponses: null });
  });

  it("keeps referral incentives test-only and program policy bounded", () => {
    const program = validateProgram(defaultReferralProgram());
    expect(program.active).toBe(false);
    expect(program.qualification).toBe("paid-subscription");
    expect(program.benefits).toEqual([{ beneficiary: "referrer", kind: "test-credit", units: 1 }]);
    expect(() => validateProgram({ ...program, windowDays: 0 })).toThrow();
  });
});
