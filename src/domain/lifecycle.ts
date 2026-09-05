import type { AuditFields, Instant } from './identity';
export const pipelineStages = [
  { id: 1, title: 'Marketing', description: 'Create a meaningful first connection.', short: 'Discover' },
  { id: 2, title: 'Offers', description: 'Find an experience that fits.', short: 'Choose' },
  { id: 3, title: 'Registration + Onboarding', description: 'Make the next step personal.', short: 'Join' },
  {
    id: 4,
    title: 'The App Experience',
    description: 'Deliver value, before and after sign-up.',
    short: 'Experience',
  },
  { id: 5, title: 'Secondary Experience', description: 'Keep the relationship growing.', short: 'Continue' },
  { id: 6, title: 'Upsells + Recurring Offer', description: 'Offer a relevant next chapter.', short: 'Grow' },
  {
    id: 7,
    title: 'Feedback + Referral',
    description: 'Learn, improve, and welcome someone new.',
    short: 'Share',
  },
] as const;
export type PipelineStage = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ContactStatus =
  | 'new'
  | 'invited'
  | 'participated'
  | 'engaged'
  | 'converted'
  | 'retained'
  | 'advocate'
  | 'optedOut'
  | 'inactive';
export interface ConsentRecord {
  channel: 'email' | 'sms';
  purpose: 'service' | 'marketing';
  state: 'unknown' | 'granted' | 'withdrawn';
  capturedAt: Instant | null;
  source: string;
  policyVersion: string | null;
}
export interface Participation {
  experienceId: string;
  experienceName: string;
  status: 'started' | 'completed';
  startedAt: Instant;
  completedAt: Instant | null;
}
export interface CommunicationEvent {
  id: string;
  channel: 'email' | 'sms';
  subject: string;
  status: 'scheduled' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  occurredAt: Instant;
}
export interface ExperienceContact extends AuditFields {
  id: string;
  organizationId: string;
  /** A contact does not imply an Auth account or organization membership. */
  linkedUserId: string | null;
  name: string;
  email: string;
  phone: string;
  status: ContactStatus;
  stage: PipelineStage;
  source: 'experience' | 'manual' | 'import' | 'referral';
  tags: string[];
  consent: ConsentRecord[];
  referralSource: string | null;
  participation: Participation[];
  communicationHistory: CommunicationEvent[];
  lastContactAt: Instant | null;
  nextContactAt: Instant | null;
}
export interface Segment {
  id: string;
  organizationId: string;
  name: string;
  status?: ContactStatus;
  tag?: string;
  stage?: PipelineStage;
}
export interface ExperienceModule {
  id: string;
  title: string;
  description: string;
  slot: 'primary' | 'secondary';
  access: 'public' | 'anonymous' | 'registered' | 'entitled';
  status: 'placeholder' | 'available' | 'maintenance';
  requiredEntitlement?: string;
}
