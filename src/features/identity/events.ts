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
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<IdentityLifecycleSignal>(identityLifecycleSignalEvent, { detail: signal }));
  }
  return signal;
}
