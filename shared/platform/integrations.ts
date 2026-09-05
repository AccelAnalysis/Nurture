export type IntegrationKind = "payments" | "email" | "sms" | "media" | "events" | "authentication";

export type IntegrationErrorCode =
  | "not-configured"
  | "invalid-request"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "rate-limited"
  | "timeout"
  | "provider-rejected"
  | "unavailable"
  | "unknown";

export interface IntegrationRequestContext {
  /** Requested organization scope. Trusted code must independently verify it. */
  organizationId?: string;
  correlationId: string;
  /** Required for financial, communication, reward, or repeat-sensitive work. */
  idempotencyKey?: string;
  timeoutMs?: number;
}

export interface IntegrationMeta {
  integration: IntegrationKind;
  provider?: string;
  correlationId: string;
  providerRequestId?: string;
  attempts?: number;
}

export interface IntegrationError {
  code: IntegrationErrorCode;
  message: string;
  retryable: boolean;
  providerCode?: string;
  retryAfterMs?: number;
  safeDetails?: Record<string, string | number | boolean | null>;
}

export type IntegrationResult<T> =
  | { ok: true; value: T; meta: IntegrationMeta }
  | { ok: false; error: IntegrationError; meta: IntegrationMeta };

export interface IntegrationHealth {
  integration: IntegrationKind;
  provider?: string;
  status: "ready" | "degraded" | "unavailable" | "not-configured";
  checkedAt: string;
  message?: string;
}

export interface CheckoutSessionRequest {
  organizationId: string;
  customerId: string;
  offerId: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  redirectUrl: string;
  expiresAt?: string;
}

export interface BillingPortalRequest {
  organizationId: string;
  customerId: string;
  returnUrl: string;
}

export interface BillingPortalResult {
  redirectUrl: string;
}

/** Track D implements this port with Stripe test mode first. */
export interface PaymentIntegrationPort {
  createCheckoutSession(
    request: CheckoutSessionRequest,
    context: IntegrationRequestContext,
  ): Promise<IntegrationResult<CheckoutSessionResult>>;
  createBillingPortal(
    request: BillingPortalRequest,
    context: IntegrationRequestContext,
  ): Promise<IntegrationResult<BillingPortalResult>>;
  health(): Promise<IntegrationHealth>;
}

export interface EmailSendRequest {
  organizationId: string;
  to: string;
  purpose: "transactional" | "marketing";
  templateId?: string;
  subject?: string;
  variables?: Record<string, string>;
}

export interface SmsSendRequest {
  organizationId: string;
  to: string;
  purpose: "transactional" | "marketing";
  templateId?: string;
  body?: string;
  variables?: Record<string, string>;
}

export interface MessageSendResult {
  messageId: string;
  acceptedAt: string;
}

export interface EmailIntegrationPort {
  send(request: EmailSendRequest, context: IntegrationRequestContext): Promise<IntegrationResult<MessageSendResult>>;
  health(): Promise<IntegrationHealth>;
}

export interface SmsIntegrationPort {
  send(request: SmsSendRequest, context: IntegrationRequestContext): Promise<IntegrationResult<MessageSendResult>>;
  health(): Promise<IntegrationHealth>;
}

export interface MediaUploadIntentRequest {
  organizationId: string;
  purpose: "brand" | "experience" | "communication" | "attachment";
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface MediaUploadIntentResult {
  assetId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface MediaDeleteRequest {
  organizationId: string;
  assetId: string;
}

export interface MediaIntegrationPort {
  createUploadIntent(
    request: MediaUploadIntentRequest,
    context: IntegrationRequestContext,
  ): Promise<IntegrationResult<MediaUploadIntentResult>>;
  delete(request: MediaDeleteRequest, context: IntegrationRequestContext): Promise<IntegrationResult<void>>;
  health(): Promise<IntegrationHealth>;
}

/** Track F supplies the concrete event envelope; Track E owns the provider port. */
export interface EventIntegrationPort<TEvent> {
  publish(event: TEvent, context: IntegrationRequestContext): Promise<IntegrationResult<void>>;
  publishBatch(events: readonly TEvent[], context: IntegrationRequestContext): Promise<IntegrationResult<void>>;
  health(): Promise<IntegrationHealth>;
}

export interface AuthenticationIntegrationPort<TPrincipal> {
  verifyIdToken(idToken: string, context: IntegrationRequestContext): Promise<IntegrationResult<TPrincipal>>;
  health(): Promise<IntegrationHealth>;
}

export interface NurtureIntegrationPorts<TEvent = unknown, TPrincipal = unknown> {
  payments: PaymentIntegrationPort;
  email: EmailIntegrationPort;
  sms: SmsIntegrationPort;
  media: MediaIntegrationPort;
  events: EventIntegrationPort<TEvent>;
  authentication: AuthenticationIntegrationPort<TPrincipal>;
}

export function integrationSuccess<T>(value: T, meta: IntegrationMeta): IntegrationResult<T> {
  return { ok: true, value, meta };
}

export function integrationFailure<T = never>(error: IntegrationError, meta: IntegrationMeta): IntegrationResult<T> {
  return { ok: false, error, meta };
}
