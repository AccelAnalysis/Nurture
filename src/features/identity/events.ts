export const identityLifecycleSignalEvent = "nurture:lifecycle-signal";

export type IdentityLifecycleEventType =
  | "lead.created"
  | "registration.started"
  | "registration.completed"
  | "identity.verified"
  | "onboarding.started"
  | "onboarding.step_completed"
  | "onboarding.completed";

export interface IdentityLifecycleSignal {
  eventId: string;
  eventType: IdentityLifecycleEventType;
  schemaVersion: 1;
  occurredAt: string;
  transport: "browser";
  trust: "client-observed";
  correlationId: string;
  idempotencyKey: string;
  identityIdHint?: string;
  customerIdHint?: string;
  leadIdHint?: string;
  payload: Record<string, string | number | boolean | null>;
}

export interface IdentityLifecycleSink {
  submit(signal: IdentityLifecycleSignal): void | Promise<void>;
}

export interface IdentityAnalyticsTrackerOptions {
  eventId: string;
  occurredAt: string;
  correlationId: string;
  idempotencyKey: string;
  identityIdHint?: string;
  customerIdHint?: string;
  subjectHint?: { kind: "lead" | "identity" | "customer"; id: string };
}

export type IdentityAnalyticsTracker = (
  eventType: IdentityLifecycleEventType,
  payload: IdentityLifecycleSignal["payload"],
  options: IdentityAnalyticsTrackerOptions,
) => unknown;

const CORRELATION_KEY = "nurture-lifecycle-correlation";

function createId(prefix: string) {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${value}`;
}

function correlationId() {
  if (typeof window === "undefined") return createId("corr");
  const existing = window.sessionStorage.getItem(CORRELATION_KEY);
  if (existing) return existing;
  const value = createId("corr");
  window.sessionStorage.setItem(CORRELATION_KEY, value);
  return value;
}

const browserCompatibilitySink: IdentityLifecycleSink = {
  submit(signal) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<IdentityLifecycleSignal>(identityLifecycleSignalEvent, { detail: signal }));
  },
};

let lifecycleSink: IdentityLifecycleSink = browserCompatibilitySink;

/**
 * Composition hook for Track F. Until Track F is composed directly, the
 * existing browser custom event remains the safe compatibility transport.
 */
export function setIdentityLifecycleSink(next: IdentityLifecycleSink) {
  const previous = lifecycleSink;
  lifecycleSink = next;
  return () => {
    if (lifecycleSink === next) lifecycleSink = previous;
  };
}

/**
 * Structural adapter for Track F's `trackAnalyticsEvent` function. This keeps
 * Track C independent of Track F's implementation branch while preserving the
 * final Release 1 submission identifiers and untrusted subject hints.
 */
export function createIdentityAnalyticsSink(track: IdentityAnalyticsTracker): IdentityLifecycleSink {
  return {
    submit(signal) {
      const subjectHint = signal.customerIdHint
        ? { kind: "customer" as const, id: signal.customerIdHint }
        : signal.identityIdHint
          ? { kind: "identity" as const, id: signal.identityIdHint }
          : signal.leadIdHint
            ? { kind: "lead" as const, id: signal.leadIdHint }
            : undefined;
      track(signal.eventType, signal.payload, {
        eventId: signal.eventId,
        occurredAt: signal.occurredAt,
        correlationId: signal.correlationId,
        idempotencyKey: signal.idempotencyKey,
        ...(signal.identityIdHint ? { identityIdHint: signal.identityIdHint } : {}),
        ...(signal.customerIdHint ? { customerIdHint: signal.customerIdHint } : {}),
        ...(subjectHint ? { subjectHint } : {}),
      });
    },
  };
}

export function emitIdentityLifecycleSignal(
  eventType: IdentityLifecycleEventType,
  subject: { identityId?: string; customerId?: string; leadId?: string } = {},
  payload: IdentityLifecycleSignal["payload"] = {},
): IdentityLifecycleSignal {
  const eventId = createId("event");
  const signal: IdentityLifecycleSignal = {
    eventId,
    eventType,
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    transport: "browser",
    trust: "client-observed",
    correlationId: correlationId(),
    idempotencyKey: eventId,
    ...(subject.identityId ? { identityIdHint: subject.identityId } : {}),
    ...(subject.customerId ? { customerIdHint: subject.customerId } : {}),
    ...(subject.leadId ? { leadIdHint: subject.leadId } : {}),
    payload,
  };

  try {
    const result = lifecycleSink.submit(signal);
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // Instrumentation must not block registration/onboarding completion.
  }

  return signal;
}
