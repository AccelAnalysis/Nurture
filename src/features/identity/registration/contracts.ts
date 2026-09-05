export type RegistrationEntryPoint = "public" | "offer" | "trial" | "organization-invitation" | "referral";

export interface RegistrationHandoff {
  entryPoint: RegistrationEntryPoint;
  returnTo?: string;
  invitationId?: string;
  referralCode?: string;
  offerId?: string;
}

// The Identity owner defines production registration steps and profile bootstrap.
// The skeleton only reserves the typed handoff from upstream surfaces.
