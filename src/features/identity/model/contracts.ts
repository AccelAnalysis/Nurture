import type { OnboardingStatus, UserPreferences } from "../../../types/models";
import type { RegistrationEntryPoint } from "../registration/contracts";

export type IdentitySessionKind = "anonymous" | "registered";

export interface IdentitySession {
  identityId: string;
  kind: IdentitySessionKind;
  email: string | null;
  emailVerified: boolean;
  providerIds: string[];
  authenticatedAt?: string;
}

export interface CustomerProfile {
  customerId: string;
  identityId: string;
  email: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: "active";
  onboardingStatus: OnboardingStatus;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export type CustomerProfileChanges = Partial<
  Pick<CustomerProfile, "displayName" | "firstName" | "lastName" | "phone" | "onboardingStatus">
> & {
  preferences?: Partial<UserPreferences>;
};

export type LeadLifecycleState = "identified" | "lead" | "registered";

export interface LeadConsentCandidate {
  emailMarketing?: boolean;
  smsMarketing?: boolean;
  capturedAt: string;
  policyVersion?: string;
}

export interface LeadRecord {
  leadId: string;
  identityId: string;
  state: LeadLifecycleState;
  entryPoint: RegistrationEntryPoint;
  organizationIdCandidate?: string;
  offerId?: string;
  referralCode?: string;
  source?: string;
  consentCandidate?: LeadConsentCandidate;
  customerId?: string;
  createdAt: string;
  updatedAt: string;
  registeredAt?: string;
}

export interface LeadCaptureInput {
  entryPoint?: RegistrationEntryPoint;
  organizationIdCandidate?: string;
  offerId?: string;
  referralCode?: string;
  source?: string;
  consentCandidate?: Omit<LeadConsentCandidate, "capturedAt"> & { capturedAt?: string };
  startedAt?: string;
}
