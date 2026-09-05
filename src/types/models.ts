export type TimestampLike = Date | string;

export type UserStatus = "active" | "invited" | "suspended" | "disabled";
export type OnboardingStatus = "not-started" | "in-progress" | "complete";

export interface UserPreferences {
  theme: "system" | "light" | "dark";
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
}

export interface NurtureUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  firstName?: string;
  lastName?: string;
  photoURL?: string | null;
  phone?: string | null;
  status: UserStatus;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
  onboardingStatus: OnboardingStatus;
  defaultOrganizationId?: string;
  preferences: UserPreferences;
  referralCode?: string;
  referredBy?: string;
  lastActiveAt?: TimestampLike;
  isAnonymous?: boolean;
}

export type OrganizationStatus = "active" | "trial" | "suspended" | "archived";
export type OrganizationRole = "owner" | "administrator" | "manager" | "member";
export type MembershipStatus = "invited" | "active" | "suspended" | "removed";

export interface ReferralConfiguration {
  enabled: boolean;
  rewardType?: "credit" | "seat" | "feature" | "none";
  rewardValue?: number | string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  description?: string;
  website?: string;
  status: OrganizationStatus;
  ownerId: string;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
  settings: Record<string, boolean | string | number>;
  referralConfiguration: ReferralConfiguration;
}

export interface OrganizationMembership {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: MembershipStatus;
  invitedBy?: string;
  invitedAt?: TimestampLike;
  joinedAt?: TimestampLike;
}

export type ContactStatus =
  | "new"
  | "invited"
  | "participated"
  | "follow-up"
  | "engaged"
  | "converted"
  | "retained"
  | "advocate"
  | "paused"
  | "opted-out"
  | "churned";

export interface ConsentState {
  emailService: boolean;
  emailMarketing: boolean;
  smsService: boolean;
  smsMarketing: boolean;
  updatedAt?: TimestampLike;
}

export interface ExperienceParticipation {
  experienceId: string;
  experienceName: string;
  status: "started" | "completed" | "abandoned";
  startedAt?: TimestampLike;
  completedAt?: TimestampLike;
}

export interface CommunicationEvent {
  id: string;
  channel: "email" | "sms" | "in-app";
  direction: "outbound" | "inbound";
  status: "scheduled" | "sent" | "delivered" | "failed" | "cancelled";
  summary: string;
  occurredAt: TimestampLike;
}

export interface ExperienceContact {
  id: string;
  organizationId: string;
  linkedUserId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  status: ContactStatus;
  source: string;
  tags: string[];
  consent: ConsentState;
  referralSource?: string;
  participationHistory: ExperienceParticipation[];
  communicationHistory: CommunicationEvent[];
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export type SequenceStepType = "email" | "sms" | "survey" | "offer" | "referral-request";
export interface SequenceStep {
  id: string;
  order: number;
  type: SequenceStepType;
  delayDays: number;
  label: string;
  templateId?: string;
}

export interface ContactSequence {
  id: string;
  organizationId: string;
  name: string;
  trigger: "experience-completed" | "contact-created" | "manual";
  status: "draft" | "published" | "paused";
  enabled: boolean;
  steps: SequenceStep[];
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export type MessageTemplateType =
  | "welcome"
  | "registration"
  | "invitation"
  | "thank-you"
  | "survey-request"
  | "follow-up"
  | "offer"
  | "upgrade"
  | "win-back"
  | "referral-request";

export interface MessageTemplate {
  id: string;
  organizationId: string;
  name: string;
  type: MessageTemplateType;
  channel: "email" | "sms";
  subject?: string;
  body: string;
  variables: string[];
  status: "draft" | "active" | "archived";
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export type SurveyQuestionType =
  | "short-text"
  | "long-text"
  | "single-choice"
  | "multiple-choice"
  | "rating"
  | "nps"
  | "yes-no";

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  prompt: string;
  required: boolean;
  options?: string[];
}

export interface Survey {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  status: "draft" | "published" | "archived";
  questions: SurveyQuestion[];
  completionMessage: string;
}

export type OfferType = "free" | "trial" | "one-time" | "subscription" | "upgrade" | "promotion";
export interface Offer {
  id: string;
  organizationId?: string;
  name: string;
  description: string;
  type: OfferType;
  status: "draft" | "active" | "archived";
  priceLabel: string;
  entitlements: string[];
  campaign?: string;
}

export interface Referral {
  id: string;
  referralCode: string;
  referringUserId?: string;
  referringOrganizationId?: string;
  referredUserId?: string;
  source?: string;
  campaign?: string;
  status: "created" | "visited" | "registered" | "converted" | "expired";
  createdAt: TimestampLike;
  convertedAt?: TimestampLike;
}

export interface ReferralReward {
  id: string;
  referralId: string;
  recipientType: "user" | "organization";
  recipientId: string;
  rewardType: "credit" | "seat" | "feature";
  rewardValue: string | number;
  status: "pending" | "earned" | "redeemed" | "reversed";
}

export interface Feedback {
  id: string;
  organizationId?: string;
  userId?: string;
  category: "experience" | "bug" | "billing" | "idea" | "other";
  message: string;
  attachmentPath?: string;
  currentScreen?: string;
  appVersion?: string;
  browserMetadata?: string;
  status: "new" | "reviewing" | "resolved" | "closed";
  createdAt: TimestampLike;
}

export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  status: "pending" | "accepted" | "expired" | "revoked";
  invitedBy: string;
  invitedAt: TimestampLike;
  expiresAt: TimestampLike;
  acceptedAt?: TimestampLike;
}
