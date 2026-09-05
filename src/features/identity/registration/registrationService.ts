import type { User } from "firebase/auth";
import { authService } from "../../../services/authService";
import { emitIdentityLifecycleSignal } from "../events";
import type { CustomerProfile, LeadCaptureInput, LeadRecord } from "../model/contracts";
import { customerProfileRepository } from "../services/customerProfileRepository";
import { leadRepository } from "../services/leadRepository";
import type { RegistrationHandoff } from "./contracts";

function leadInputFromHandoff(handoff: RegistrationHandoff | undefined, startedAt?: string): LeadCaptureInput {
  return {
    entryPoint: handoff?.entryPoint ?? "public",
    ...(handoff?.organizationId ? { organizationIdCandidate: handoff.organizationId } : {}),
    ...(handoff?.offerId ? { offerId: handoff.offerId } : {}),
    ...(handoff?.referralCode ? { referralCode: handoff.referralCode } : {}),
    ...(handoff?.source ? { source: handoff.source } : {}),
    ...(startedAt ? { startedAt } : {}),
  };
}

async function captureForIdentity(identityId: string, input: LeadCaptureInput) {
  const result = await leadRepository.capture(identityId, input);
  if (result.created) {
    emitIdentityLifecycleSignal("lead.created", { identityId, leadId: result.record.leadId }, {
      entryPoint: result.record.entryPoint,
      hasOrganizationCandidate: Boolean(result.record.organizationIdCandidate),
      hasOffer: Boolean(result.record.offerId),
      hasReferral: Boolean(result.record.referralCode),
    });
  }
  return result.record;
}

/**
 * Public/marketing surfaces can use this to turn a permitted form submission
 * into an identity-scoped lead candidate before registration. The organization
 * value remains a candidate until a trusted backend binds tenant scope.
 */
export async function captureInitialLead(input: LeadCaptureInput): Promise<LeadRecord> {
  const user = await authService.ensureAnonymousSession();
  return captureForIdentity(user.uid, input);
}

export interface RegisterAccountInput {
  email: string;
  password: string;
  handoff?: RegistrationHandoff;
}

export interface RegisterAccountResult {
  user: User;
  customerProfile: CustomerProfile;
  lead: LeadRecord;
  verificationRequested: boolean;
}

export async function registerAccount(input: RegisterAccountInput): Promise<RegisterAccountResult> {
  const startedAt = new Date().toISOString();
  const existingIdentity = authService.getCurrentUser();
  emitIdentityLifecycleSignal(
    "registration.started",
    existingIdentity ? { identityId: existingIdentity.uid } : {},
    { entryPoint: input.handoff?.entryPoint ?? "public" },
  );

  const leadInput = leadInputFromHandoff(input.handoff, startedAt);
  let lead: LeadRecord | null = null;

  // Anonymous Auth may be intentionally disabled in some environments. The
  // registration still proceeds; the lead candidate is then created under the
  // registered identity with the original startedAt timestamp.
  try {
    const anonymous = existingIdentity ?? (await authService.ensureAnonymousSession());
    if (anonymous.isAnonymous) lead = await captureForIdentity(anonymous.uid, leadInput);
  } catch {
    lead = null;
  }

  const credential = await authService.register(input.email, input.password);
  const customerProfile = await customerProfileRepository.getOrCreate(credential.user);
  if (!lead || lead.identityId !== credential.user.uid) {
    lead = await captureForIdentity(credential.user.uid, leadInput);
  }
  lead = await leadRepository.markRegistered(credential.user.uid, customerProfile.customerId);

  emitIdentityLifecycleSignal(
    "registration.completed",
    { identityId: credential.user.uid, customerId: customerProfile.customerId, leadId: lead.leadId },
    { entryPoint: lead.entryPoint },
  );

  let verificationRequested = false;
  if (credential.user.email && !credential.user.emailVerified) {
    try {
      await authService.sendVerification();
      verificationRequested = true;
    } catch {
      // Verification remains available from /verify-email. A delivery/provider
      // failure must not roll back an already-created identity/customer.
    }
  }

  return { user: credential.user, customerProfile, lead, verificationRequested };
}
