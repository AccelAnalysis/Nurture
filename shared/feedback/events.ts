/** Registration additions for the canonical shared/analytics EVENT_CATALOG. */
const trusted = ["trusted_server"] as const;
export const FEEDBACK_EVENT_CATALOG = {
  "survey.invitation_created": { owner: "E", allowedSources: trusted, family: "satisfaction" },
  "survey.completed": { owner: "C", allowedSources: trusted, family: "satisfaction" },
  "survey.service_recovery_started": { owner: "E", allowedSources: trusted, family: "satisfaction" },
  "survey.nps.promoter": { owner: "F", allowedSources: trusted, family: "satisfaction" },
  "survey.nps.passive": { owner: "F", allowedSources: trusted, family: "satisfaction" },
  "survey.nps.detractor": { owner: "F", allowedSources: trusted, family: "satisfaction" },
  "referral.invitation_created": { owner: "E", allowedSources: trusted, family: "referral" },
  "referral.created": { owner: "C", allowedSources: trusted, family: "referral" },
  "referral.registered": { owner: "C", allowedSources: trusted, family: "referral" },
  "referral.qualified": { owner: "E", allowedSources: trusted, family: "referral" },
  "referral.rejected": { owner: "E", allowedSources: trusted, family: "referral" },
  "referral.reward_issued": { owner: "E", allowedSources: trusted, family: "referral" },
  "referral.reward_reversed": { owner: "E", allowedSources: trusted, family: "referral" },
} as const;
export type FeedbackEventType = keyof typeof FEEDBACK_EVENT_CATALOG;
