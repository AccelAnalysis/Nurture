/** Server-only contracts. These are NOT deployed Cloud Functions or credential placeholders. */
export type ServerPermission =
  | 'members:manage'
  | 'people:manage'
  | 'outreach:manage'
  | 'surveys:manage'
  | 'offers:manage'
  | 'organization:manage'
  | 'billing:manage';
export interface VerifiedContext {
  /** Derived from a verified Firebase ID token, never from request JSON. */
  uid: string;
  email: string;
  emailVerified: true;
  organizationId: string;
  permissions: readonly ServerPermission[];
  appCheckVerified: boolean;
}
export interface InvitationRequest {
  email: string;
  role: 'administrator' | 'manager' | 'member';
  idempotencyKey: string;
}
export interface InvitationPort {
  create(
    context: VerifiedContext,
    request: InvitationRequest,
  ): Promise<{ invitationId: string; status: 'pending' }>;
  /** Verify token hash, expiry, verified recipient email, revocation, and replay in one transaction. */
  accept(
    context: Pick<VerifiedContext, 'uid' | 'email' | 'emailVerified'>,
    opaqueToken: string,
  ): Promise<{ organizationId: string; membershipId: string }>;
}
export interface MessageRequest {
  organizationId: string;
  contactId: string;
  templateId: string;
  templateVersion: number;
  channel: 'email' | 'sms';
  purpose: 'service' | 'marketing';
  idempotencyKey: string;
}
export interface CommunicationPort {
  /** Re-check consent, suppression, tenant ownership, sender identity, quiet hours and caps at send time. */
  send(request: MessageRequest): Promise<{ providerMessageId: string; status: 'accepted' }>;
}
export interface BillingPort {
  /** Validate a server-selected test-mode price and use an allowlisted return URL. */
  createTestCheckout(
    context: VerifiedContext,
    offerId: string,
    idempotencyKey: string,
  ): Promise<{ url: string }>;
  openPortal(context: VerifiedContext): Promise<{ url: string }>;
  /** Verify the Stripe signature against the raw body before deduplicated subscription/entitlement updates. */
  handleVerifiedWebhook(eventId: string, event: unknown): Promise<void>;
}
export interface SequenceSchedulerPort {
  enroll(context: VerifiedContext, contactId: string, sequenceId: string, eventId: string): Promise<void>;
  /** Cloud Tasks / scheduled-function adapter; never driven by browser timers. */
  dispatchDue(now: Date): Promise<{ evaluated: number; queued: number; suppressed: number }>;
  stop(organizationId: string, contactId: string, reason: 'optOut' | 'converted' | 'deleted'): Promise<void>;
}
export interface AttributionPort {
  /** Resolve code ownership server-side; reject self-referrals, expiry, duplicates and forged org/user IDs. */
  claim(
    uid: string,
    code: string,
    source: string,
    campaign: string,
  ): Promise<{ status: 'verified' | 'rejected' }>;
  convert(verifiedEventId: string): Promise<void>;
}
export interface SurveySubmissionPort {
  /** Resolve tenant and version from the published survey, validate answers, rate-limit, and never trust client contactId. */
  submit(publicSurveyId: string, answers: unknown, appCheckToken: string): Promise<{ responseId: string }>;
}
export interface FeedbackUploadPort {
  /** Validate user/tenant, allowlisted MIME, actual file bytes, 5 MB cap and private object ownership. */
  createUpload(context: VerifiedContext, mime: string, bytes: number): Promise<{ storagePath: string }>;
}
