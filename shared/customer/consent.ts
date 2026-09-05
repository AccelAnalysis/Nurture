import type {
  AuthoritativeCustomerDataMode,
  CommunicationConsentFact,
  CommunicationChannel,
  CommunicationPurpose,
  ConsentState,
} from "./contracts";

function safePart(value: string) {
  return encodeURIComponent(value.trim());
}

export function consentFactId(input: {
  dataMode: AuthoritativeCustomerDataMode;
  subjectKind: "lead" | "customer";
  subjectId: string;
  channel: CommunicationChannel;
  purpose: CommunicationPurpose;
}) {
  return [input.dataMode, input.subjectKind, input.subjectId, input.channel, input.purpose].map(safePart).join("~");
}

/** Missing consent is deliberately unknown; it is never silently upgraded to permission. */
export function consentState(fact: CommunicationConsentFact | null | undefined): ConsentState {
  return fact?.decision ?? "unknown";
}

export function consentPermits(fact: CommunicationConsentFact | null | undefined): boolean {
  return consentState(fact) === "granted";
}

export function isCurrentConsentFact(
  fact: CommunicationConsentFact,
  input: { organizationId: string; dataMode: AuthoritativeCustomerDataMode; subjectKind: "lead" | "customer"; subjectId: string; channel: CommunicationChannel; purpose: CommunicationPurpose },
) {
  return fact.organizationId === input.organizationId
    && fact.dataMode === input.dataMode
    && fact.subjectKind === input.subjectKind
    && fact.subjectId === input.subjectId
    && fact.channel === input.channel
    && fact.purpose === input.purpose;
}
