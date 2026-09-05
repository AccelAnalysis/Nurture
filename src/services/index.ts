import type {
  ContactSequence,
  ExperienceContact,
  Feedback,
  Offer,
  Organization,
  OrganizationInvitation,
  OrganizationMembership,
  Referral,
  Survey,
  NurtureUser,
  MessageTemplate,
} from "../types/models";

export interface UserService {
  get(uid: string): Promise<NurtureUser | null>;
  updateProfile(uid: string, changes: Partial<NurtureUser>): Promise<void>;
}

export interface OrganizationService {
  get(id: string): Promise<Organization | null>;
  listMemberships(organizationId: string): Promise<OrganizationMembership[]>;
  listInvitations(organizationId: string): Promise<OrganizationInvitation[]>;
}

export interface ContactService {
  list(organizationId: string): Promise<ExperienceContact[]>;
  get(organizationId: string, contactId: string): Promise<ExperienceContact | null>;
}

export interface MessageTemplateService {
  list(organizationId: string): Promise<MessageTemplate[]>;
}

export interface SequenceService {
  list(organizationId: string): Promise<ContactSequence[]>;
}

export interface SurveyService {
  list(organizationId: string): Promise<Survey[]>;
}

export interface OfferService {
  listPublic(): Promise<Offer[]>;
  listForOrganization(organizationId: string): Promise<Offer[]>;
}

export interface ReferralService {
  captureAttribution(referralCode: string): void;
  listForOrganization(organizationId: string): Promise<Referral[]>;
}

export interface FeedbackService {
  submit(feedback: Omit<Feedback, "id" | "createdAt" | "status">): Promise<string>;
}

export interface CheckoutService {
  createSession(offerId: string): Promise<{ redirectUrl: string }>;
}

export interface SubscriptionService {
  openPortal(): Promise<{ redirectUrl: string }>;
}

export interface BillingService {
  createCheckoutSession(offerId: string): Promise<{ redirectUrl: string }>;
  openBillingPortal(): Promise<{ redirectUrl: string }>;
}

export interface NotificationService {
  markRead(notificationId: string): Promise<void>;
}

export const serverOnlyIntegrations = {
  stripe: "Cloud Functions service boundary — never expose secret keys to the client.",
  twilio: "Cloud Functions service boundary — SMS credentials remain server-side.",
  sendGrid: "Cloud Functions service boundary — email credentials remain server-side.",
} as const;
