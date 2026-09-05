import {
  createLifecycleEventSubmission,
  isAnalyticsEventType,
  validateEventPayload,
} from "./core.js";
import type {
  AnalyticsDataMode,
  AnalyticsEventType,
  CreateSubmissionOptions,
  EventPayload,
  LifecycleEventSubmission,
  NurtureEventType,
} from "./contracts.js";

export const ANALYTICS_SUBMISSION_EVENT = "nurture:analytics-submission";
export const ANALYTICS_ERROR_EVENT = "nurture:analytics-error";
const SESSION_KEY = "nurture:analytics:session-id";
const DEBUG_BUFFER_KEY = "nurture:analytics:debug-buffer";
const DEBUG_BUFFER_LIMIT = 200;

export interface AnalyticsSubmissionSink {
  submit(submission: LifecycleEventSubmission): void | Promise<void>;
}

function inferDataMode(): AnalyticsDataMode {
  if (import.meta.env.DEV) return "development";
  return "live";
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readSessionId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = randomId();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return undefined;
  }
}

function writeDebugBuffer(submission: LifecycleEventSubmission): void {
  if (typeof window === "undefined" || submission.dataMode === "live") return;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(DEBUG_BUFFER_KEY) ?? "[]") as unknown;
    const buffer = Array.isArray(parsed) ? parsed : [];
    buffer.push(submission);
    window.sessionStorage.setItem(DEBUG_BUFFER_KEY, JSON.stringify(buffer.slice(-DEBUG_BUFFER_LIMIT)));
  } catch {
    // Debug buffering is deliberately best-effort and never blocks product behavior.
  }
}

const browserDispatchSink: AnalyticsSubmissionSink = {
  submit(submission) {
    writeDebugBuffer(submission);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ANALYTICS_SUBMISSION_EVENT, { detail: submission }));
    }
  },
};

let sink: AnalyticsSubmissionSink = browserDispatchSink;

export function setAnalyticsSubmissionSink(next: AnalyticsSubmissionSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    if (sink === next) sink = previous;
  };
}

export function trackAnalyticsEvent(
  eventType: AnalyticsEventType,
  payload: EventPayload = {},
  options: CreateSubmissionOptions = {},
): LifecycleEventSubmission {
  const sessionId = options.sessionId ?? readSessionId();
  const submission = createLifecycleEventSubmission(eventType, payload, {
    ...options,
    sessionId,
    dataMode: options.dataMode ?? inferDataMode(),
  }, { id: randomId });

  try {
    const result = sink.submit(submission);
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch((error: unknown) => dispatchAnalyticsError(error, submission));
    }
  } catch (error) {
    dispatchAnalyticsError(error, submission);
  }

  return submission;
}

function dispatchAnalyticsError(error: unknown, submission: LifecycleEventSubmission): void {
  if (typeof window === "undefined") return;
  const message = error instanceof Error ? error.message : "Unknown analytics submission error.";
  window.dispatchEvent(new CustomEvent(ANALYTICS_ERROR_EVENT, {
    detail: { eventId: submission.eventId, eventType: submission.eventType, message },
  }));
}

export function readAnalyticsDebugBuffer(): LifecycleEventSubmission[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(DEBUG_BUFFER_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed as LifecycleEventSubmission[] : [];
  } catch {
    return [];
  }
}

export function clearAnalyticsDebugBuffer(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DEBUG_BUFFER_KEY);
  } catch {
    // Best-effort development helper.
  }
}

function safePayload(value: unknown): EventPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    return validateEventPayload(value as EventPayload);
  } catch {
    return {};
  }
}

interface PublicCompatibilityDetail extends Record<string, unknown> {
  eventId?: string;
  eventType?: string;
  name?: string;
  occurredAt?: string;
  path?: string;
  destination?: string;
  organizationId?: string;
  properties?: unknown;
}

