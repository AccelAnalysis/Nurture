import type { AnalyticsDataMode } from "../analytics/contracts.js";

/** Feature scope, not a replacement Organization, Customer or identity model. */
export interface FeedbackScope { organizationId: string; dataMode: AnalyticsDataMode }
export type SurveyKind = "satisfaction" | "nps" | "data-gathering" | "research" | "onboarding-feedback" | "cancellation-feedback";
export type SurveyPrivacy = "identified" | "anonymous";
export type SurveyQuestion =
  | { id: string; label: string; required: boolean; type: "nps" }
  | { id: string; label: string; required: boolean; type: "rating"; min: number; max: number }
  | { id: string; label: string; required: boolean; type: "choice"; options: string[] }
  | { id: string; label: string; required: boolean; type: "text"; maxLength: number };
export interface SurveyDraft {
  title: string; kind: SurveyKind; privacy: SurveyPrivacy; requireSignIn: boolean;
  audience: "all-eligible" | "configured-segment"; questions: SurveyQuestion[];
  expiryHours: number; cooldownHours: number;
}
export interface RewardBenefit { beneficiary: "referrer" | "referred"; kind: "test-credit"; units: number }
export interface ReferralProgramDraft {
  title: string; terms: string; active: boolean; attribution: "first-touch" | "last-touch";
  windowDays: number; cooldownHours: number; invitationExpiryHours: number; qualification: "paid-subscription";
  qualificationHoldHours: number; maxQualifiedPerReferrer: number; benefits: RewardBenefit[];
}
export interface FeedbackConfiguration<T> {
  id: string; revision: number; draft: T; publishedVersionId: string | null;
  archived: boolean; defaultVersion: string | null; updatedAt: number;
}
export interface PublishedFeedbackVersion<T> {
  id: string; entityId: string; revision: number; value: T; publishedAt: number;
}
export interface SurveyInvitation {
  id: string; surveyId: string; versionId: string; customerId: string;
  keyId: string; tokenDigest: string; expiresAt: number; createdAt: number;
  completed: boolean; withdrawn: boolean;
}
export type SurveyAnswers = Record<string, string | number>;
export interface SurveyResponse {
  id: string; surveyId: string; versionId: string; privacy: SurveyPrivacy;
  answers: SurveyAnswers; receivedDay: string;
  /** These three fields MUST be absent on anonymous responses. */
  customerId?: string; invitationId?: string; receivedAt?: number;
}
export interface SurveyAccess {
  state: "ready" | "completed" | "sign-in-required";
  survey: SurveyDraft; versionId: string;
}
export type ReferralStatus = "attributed" | "registered" | "pending-qualification" | "qualified" | "rejected" | "reversed";
export interface ReferralAttribution {
  id: string; programId: string; versionId: string; referrerCustomerId: string;
  referredCustomerId: string | null; proofDigest: string;
  createdAt: number; expiresAt: number; status: ReferralStatus;
  evidenceId: string | null; reason: string | null; rewardIds: string[];
}
export type RewardState = "pending" | "executing" | "unknown" | "issued" | "cancelled" | "reversing" | "reversal-unknown" | "reversed" | "failed";
export interface ReferralRewardEffect {
  id: string; referralId: string; programId: string; versionId: string;
  beneficiaryCustomerId: string; benefit: RewardBenefit; state: RewardState;
  attempt: number; reversalAttempt: number; leaseUntil: number; providerReference: string | null;
  reversalRequested: boolean; reason: string | null;
}
export interface ReferralCodeRecord { programId: string; versionId: string; customerId: string; keyId: string; digest: string; generationId: string; expiresAt: number }
export interface ParticipantReferralView {
  programId: string; title: string; terms: string; code: string | null;
  shareAvailable: boolean; reason: string | null; cursor: string | null;
  /** No identities or payment details belonging to the referred person. */
  progress: { referralId: string; status: ReferralStatus; rewards: { state: RewardState; units: number; kind: "test-credit" }[] }[];
}
export interface NpsReport {
  versionId: string; audience: SurveyDraft["audience"]; privacy: SurveyPrivacy;
  fromDay: string; toDay: string; count: number | null; promoters: number | null;
  passives: number | null; detractors: number | null; score: number | null; invalidResponses: number | null;
  status: "ready" | "no-responses" | "privacy-threshold";
}
export type FeedbackErrorCode = "invalid-input" | "unavailable" | "permission-denied" | "conflict" | "ineligible" | "paused" | "policy-required" | "release-blocked";
export class FeedbackError extends Error {
  constructor(public readonly code: FeedbackErrorCode, message: string = code) { super(message); this.name = "FeedbackError"; }
}
