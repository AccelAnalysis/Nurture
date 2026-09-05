import type { FeedbackScope, ReferralRewardEffect } from "../../../shared/feedback/contracts.js";
import { invariant } from "../../../shared/feedback/validation.js";
import { mutationPolicy, requireCustomer, type FeedbackAction, type FeedbackDependencies } from "./ports.js";
import { SurveyService } from "./surveys.js";
import { ReferralService } from "./referrals.js";

/** Registration descriptors for the existing R3 lifecycle engine. They are not a scheduler. */
export const feedbackAutomationTemplates = [
  { id:"r4-onboarding-satisfaction", trigger:"onboarding.completed", action:"survey.invite", enabled:false },
  { id:"r4-nps", trigger:"onboarding.completed", delay:"organization-configured", action:"survey.invite", enabled:false },
  { id:"r4-feedback-referral", trigger:"survey.nps.promoter", action:"referral.invite", enabled:false },
  { id:"r4-milestone-referral", trigger:"experience.milestone_reached", action:"referral.invite", enabled:false },
  { id:"r4-renewal-referral", trigger:"subscription.renewed", action:"referral.invite", enabled:false },
] as const;
export interface FeedbackDeliveryPort {
  /** Must be the accepted D dispatcher: apply current purpose/channel consent, sender readiness, suppression,
   * quiet hours, test allowlist and R3 global cap; use effectId for retries. Return its recorded outcome.
   * The callback MUST run at final dispatch, not at scheduling time. */
  dispatch(scope: FeedbackScope, action: FeedbackAction, finalVariables: () => Promise<Record<string,string>>): Promise<{ status: string }>;
  /** Resolve the organization's verified application URL and contact configuration, not browser-supplied URLs. */
  publicOrigin(scope: FeedbackScope): Promise<string>;
}
export function feedbackDelivery(deps: FeedbackDependencies, communications: FeedbackDeliveryPort) {
  const surveys = new SurveyService(deps), referrals = new ReferralService(deps);
  return (scope: FeedbackScope, action: FeedbackAction) => communications.dispatch(scope, action, async (): Promise<Record<string,string>> => {
    const origin = new URL(await communications.publicOrigin(scope));
    invariant(origin.protocol === "https:" && !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/", "invalid-input");
    if (action.kind === "survey-invitation") {
      const invite = await surveys.prepareDelivery(scope,action.referenceId); invariant(invite.customerId === action.customerId,"ineligible");
      // Fragment tokens are not sent in HTTP URLs/Referer headers. The first-party client submits through the callable body.
      const url = new URL("/survey",origin); url.hash = `invitation=${invite.token}`;
      return { "survey.title":invite.title, "survey.url":url.toString() };
    }
    if (action.kind === "referral-invitation") {
      const invite = await referrals.prepareDelivery(scope,action.referenceId); invariant(invite.customerId === action.customerId,"ineligible");
      return { "referral.centerUrl":new URL("/app/referrals",origin).toString() };
    }
    return deps.store.transaction<Record<string,string>>(scope, async (tx): Promise<Record<string,string>> => {
      const policy = await mutationPolicy(deps, tx, scope, true); invariant(policy.outboundEnabled, "paused");
      await requireCustomer(deps, tx, scope, action.customerId);
      if (action.kind === "service-recovery") {
        const treatment = await tx.get<{ customerId: string; recoveryOpen: boolean }>("feedbackTreatment", action.referenceId);
        invariant(treatment?.customerId === action.customerId && treatment.recoveryOpen, "ineligible");
        // support.email is resolved by D from the organization's verified sender/support configuration.
        const variables: Record<string,string> = {};
        return variables;
      }
      invariant(action.kind === "reward-status", "invalid-input");
      const reward = await tx.get<ReferralRewardEffect>("referralRewards", action.referenceId);
      invariant(reward?.beneficiaryCustomerId === action.customerId && (reward.state === "issued" || reward.state === "reversed"), "ineligible");
      // Use a neutral status template so an old queued notice never claims a reversed benefit was just issued.
      return { "referral.centerUrl":new URL("/app/referrals",origin).toString() };
    });
  });
}
