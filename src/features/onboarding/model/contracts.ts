import type { UserPreferences } from "../../../types/models";

export type OnboardingStepStatus = "not-started" | "current" | "complete" | "blocked" | "skipped";
export type OnboardingStatus = "not-started" | "in-progress" | "complete" | "abandoned";
export type OnboardingValue = string | boolean | string[];
export type OnboardingFieldType = "text" | "email" | "tel" | "textarea" | "checkbox" | "select";
export type CustomerProfileField = "displayName" | "firstName" | "lastName" | "phone";
export type CustomerPreferenceField = keyof UserPreferences;

export interface OnboardingFieldOption {
  value: string;
  label: string;
}

export interface OnboardingFieldDefinition {
  id: string;
  label: string;
  type: OnboardingFieldType;
  required: boolean;
  purpose: string;
  placeholder?: string;
  profileField?: CustomerProfileField;
  preferenceField?: CustomerPreferenceField;
  options?: OnboardingFieldOption[];
}

export interface OnboardingAgreementDefinition {
  id: string;
  version: string;
  label: string;
  required: boolean;
  href?: string;
}

export interface OnboardingStepDefinition {
  id: string;
  route: string;
  label: string;
  description: string;
  optional: boolean;
  fields?: OnboardingFieldDefinition[];
  agreement?: OnboardingAgreementDefinition;
}

export interface OnboardingDefinition {
  id: string;
  version: string;
  welcomeTitle: string;
  welcomeBody: string;
  requiresVerifiedEmail: boolean;
  steps: OnboardingStepDefinition[];
}

export interface OnboardingExtension {
  source: "organization" | "experience";
  namespace: string;
  steps: OnboardingStepDefinition[];
}

export interface AgreementAcceptance {
  agreementId: string;
  version: string;
  acceptedAt: string;
}

export interface OnboardingState {
  identityId: string;
  customerId: string;
  definitionId: string;
  definitionVersion: string;
  status: OnboardingStatus;
  currentStepId?: string;
  steps: Record<string, OnboardingStepStatus>;
  answers: Record<string, OnboardingValue>;
  acceptedAgreements: Record<string, AgreementAcceptance>;
  startedAt?: string;
  lastActivityAt: string;
  completedAt?: string;
  abandonedAt?: string;
}
