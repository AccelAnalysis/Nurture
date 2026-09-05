import type { AuditFields, Instant } from './identity';
export type Channel = 'email' | 'sms';
export type TemplateType =
  | 'welcome'
  | 'registration'
  | 'invitation'
  | 'thankYou'
  | 'survey'
  | 'followUp'
  | 'offer'
  | 'upgrade'
  | 'winBack'
  | 'referral';
export interface MessageTemplate extends AuditFields {
  id: string;
  organizationId: string;
  name: string;
  type: TemplateType;
  channel: Channel;
  subject: string;
  body: string;
  variables: string[];
  status: 'draft' | 'published' | 'archived';
  version: number;
}
export interface SequenceStep {
  id: string;
  kind: 'email' | 'sms' | 'survey' | 'offer' | 'referral';
  name: string;
  /** Absolute offset from the enrollment trigger, not from the previous step. */
  delayDays: number;
  templateId: string | null;
  surveyId?: string;
  offerId?: string;
  consentPurpose: 'service' | 'marketing';
  skipIf?: 'surveyCompleted' | 'converted' | 'optedOut';
}
export interface ContactSequence extends AuditFields {
  id: string;
  organizationId: string;
  name: string;
  trigger: 'experienceCompleted' | 'contactAdded' | 'invitationAccepted';
  status: 'draft' | 'published' | 'archived';
  enabled: boolean;
  steps: SequenceStep[];
  timeZone: string;
  quietHours: { start: string; end: string };
  frequencyCapPerDay: number;
  stopOnConversion: boolean;
  version: number;
}
export interface SequenceEnrollment {
  id: string;
  organizationId: string;
  sequenceId: string;
  sequenceVersion: number;
  contactId: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  enrolledAt: Instant;
  nextRunAt: Instant | null;
  idempotencyKey: string;
}
export type QuestionType =
  'shortText' | 'longText' | 'singleChoice' | 'multipleChoice' | 'rating' | 'nps' | 'yesNo';
export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  title: string;
  required: boolean;
  options: string[];
}
export interface Survey extends AuditFields {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  questions: SurveyQuestion[];
  completionMessage: string;
  visibility: 'private' | 'public';
  version: number;
}
export interface SurveyResponse {
  id: string;
  organizationId: string;
  surveyId: string;
  surveyVersion: number;
  answers: Record<string, string | string[] | number | boolean>;
  userId: string | null;
  contactId: string | null;
  submittedAt: Instant;
}
