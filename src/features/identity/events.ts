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
  signalId: string;
  eventType: IdentityLifecycleEventType;
  schemaVersion: 1;
  occurredAt: string;
  source: "browser";
  correlationId: string;
  identityId?: string;
  customerId?: string;
  leadId?: string;
  properties: Record<string, string | number | boolean | null>;
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
  subject: Pick<IdentityLifecycleSignal, "identityId" | "customerId" | "leadId"> = {},
  properties: IdentityLifecycleSignal["properties"] = {},
): IdentityLifecycleSignal {
  const signal: IdentityLifecycleSignal = {
    signalId: createId("signal"),
    eventType,
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    source: "browser",
    correlationId: correlationId(),
    ...subject,
    properties,
  };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<IdentityLifecycleSignal>(identityLifecycleSignalEvent, { detail: signal }));
  }
  return signal;
}