const publicCompatibilityMap: Record<string, { eventType: NurtureEventType; ctaKind?: string }> = {
  public_page_view: { eventType: "public.page_viewed" },
  public_primary_cta_selected: { eventType: "public.cta_selected", ctaKind: "primary" },
  public_offer_handoff: { eventType: "public.cta_selected", ctaKind: "offer_handoff" },
  public_trial_entry_handoff: { eventType: "public.cta_selected", ctaKind: "trial_entry_handoff" },
  public_identity_handoff: { eventType: "public.cta_selected", ctaKind: "identity_handoff" },
  "public.page_viewed": { eventType: "public.page_viewed" },
  "public.cta_selected": { eventType: "public.cta_selected", ctaKind: "primary" },
  "public.offer_handoff": { eventType: "public.cta_selected", ctaKind: "offer_handoff" },
  "public.trial_entry_handoff": { eventType: "public.cta_selected", ctaKind: "trial_entry_handoff" },
  "public.identity_handoff": { eventType: "public.cta_selected", ctaKind: "identity_handoff" },
};

let publicBridgeInstalled = false;
let experienceBridgeInstalled = false;
let identityBridgeInstalled = false;
let lastCta: { destination?: string; at: number } | null = null;

export function installPublicAnalyticsCompatibilityBridge(): void {
  if (publicBridgeInstalled || typeof window === "undefined") return;
  publicBridgeInstalled = true;

  window.addEventListener("nurture:public-analytics", ((event: CustomEvent<PublicCompatibilityDetail>) => {
    const detail = event.detail ?? {};
    const rawName = typeof detail.eventType === "string" ? detail.eventType : detail.name;
    const mapped = rawName ? publicCompatibilityMap[rawName] : undefined;
    if (!mapped) return;

    const nested = safePayload(detail.properties);
    const nestedDestination = typeof nested.destination === "string" ? nested.destination : undefined;
    const destination = typeof detail.destination === "string" ? detail.destination : nestedDestination;
    if (mapped.eventType === "public.cta_selected") {
      const now = Date.now();
      if (lastCta && lastCta.destination === destination && now - lastCta.at < 100) return;
      lastCta = { destination, at: now };
    }

    const payload: EventPayload = { ...nested };
    if (typeof detail.path === "string") payload.path = detail.path;
    if (destination) payload.destination = destination;
    if (mapped.ctaKind) payload.ctaKind = mapped.ctaKind;

    trackAnalyticsEvent(mapped.eventType, payload, {
      eventId: typeof detail.eventId === "string" ? detail.eventId : undefined,
      occurredAt: typeof detail.occurredAt === "string" ? detail.occurredAt : undefined,
      organizationIdHint: typeof detail.organizationId === "string" ? detail.organizationId : undefined,
    });
  }) as EventListener);
}

interface ExperienceCompatibilityDetail extends Record<string, unknown> {
  eventId?: string;
  eventType?: string;
  occurredAt?: string;
  organizationId?: string;
  identityId?: string;
  customerId?: string;
  experienceId?: string;
  moduleId?: string;
  moduleVersion?: string;
  idempotencyKey?: string;
  properties?: unknown;
}

/**
 * Track B deliberately owns an injected Experience event sink. Until the tracks
 * are composed directly, this bridge consumes its browser-observed event hook
 * and converts it into the Track F submission contract without trusting its
 * tenant/customer hints as authoritative.
 */
