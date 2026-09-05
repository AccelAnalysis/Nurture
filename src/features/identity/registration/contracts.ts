export type RegistrationEntryPoint = "public" | "offer" | "trial" | "organization-invitation" | "referral";

export interface RegistrationHandoff {
  entryPoint: RegistrationEntryPoint;
  returnTo?: string;
  organizationId?: string;
  invitationId?: string;
  referralCode?: string;
  offerId?: string;
  source?: string;
}

export type RegistrationState =
  | "idle"
  | "capturing-lead"
  | "creating-identity"
  | "bootstrapping-customer"
  | "requesting-verification"
  | "complete"
  | "error";
