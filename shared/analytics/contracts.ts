export const ANALYTICS_SCHEMA_VERSION = 1 as const;
export const MAX_EVENT_PAYLOAD_BYTES = 16_384;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type EventPayload = Record<string, JsonValue>;

export type LifecycleEventSource =
  | "browser"
  | "domain_action"
  | "provider_webhook"
  | "trusted_server"
  | "scheduler"
  | "administrator";

export type AnalyticsDataMode = "live" | "test" | "preview" | "demo" | "development";

export type LifecycleSubjectKind =
  | "visitor"
  | "lead"
  | "identity"
  | "customer"
  | "organization"
  | "offer"
  | "subscription"
  | "experience"
  | "configuration";

export const EVENT_CATALOG = {
  "public.page_viewed": { owner: "A", allowedSources: ["browser"] as const, family: "public" },
  "public.cta_selected": { owner: "A", allowedSources: ["browser"] as const, family: "public" },
  "visitor.identified": { owner: "C", allowedSources: ["domain_action", "trusted_server"] as const, family: "identity" },
  "lead.created": { owner: "C", allowedSources: ["domain_action", "trusted_server"] as const, family: "identity" },
  "registration.started": { owner: "C", allowedSources: ["browser", "domain_action"] as const, family: "identity" },
  "registration.completed": { owner: "C", allowedSources: ["domain_action", "trusted_server"] as const, family: "identity" },
  "identity.verified": { owner: "C", allowedSources: ["domain_action", "trusted_server"] as const, family: "identity" },
  "trial.started": { owner: "B", allowedSources: ["domain_action", "trusted_server"] as const, family: "experience" },
  "offer.viewed": { owner: "D", allowedSources: ["browser", "domain_action"] as const, family: "offers" },
  "checkout.started": { owner: "D", allowedSources: ["browser", "domain_action"] as const, family: "commerce" },
  "checkout.abandoned": { owner: "D", allowedSources: ["scheduler", "trusted_server"] as const, family: "commerce" },
  "checkout.completed": { owner: "D", allowedSources: ["provider_webhook", "trusted_server"] as const, family: "commerce" },
  "subscription.started": { owner: "D", allowedSources: ["provider_webhook", "trusted_server"] as const, family: "commerce" },
  "subscription.updated": { owner: "D", allowedSources: ["provider_webhook", "trusted_server"] as const, family: "commerce" },
  "subscription.renewed": { owner: "D", allowedSources: ["provider_webhook", "trusted_server"] as const, family: "commerce" },
  "subscription.cancelled": { owner: "D", allowedSources: ["provider_webhook", "trusted_server"] as const, family: "commerce" },
  "onboarding.started": { owner: "C", allowedSources: ["domain_action", "trusted_server"] as const, family: "onboarding" },
  "onboarding.step_completed": { owner: "C", allowedSources: ["domain_action", "trusted_server"] as const, family: "onboarding" },
  "onboarding.completed": { owner: "C", allowedSources: ["domain_action", "trusted_server"] as const, family: "onboarding" },
  "experience.started": { owner: "B", allowedSources: ["browser", "domain_action", "trusted_server"] as const, family: "experience" },
  "experience.milestone_reached": { owner: "B", allowedSources: ["domain_action", "trusted_server"] as const, family: "experience" },
  "experience.premium_feature_requested": { owner: "B", allowedSources: ["browser", "domain_action", "trusted_server"] as const, family: "experience" },
  "experience.inactive": { owner: "B", allowedSources: ["scheduler", "trusted_server"] as const, family: "experience" },
  "communication.provider_accepted": { owner: "D", allowedSources: ["trusted_server"] as const, family: "communications" },
  "communication.delivered": { owner: "D", allowedSources: ["provider_webhook", "trusted_server"] as const, family: "communications" },
  "communication.bounced": { owner: "D", allowedSources: ["provider_webhook", "trusted_server"] as const, family: "communications" },
  "communication.dropped": { owner: "D", allowedSources: ["provider_webhook", "trusted_server"] as const, family: "communications" },
  "communication.complained": { owner: "D", allowedSources: ["provider_webhook", "trusted_server"] as const, family: "communications" },
  "communication.unsubscribed": { owner: "D", allowedSources: ["provider_webhook", "domain_action", "trusted_server"] as const, family: "communications" },
  "communication.suppressed": { owner: "D", allowedSources: ["trusted_server"] as const, family: "communications" },
  "communication.failed": { owner: "D", allowedSources: ["provider_webhook", "trusted_server"] as const, family: "communications" },
  "communication.outcome_unknown": { owner: "D", allowedSources: ["trusted_server"] as const, family: "communications" },
  "survey.completed": { owner: "future", allowedSources: ["domain_action", "trusted_server"] as const, family: "satisfaction" },
  "referral.created": { owner: "future", allowedSources: ["domain_action", "trusted_server"] as const, family: "referral" },
  "configuration.published": { owner: "A", allowedSources: ["administrator", "trusted_server"] as const, family: "publishing" },
} as const;

export type NurtureEventType = keyof typeof EVENT_CATALOG;
/** Registered module events are namespaced under experience.<module>.<event>. */
export type ExperienceModuleEventType = `experience.${string}.${string}`;
export type AnalyticsEventType = NurtureEventType | ExperienceModuleEventType;
export type AnalyticsFamily = (typeof EVENT_CATALOG)[NurtureEventType]["family"] | "experience-module";

export interface LifecycleSubject { kind: LifecycleSubjectKind; id: string; }

export interface LifecycleEventSubmission {
  eventId: string;
  eventType: AnalyticsEventType;
  schemaVersion: typeof ANALYTICS_SCHEMA_VERSION;
  occurredAt: string;
  sessionId?: string;
  correlationId: string;
  idempotencyKey: string;
  dataMode: AnalyticsDataMode;
  organizationIdHint?: string;
  identityIdHint?: string;
  customerIdHint?: string;
  subjectHint?: LifecycleSubject;
  experienceId?: string;
  experienceModuleId?: string;
  experienceModuleVersion?: string;
  offerId?: string;
  payload: EventPayload;
}

export interface LifecycleEventEnvelope {
  eventId: string;
  eventType: AnalyticsEventType;
  schemaVersion: typeof ANALYTICS_SCHEMA_VERSION;
  organizationId: string;
  subjectId?: string;
  subjectKind?: LifecycleSubjectKind;
  identityId?: string;
  customerId?: string;
  experienceId?: string;
  experienceModuleId?: string;
  experienceModuleVersion?: string;
  offerId?: string;
  sessionId?: string;
  occurredAt: string;
  receivedAt: string;
  source: LifecycleEventSource;
  correlationId: string;
  idempotencyKey: string;
  dataMode: AnalyticsDataMode;
  payload: EventPayload;
}

export interface CreateSubmissionOptions {
  eventId?: string;
  occurredAt?: string;
  sessionId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  dataMode?: AnalyticsDataMode;
  organizationIdHint?: string;
  identityIdHint?: string;
  customerIdHint?: string;
  subjectHint?: LifecycleSubject;
  experienceId?: string;
  experienceModuleId?: string;
  experienceModuleVersion?: string;
  offerId?: string;
}

export interface TrustedEventBinding {
  organizationId: string;
  source: LifecycleEventSource;
  receivedAt?: string;
  subject?: LifecycleSubject;
  identityId?: string;
  customerId?: string;
  experienceId?: string;
  experienceModuleId?: string;
  experienceModuleVersion?: string;
  offerId?: string;
  dataMode?: AnalyticsDataMode;
}