export function installExperienceAnalyticsCompatibilityBridge(): void {
  if (experienceBridgeInstalled || typeof window === "undefined") return;
  experienceBridgeInstalled = true;

  window.addEventListener("nurture:experience-event", ((event: CustomEvent<ExperienceCompatibilityDetail>) => {
    const detail = event.detail ?? {};
    if (!isAnalyticsEventType(detail.eventType)) return;

    const customerIdHint = typeof detail.customerId === "string" ? detail.customerId : undefined;
    const identityIdHint = typeof detail.identityId === "string" ? detail.identityId : undefined;
    const subjectHint = customerIdHint
      ? { kind: "customer" as const, id: customerIdHint }
      : identityIdHint
        ? { kind: "identity" as const, id: identityIdHint }
        : undefined;

    trackAnalyticsEvent(detail.eventType, safePayload(detail.properties), {
      eventId: typeof detail.eventId === "string" ? detail.eventId : undefined,
      occurredAt: typeof detail.occurredAt === "string" ? detail.occurredAt : undefined,
      idempotencyKey: typeof detail.idempotencyKey === "string" ? detail.idempotencyKey : undefined,
      organizationIdHint: typeof detail.organizationId === "string" ? detail.organizationId : undefined,
      identityIdHint,
      customerIdHint,
      subjectHint,
      experienceId: typeof detail.experienceId === "string" ? detail.experienceId : undefined,
      experienceModuleId: typeof detail.moduleId === "string" ? detail.moduleId : undefined,
      experienceModuleVersion: typeof detail.moduleVersion === "string" ? detail.moduleVersion : undefined,
    });
  }) as EventListener);
}

interface IdentityLifecycleCompatibilityDetail extends Record<string, unknown> {
  eventId?: string;
  eventType?: string;
  schemaVersion?: number;
  occurredAt?: string;
  correlationId?: string;
  idempotencyKey?: string;
  identityIdHint?: string;
  customerIdHint?: string;
  leadIdHint?: string;
  payload?: unknown;
}

const IDENTITY_LIFECYCLE_TYPES = new Set<NurtureEventType>([
  "lead.created",
  "registration.started",
  "registration.completed",
  "identity.verified",
  "onboarding.started",
  "onboarding.step_completed",
  "onboarding.completed",
]);

/**
 * Track C emits client-observed lifecycle signals after its owning action
 * succeeds. This bridge preserves its IDs/hints while keeping source/tenant
 * authority out of the browser contract; Track E must verify and bind those at
 * trusted ingestion before persistence.
 */
export function installIdentityLifecycleCompatibilityBridge(): void {
  if (identityBridgeInstalled || typeof window === "undefined") return;
  identityBridgeInstalled = true;

  window.addEventListener("nurture:lifecycle-signal", ((event: CustomEvent<IdentityLifecycleCompatibilityDetail>) => {
    const detail = event.detail ?? {};
    if (detail.schemaVersion !== 1 || typeof detail.eventType !== "string") return;
    if (!IDENTITY_LIFECYCLE_TYPES.has(detail.eventType as NurtureEventType)) return;

    const eventType = detail.eventType as NurtureEventType;
    const identityIdHint = typeof detail.identityIdHint === "string" ? detail.identityIdHint : undefined;
    const customerIdHint = typeof detail.customerIdHint === "string" ? detail.customerIdHint : undefined;
    const leadIdHint = typeof detail.leadIdHint === "string" ? detail.leadIdHint : undefined;
    const subjectHint = customerIdHint
      ? { kind: "customer" as const, id: customerIdHint }
      : identityIdHint
        ? { kind: "identity" as const, id: identityIdHint }
        : leadIdHint
          ? { kind: "lead" as const, id: leadIdHint }
          : undefined;

    trackAnalyticsEvent(eventType, safePayload(detail.payload), {
      eventId: typeof detail.eventId === "string" ? detail.eventId : undefined,
      occurredAt: typeof detail.occurredAt === "string" ? detail.occurredAt : undefined,
      correlationId: typeof detail.correlationId === "string" ? detail.correlationId : undefined,
      idempotencyKey: typeof detail.idempotencyKey === "string" ? detail.idempotencyKey : undefined,
      identityIdHint,
      customerIdHint,
      subjectHint,
    });
  }) as EventListener);
}

export function installAnalyticsCompatibilityBridges(): void {
  installPublicAnalyticsCompatibilityBridge();
  installExperienceAnalyticsCompatibilityBridge();
  installIdentityLifecycleCompatibilityBridge();
}

/** @deprecated Use installPublicAnalyticsCompatibilityBridge. */
export const installLegacyPublicAnalyticsBridge = installPublicAnalyticsCompatibilityBridge;
