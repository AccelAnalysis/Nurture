import type {
  CommunicationConsentFact,
  CommunicationChannel,
  CommunicationPurpose,
  ConsentState,
} from "../customer/contracts";
import type { ContactabilitySummary, LifecycleChannel, Release3ReasonCode } from "./contracts";

export interface LifecycleCustomerPreferences {
  organizationId: string;
  customerId: string;
  dataMode: "live" | "test" | "development";
  timezone?: string;
  quietHours?: { startLocal: string; endLocal: string };
  updatedAt: string;
  policyVersion: number;
}

export interface CustomerControlSnapshot {
  preferences: LifecycleCustomerPreferences;
  consents: CommunicationConsentFact[];
  cancellation: {
    status: "none" | "requested" | "scheduled" | "effective" | "completed";
    requestedAt?: string;
    effectiveAt?: string;
    accessEndsAt?: string;
  };
}

export interface CustomerControlPort {
  load(organizationId: string, customerId: string): Promise<CustomerControlSnapshot>;
  savePreferences(input: Pick<LifecycleCustomerPreferences, "organizationId" | "customerId" | "timezone" | "quietHours"> & { idempotencyKey: string }): Promise<LifecycleCustomerPreferences>;
  setConsent(input: {
    organizationId: string;
    customerId: string;
    channel: CommunicationChannel;
    purpose: CommunicationPurpose;
    decision: "granted" | "denied" | "withdrawn";
    policyVersion: string;
    idempotencyKey: string;
  }): Promise<void>;
  requestCancellation(input: { organizationId: string; customerId: string; idempotencyKey: string }): Promise<{ requestId: string; status: "requested" }>;
  loadSubscriptionManagementHandoff(input: { organizationId: string; customerId: string; returnPath: string }): Promise<{ href: string }>;
}

export function consentStateFor(
  facts: CommunicationConsentFact[],
  channel: CommunicationChannel,
  purpose: CommunicationPurpose,
): ConsentState {
  const candidates = facts
    .filter((fact) => fact.channel === channel && fact.purpose === purpose)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  return candidates[0]?.decision ?? "unknown";
}

export function evaluateContactability(input: {
  organizationId: string;
  customerId: string;
  channel: LifecycleChannel;
  purpose: "transactional" | "promotional";
  consentFacts: CommunicationConsentFact[];
  providerSuppressed?: boolean;
  channelReady?: boolean;
  timezone?: string;
  quietHours?: { startLocal: string; endLocal: string };
  checkedAt: string;
}): ContactabilitySummary {
  const reasons: Release3ReasonCode[] = [];
  const r2Channel: CommunicationChannel = input.channel === "email" ? "email" : "email";
  const r2Purpose: CommunicationPurpose = input.purpose === "promotional" ? "marketing" : "service";
  const consent = consentStateFor(input.consentFacts, r2Channel, r2Purpose);

  if (input.channel !== "email") reasons.push("channel-not-ready");
  if (input.channelReady === false) reasons.push("channel-not-ready");
  if (input.providerSuppressed) reasons.push("provider-suppressed");
  if (input.purpose === "promotional") {
    if (consent === "unknown") reasons.push("consent-missing");
    if (consent === "denied" || consent === "withdrawn") reasons.push("consent-withdrawn");
  }

  return {
    organizationId: input.organizationId,
    customerId: input.customerId,
    channel: input.channel,
    purpose: input.purpose,
    state: reasons.length === 0 ? "eligible" : "ineligible",
    ...(input.timezone ? { timezone: input.timezone } : {}),
    ...(input.quietHours ? { quietHours: input.quietHours } : {}),
    checkedAt: input.checkedAt,
    reasons: reasons.length ? [...new Set(reasons)] : ["allowed"],
  };
}

export function validTimeZone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validQuietHours(value: { startLocal: string; endLocal: string } | undefined): boolean {
  if (!value) return true;
  const localTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  return localTime.test(value.startLocal) && localTime.test(value.endLocal) && value.startLocal !== value.endLocal;
}
