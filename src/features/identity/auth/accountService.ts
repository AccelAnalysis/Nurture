import { authService } from "../../../services/authService";
import type { CustomerProfile, LeadRecord } from "../model/contracts";
import { customerProfileRepository } from "../services/customerProfileRepository";
import { leadRepository } from "../services/leadRepository";

function leadCaptureInput(record: LeadRecord) {
  return {
    entryPoint: record.entryPoint,
    ...(record.organizationIdCandidate ? { organizationIdCandidate: record.organizationIdCandidate } : {}),
    ...(record.offerId ? { offerId: record.offerId } : {}),
    ...(record.referralCode ? { referralCode: record.referralCode } : {}),
    ...(record.source ? { source: record.source } : {}),
    ...(record.consentCandidate ? { consentCandidate: record.consentCandidate } : {}),
    startedAt: record.createdAt,
  };
}

export interface SignInAccountResult {
  customerProfile: CustomerProfile;
  transferredLead: LeadRecord | null;
}

/**
 * Sign into an existing account while preserving a lead captured under an
 * anonymous Firebase identity. The old anonymous document is historical input;
 * only the newly authenticated UID is used for the customer-linked candidate.
 */
export async function signInAccount(email: string, password: string): Promise<SignInAccountResult> {
  const before = authService.getCurrentUser();
  let anonymousLead: LeadRecord | null = null;
  if (before?.isAnonymous) {
    try {
      anonymousLead = await leadRepository.get(before.uid);
    } catch {
      anonymousLead = null;
    }
  }

  const credential = await authService.signIn(email, password);
  const customerProfile = await customerProfileRepository.getOrCreate(credential.user);
  let transferredLead: LeadRecord | null = null;
  if (anonymousLead) {
    await leadRepository.capture(credential.user.uid, leadCaptureInput(anonymousLead));
    transferredLead = await leadRepository.markRegistered(credential.user.uid, customerProfile.customerId);
  }
  return { customerProfile, transferredLead };
}
