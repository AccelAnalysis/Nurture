import type { FeedbackConfiguration, NpsReport, ParticipantReferralView, PublishedFeedbackVersion, ReferralProgramDraft, SurveyAccess, SurveyAnswers, SurveyDraft, SurveyResponse } from "./contracts.js";
export type ConfigurationKind = "survey" | "program";
export type ConfigurationDraft = SurveyDraft | ReferralProgramDraft;
export interface FeedbackApi {
  list(kind: ConfigurationKind, after?: string): Promise<{ rows: FeedbackConfiguration<ConfigurationDraft>[]; cursor: string | null }>;
  save(kind: ConfigurationKind, entityId: string, revision: number, draft: ConfigurationDraft): Promise<FeedbackConfiguration<ConfigurationDraft>>;
  publish(kind: ConfigurationKind, entityId: string, revision: number): Promise<PublishedFeedbackVersion<ConfigurationDraft>>;
  archive(kind: ConfigurationKind, entityId: string, revision: number): Promise<void>;
  history(kind: ConfigurationKind, entityId: string, after?: string): Promise<{ rows: PublishedFeedbackVersion<ConfigurationDraft>[]; cursor: string | null }>;
  survey(token: string): Promise<SurveyAccess>;
  submit(token: string, answers: SurveyAnswers): Promise<{ state: "completed" | "already-completed" }>;
  nps(versionId: string, fromDay: string, toDay: string): Promise<NpsReport>;
  responses(versionId: string, after?: string): Promise<{ rows: SurveyResponse[]; cursor: string | null }>;
  withdraw(invitationId: string): Promise<void>;
  closeRecovery(customerId: string, reason: string): Promise<void>;
  referral(programId: string, after?: string): Promise<ParticipantReferralView>;
  code(programId: string): Promise<{ code: string; terms: string }>;
  capture(code: string, previousProof?: string): Promise<{ proof: string }>;
  bind(proof: string): Promise<{ status: string }>;
}
