import { createLifecycleEventSubmission } from "./core.js";
import type {
  AnalyticsDataMode,
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
  eventType: NurtureEventType,
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

interface LegacyPublicDetail extends Record<string, unknown> {
  name?: string;
  path?: string;
  destination?: string;
  organizationId?: string;
}

const legacyMap: Record<string, { eventType: NurtureEventType; ctaKind?: string }> = {
  public_page_view: { eventType: "public.page_viewed" },
  public_primary_cta_selected: { eventType: "public.cta_selected", ctaKind: "primary" },
  public_offer_handoff: { eventType: "public.cta_selected", ctaKind: "offer_handoff" },
  public_trial_entry_handoff: { eventType: "public.cta_selected", ctaKind: "trial_entry_handoff" },
  public_identity_handoff: { eventType: "public.cta_selected", ctaKind: "identity_handoff" },
};

let publicBridgeInstalled = false;
let lastCta: { destination?: string; at: number } | null = null;

export function installLegacyPublicAnalyticsBridge(): void {
  if (publicBridgeInstalled || typeof window === "undefined") return;
  publicBridgeInstalled = true;

  window.addEventListener("nurture:public-analytics", ((event: CustomEvent<LegacyPublicDetail>) => {
    const detail = event.detail ?? {};
    const mapped = detail.name ? legacyMap[detail.name] : undefined;
    if (!mapped) return;

    const destination = typeof detail.destination === "string" ? detail.destination : undefined;
    if (mapped.eventType === "public.cta_selected") {
      const now = Date.now();
      if (lastCta && lastCta.destination === destination && now - lastCta.at < 100) return;
      lastCta = { destination, at: now };
    }

    const payload: EventPayload = {};
    if (typeof detail.path === "string") payload.path = detail.path;
    if (destination) payload.destination = destination;
    if (mapped.ctaKind) payload.ctaKind = mapped.ctaKind;

    trackAnalyticsEvent(mapped.eventType, payload, {
      organizationIdHint: typeof detail.organizationId === "string" ? detail.organizationId : undefined,
    });
  }) as EventListener);
}
