import { type FeedbackScope, type SurveyDraft, type FeedbackConfiguration, type PublishedFeedbackVersion, type SurveyInvitation, type SurveyResponse, type SurveyAccess } from "../../../shared/feedback/contracts.js";
import { classifyFeedback, id, invariant, validateAnswers } from "../../../shared/feedback/validation.js";
import { reportNps } from "../../../shared/feedback/reporting.js";
import { admit, audit, event, key, mutationPolicy, requireCustomer, staff, type FeedbackDependencies, type FeedbackTransaction, type TrustedFeedbackActor } from "./ports.js";

export class SurveyService {
  constructor(private readonly deps: FeedbackDependencies) {}
  private token(scope: FeedbackScope, invitationId: string, keyId: string): string {
    return this.deps.token(keyId, JSON.stringify(["survey-invitation", scope.organizationId, scope.dataMode, invitationId]));
  }
  /** Trusted Release 3 runtime action handler. It is intentionally not exposed as a customer callable. */
  async invite(scope: FeedbackScope, surveyId: string, customerId: string, triggerOccurrence: string): Promise<{ invitationId: string }> {
    id(surveyId); id(customerId); id(triggerOccurrence);
    const invitationId = key(this.deps, scope, "survey", surveyId, customerId, triggerOccurrence);
    return this.deps.store.transaction(scope, async tx => {
      const policy = await mutationPolicy(this.deps, tx, scope, true);
      const existing = await tx.get<SurveyInvitation>("surveyInvitations", invitationId);
      if (existing) return { invitationId };
      const config = await tx.get<FeedbackConfiguration<SurveyDraft>>("surveyConfigurations", surveyId);
      invariant(config?.publishedVersionId && !config.archived, "ineligible");
      const version = await tx.get<PublishedFeedbackVersion<SurveyDraft>>("surveyVersions", config.publishedVersionId);
      invariant(version, "unavailable");
      if (version.value.privacy === "anonymous") invariant(policy.anonymousPolicyId, "policy-required");
      const customer = await requireCustomer(this.deps, tx, scope, customerId); invariant(customer.feedbackAllowed, "ineligible");
      const capId = key(this.deps, scope, "survey-cap", customerId);
      const cap = await tx.get<{ nextAt: number }>("feedbackCooldowns", capId);
      const now = this.deps.now(); invariant(!cap || cap.nextAt <= now, "ineligible", "Survey cooldown is active.");
      await admit(this.deps, tx, scope, customerId, "survey");
      const tokenDigest = this.deps.digest(this.token(scope, invitationId, this.deps.tokenKeyId));
      const invitation: SurveyInvitation = { id: invitationId, surveyId, versionId: version.id, customerId,
        keyId: this.deps.tokenKeyId, tokenDigest, expiresAt: now + version.value.expiryHours * 3600000,
        createdAt: now, completed: false, withdrawn: false };
      tx.create("surveyInvitations", invitationId, invitation); tx.create("surveyTokens", tokenDigest, { invitationId });
      tx.put("feedbackCooldowns", capId, { nextAt: now + version.value.cooldownHours * 3600000 });
      event(tx, "survey.invitation_created", key(this.deps, scope, invitationId, "created"), { surveyId, versionId: version.id }, customerId);
      audit(tx, scope, "survey.invitation_created", invitationId, null, key(this.deps, scope, invitationId, "audit"));
      return { invitationId };
    });
  }
  private async load(tx: FeedbackTransaction, scope: FeedbackScope, token: string) {
    invariant(typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token), "unavailable", "Survey link is unavailable.");
    const tokenDigest = this.deps.digest(token);
    const index = await tx.get<{ invitationId: string }>("surveyTokens", tokenDigest);
    const invitation = index ? await tx.get<SurveyInvitation>("surveyInvitations", index.invitationId) : null;
    invariant(invitation && invitation.tokenDigest === tokenDigest && !invitation.withdrawn && invitation.expiresAt > this.deps.now(), "unavailable", "Survey link is unavailable or expired.");
    const config = await tx.get<FeedbackConfiguration<SurveyDraft>>("surveyConfigurations", invitation.surveyId);
    const version = await tx.get<PublishedFeedbackVersion<SurveyDraft>>("surveyVersions", invitation.versionId);
    invariant(config && !config.archived && version && version.entityId === invitation.surveyId, "unavailable");
    const policy = await this.deps.policy(tx, scope); invariant(policy.enabled, "unavailable");
    if (version.value.privacy === "anonymous") invariant(policy.anonymousPolicyId, "policy-required");
    return { invitation, version };
  }
  async access(scope: FeedbackScope, token: string, actor: TrustedFeedbackActor | null): Promise<SurveyAccess> {
    return this.deps.store.transaction(scope, async tx => {
      const { invitation, version } = await this.load(tx, scope, token);
      const customer = await requireCustomer(this.deps, tx, scope, invitation.customerId); invariant(customer.feedbackAllowed, "unavailable");
      const signInRequired = version.value.requireSignIn && (!actor || actor.customerId !== invitation.customerId || actor.uid !== customer.identityId);
      return { state: invitation.completed ? "completed" : signInRequired ? "sign-in-required" : "ready", survey: version.value, versionId: version.id };
    });
  }
  async submit(scope: FeedbackScope, token: string, rawAnswers: unknown, actor: TrustedFeedbackActor | null): Promise<{ state: "completed" | "already-completed" }> {
    const responseId = this.deps.randomId();
    return this.deps.store.transaction(scope, async tx => {
      await mutationPolicy(this.deps, tx, scope);
      const { invitation, version } = await this.load(tx, scope, token);
      const customer = await requireCustomer(this.deps, tx, scope, invitation.customerId); invariant(customer.feedbackAllowed, "ineligible");
      if (version.value.requireSignIn) invariant(actor?.customerId === invitation.customerId && actor.uid === customer.identityId, "permission-denied");
      if (invitation.completed) return { state: "already-completed" as const };
      const answers = validateAnswers(version.value, rawAnswers); const now = this.deps.now();
      const identified = version.value.privacy === "identified";
      const response: SurveyResponse = { id: responseId, surveyId: invitation.surveyId, versionId: version.id,
        privacy: version.value.privacy, answers, receivedDay: new Date(now).toISOString().slice(0, 10),
        ...(identified ? { customerId: invitation.customerId, invitationId: invitation.id, receivedAt: now } : {}) };
      tx.create("surveyResponses", responseId, response); tx.put("surveyInvitations", invitation.id, { ...invitation, completed: true });
      // Anonymous responses have no persisted join key to the invitation/customer and no customer-derived treatment.
      const completionId = key(this.deps, scope, identified ? invitation.id : responseId, "survey-completed");
      event(tx, "survey.completed", completionId, { surveyId: invitation.surveyId, versionId: version.id, privacy: version.value.privacy }, identified ? invitation.customerId : undefined);
      audit(tx, scope, "survey.response_recorded", identified ? invitation.id : version.id, identified ? actor : null, completionId,
        { surveyId: invitation.surveyId, versionId: version.id, privacy: version.value.privacy });
      if (identified) {
        const classification = classifyFeedback(version.value, answers);
        const treatmentId = key(this.deps, scope, "treatment", invitation.customerId);
        const previous = await tx.get<{ recoveryOpen: boolean }>("feedbackTreatment", treatmentId);
        // Positive feedback cannot silently close an unresolved adverse-feedback treatment.
        tx.put("feedbackTreatment", treatmentId, { customerId: invitation.customerId, recoveryOpen: classification === "negative" || previous?.recoveryOpen === true,
          positiveFeedback: classification === "positive", surveyId: invitation.surveyId, versionId: version.id, updatedAt: now });
        if (version.value.kind === "nps") {
          const category = classification === "positive" ? "promoter" : classification === "negative" ? "detractor" : "passive";
          event(tx, `survey.nps.${category}`, key(this.deps, scope, completionId, category), { surveyId: invitation.surveyId, versionId: version.id }, invitation.customerId);
        }
        if (classification === "negative") {
          // Service recovery is itself a canonical lifecycle event. Release 3 owns
          // any delayed/in-app/email treatment that follows; no second queue lives here.
          event(tx, "survey.service_recovery_started", key(this.deps, scope, completionId, "recovery"), { surveyId: invitation.surveyId, versionId: version.id }, invitation.customerId);
        }
      }
      return { state: "completed" as const };
    });
  }
  async withdraw(scope: FeedbackScope, actor: TrustedFeedbackActor, invitationId: string): Promise<void> {
    staff(actor, "surveys.manage"); id(invitationId);
    await this.deps.store.transaction(scope, async tx => {
      await mutationPolicy(this.deps, tx, scope);
      const invitation = await tx.get<SurveyInvitation>("surveyInvitations", invitationId); invariant(invitation, "unavailable");
      tx.put("surveyInvitations", invitationId, { ...invitation, withdrawn: true });
      audit(tx, scope, "survey.invitation_withdrawn", invitationId, actor, key(this.deps, scope, invitationId, "withdrawn"));
    });
  }
  async closeRecovery(scope: FeedbackScope, actor: TrustedFeedbackActor, customerId: string, reason: string): Promise<void> {
    staff(actor, "surveys.manage"); id(customerId);
    invariant(typeof reason === "string" && reason.trim().length >= 3 && reason.length <= 500, "invalid-input");
    await this.deps.store.transaction(scope, async tx => {
      await mutationPolicy(this.deps, tx, scope);
      const treatmentId = key(this.deps, scope, "treatment", customerId);
      const treatment = await tx.get<{ recoveryOpen: boolean; updatedAt: number }>("feedbackTreatment", treatmentId);
      invariant(treatment, "unavailable"); if (!treatment.recoveryOpen) return;
      tx.put("feedbackTreatment", treatmentId, { ...treatment, recoveryOpen: false, updatedAt: this.deps.now() });
      // Reason is staff-supplied service context, not a raw survey answer.
      audit(tx, scope, "survey.recovery_closed", treatmentId, actor, key(this.deps, scope, treatmentId, String(treatment.updatedAt), "closed"), { reason });
    });
  }
  /** Called immediately before the existing D sender dispatches, never by a browser. */
  async prepareDelivery(scope: FeedbackScope, invitationId: string): Promise<{ customerId: string; title: string; token: string; versionId: string }> {
    id(invitationId);
    return this.deps.store.transaction(scope, async tx => {
      const policy = await mutationPolicy(this.deps, tx, scope, true); invariant(policy.outboundEnabled, "paused", "Outbound campaigns remain disabled.");
      const invitation = await tx.get<SurveyInvitation>("surveyInvitations", invitationId); invariant(invitation && !invitation.completed, "ineligible");
      const token = this.token(scope, invitation.id, invitation.keyId);
      const loaded = await this.load(tx, scope, token);
      const customer = await requireCustomer(this.deps, tx, scope, invitation.customerId); invariant(customer.feedbackAllowed, "ineligible");
      // D MUST also evaluate current channel/purpose consent, sender readiness and suppression at dispatch.
      return { customerId: invitation.customerId, title: loaded.version.value.title, token, versionId: loaded.version.id };
    });
  }
  async nps(scope: FeedbackScope, actor: TrustedFeedbackActor, versionId: string, fromDay: string, toDay: string) {
    staff(actor, "surveys.view"); id(versionId);
    const { version, policy } = await this.deps.store.transaction(scope, async tx => ({
      version: await tx.get<PublishedFeedbackVersion<SurveyDraft>>("surveyVersions", versionId), policy: await this.deps.policy(tx, scope) }));
    invariant(version, "unavailable");
    const rows: SurveyResponse[] = []; let cursor: string | null = null;
    do {
      const page: { rows: SurveyResponse[]; cursor: string | null } = await this.deps.store.page(scope, "surveyResponses", { equal: ["versionId", versionId], limit: 500, after: cursor ?? undefined });
      rows.push(...page.rows); cursor = page.cursor;
      invariant(rows.length <= 5000 && !(rows.length === 5000 && cursor), "unavailable", "Report exceeds the bounded R4 reporting limit; use the R5 reporting pipeline.");
    } while (cursor);
    return reportNps(version.value, version.id, rows, fromDay, toDay, policy.minimumAnonymousResponses);
  }
  async responses(scope: FeedbackScope, actor: TrustedFeedbackActor, versionId: string, after?: string) {
    staff(actor, "surveys.manage"); id(versionId);
    const version = await this.deps.store.transaction(scope, tx => tx.get<PublishedFeedbackVersion<SurveyDraft>>("surveyVersions", versionId));
    invariant(version?.value.privacy === "identified", "permission-denied", "Anonymous individual responses are not exposed to staff.");
    return this.deps.store.page<SurveyResponse>(scope, "surveyResponses", { equal: ["versionId", versionId], limit: 50, after });
  }
}
