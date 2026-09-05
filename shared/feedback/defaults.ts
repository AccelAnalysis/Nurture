import type { SurveyDraft, SurveyKind, ReferralProgramDraft } from "./contracts.js";
export const FEEDBACK_DEFAULT_VERSION = "r4-preview-1";
const labels: Record<SurveyKind, string> = {
  satisfaction: "How was your experience?", nps: "Would you recommend us?", "data-gathering": "Help us understand your needs",
  research: "Share your perspective", "onboarding-feedback": "How was getting started?", "cancellation-feedback": "Share optional cancellation feedback",
};
/** Preview/test timings, not approved live outreach settings. Fresh objects prevent shared-draft mutation. */
export function defaultSurvey(kind: SurveyKind): SurveyDraft {
  const questions: SurveyDraft["questions"] = kind === "nps"
    ? [{ id: "recommendation", label: "How likely are you to recommend us to a friend or colleague?", type: "nps", required: true }]
    : kind === "satisfaction" || kind === "onboarding-feedback"
      ? [{ id: "satisfaction", label: "How satisfied are you?", type: "rating", min: 1, max: 5, required: true }]
      : [{ id: "feedback", label: "What would you like us to know?", type: "text", required: true, maxLength: 2000 }];
  if (kind === "nps" || kind === "satisfaction" || kind === "onboarding-feedback") questions.push({ id: "comment", label: "What could we improve? (optional)", type: "text", required: false, maxLength: 2000 });
  return { title: labels[kind], kind, privacy: "identified", requireSignIn: false, audience: "all-eligible", questions, expiryHours: 168, cooldownHours: 720 };
}
export function defaultReferralProgram(): ReferralProgramDraft {
  return { title: "Invite someone to try the experience", terms: "Preview program only. Test credits have no monetary value. Sharing is optional.",
    active: false, attribution: "first-touch", windowDays: 30, cooldownHours: 720, invitationExpiryHours: 168, qualification: "paid-subscription",
    qualificationHoldHours: 24, maxQualifiedPerReferrer: 10, benefits: [{ beneficiary: "referrer", kind: "test-credit", units: 1 }] };
}
/** Register these seeds in the accepted communications catalog; do not create another sender or renderer. */
export const FEEDBACK_COMMUNICATION_SEEDS = [
  { templateId: "survey-invitation", purpose: "marketing", content: { name: "Survey invitation", subject: "Share feedback with {{organization.name}}", body: "Your feedback is optional. {{survey.title}}\n{{survey.url}}\nManage preferences: {{preferences.url}}", variables: ["organization.name", "survey.title", "survey.url", "preferences.url"] } },
  { templateId: "survey-reminder", purpose: "marketing", content: { name: "Survey reminder", subject: "An optional feedback reminder", body: "There is still time to share feedback: {{survey.url}}\nManage preferences: {{preferences.url}}", variables: ["survey.url", "preferences.url"] } },
  { templateId: "survey-thanks", purpose: "transactional", content: { name: "Feedback acknowledgement", subject: "Thank you for your feedback", body: "Your response was received. For help, contact {{support.email}}.", variables: ["support.email"] } },
  { templateId: "feedback-recovery", purpose: "transactional", content: { name: "Service recovery", subject: "We would like to help", body: "Thank you for telling us. Contact {{support.email}} for help. Your access is not affected by sharing feedback.", variables: ["support.email"] } },
  { templateId: "referral-invitation", purpose: "marketing", content: { name: "Referral invitation", subject: "Invite someone to {{organization.name}}", body: "Sharing is optional. Read the program terms and find your link: {{referral.centerUrl}}\nManage preferences: {{preferences.url}}", variables: ["organization.name", "referral.centerUrl", "preferences.url"] } },
  { templateId: "referral-status", purpose: "transactional", content: { name: "Referral progress", subject: "Your referral status changed", body: "Review your referral program status: {{referral.centerUrl}}", variables: ["referral.centerUrl"] } },
  { templateId: "referral-reward-issued", purpose: "transactional", content: { name: "Reward issued", subject: "Your referral benefit is ready", body: "Review the benefit and applicable terms: {{referral.centerUrl}}", variables: ["referral.centerUrl"] } },
  { templateId: "referral-reward-reversed", purpose: "transactional", content: { name: "Reward reversal", subject: "A referral benefit was adjusted", body: "Review the status and program terms: {{referral.centerUrl}}\nQuestions? {{support.email}}", variables: ["referral.centerUrl", "support.email"] } },
] as const;
