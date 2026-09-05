import type { FeedbackConfiguration, FeedbackScope, PublishedFeedbackVersion, ReferralProgramDraft, SurveyDraft, SurveyInvitation } from "../../../shared/feedback/contracts.js";
import { id, invariant } from "../../../shared/feedback/validation.js";
import type { FeedbackDependencies } from "./ports.js";

interface ReferralInvitationRecord {
  id: string;
  programId: string;
  versionId: string;
  customerId: string;
  expiresAt: number;
}

export async function loadSurveyPresentation(deps: FeedbackDependencies, scope: FeedbackScope, invitationId: string) {
  id(invitationId);
  return deps.store.transaction(scope, async tx => {
    const policy = await deps.policy(tx, scope);
    invariant(policy.enabled && !policy.paused, "paused");
    const invitation = await tx.get<SurveyInvitation>("surveyInvitations", invitationId);
    invariant(invitation && !invitation.withdrawn && !invitation.completed && invitation.expiresAt > deps.now(), "ineligible");
    const config = await tx.get<FeedbackConfiguration<SurveyDraft>>("surveyConfigurations", invitation.surveyId);
    const version = await tx.get<PublishedFeedbackVersion<SurveyDraft>>("surveyVersions", invitation.versionId);
    invariant(config && !config.archived && version && version.entityId === invitation.surveyId, "unavailable");
    if (version.value.privacy === "anonymous") invariant(policy.anonymousPolicyId, "policy-required");
    const token = deps.token(invitation.keyId, JSON.stringify(["survey-invitation", scope.organizationId, scope.dataMode, invitation.id]));
    invariant(deps.digest(token) === invitation.tokenDigest, "unavailable");
    return {
      invitationId: invitation.id,
      versionId: version.id,
      title: version.value.title,
      body: "Your feedback is optional. You can leave the survey without changing your access.",
      cta: { label: "Share feedback", href: `/survey#invitation=${token}` },
    };
  });
}

export async function loadReferralPresentation(deps: FeedbackDependencies, scope: FeedbackScope, invitationId: string) {
  id(invitationId);
  return deps.store.transaction(scope, async tx => {
    const policy = await deps.policy(tx, scope);
    invariant(policy.enabled && !policy.paused, "paused");
    const invitation = await tx.get<ReferralInvitationRecord>("referralInvitations", invitationId);
    invariant(invitation && invitation.expiresAt > deps.now(), "ineligible");
    const config = await tx.get<FeedbackConfiguration<ReferralProgramDraft>>("programConfigurations", invitation.programId);
    const version = await tx.get<PublishedFeedbackVersion<ReferralProgramDraft>>("programVersions", invitation.versionId);
    invariant(config && !config.archived && version && version.entityId === invitation.programId && version.value.active, "ineligible");
    return {
      invitationId: invitation.id,
      versionId: version.id,
      title: version.value.title,
      body: "Sharing is optional. Review the current program terms before sending your referral link.",
      cta: { label: "View referral program", href: "/app/referrals" },
    };
  });
}
