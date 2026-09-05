import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import type {
  AuthoritativeCustomerDataMode,
  CaptureLeadCommand,
  CaptureLeadResult,
  CommunicationConsentFact,
  CompleteOnboardingStepCommand,
  EnsureOrganizationCustomerCommand,
  EnsureOrganizationCustomerResult,
  OnboardingStepMutationResult,
  OrganizationCustomerRelationship,
  SetConsentCommand,
  StartOnboardingCommand,
  StartOnboardingResult,
  UpdateOrganizationCustomerProfileCommand,
} from "../../../shared/customer/contracts.js";

function requireFunctions() {
  if (!functions) throw new Error("Customer services are unavailable because Firebase Functions is not configured.");
  return functions;
}

async function invoke<Input, Output>(name: string, input: Input): Promise<Output> {
  const callable = httpsCallable<Input, Output>(requireFunctions(), name);
  const result = await callable(input);
  return result.data;
}

export const customerFoundationClient = {
  captureLead(command: CaptureLeadCommand) {
    return invoke<CaptureLeadCommand, CaptureLeadResult>("r2CaptureLead", command);
  },
  ensureOrganizationCustomer(command: EnsureOrganizationCustomerCommand) {
    return invoke<EnsureOrganizationCustomerCommand, EnsureOrganizationCustomerResult>("r2EnsureOrganizationCustomer", command);
  },
  getOrganizationCustomer(input: { organizationId: string; customerId: string; dataMode: AuthoritativeCustomerDataMode }) {
    return invoke<typeof input, OrganizationCustomerRelationship>("r2GetOrganizationCustomer", input);
  },
  updateOrganizationCustomerProfile(command: UpdateOrganizationCustomerProfileCommand) {
    return invoke<UpdateOrganizationCustomerProfileCommand, OrganizationCustomerRelationship>("r2UpdateOrganizationCustomerProfile", command);
  },
  setConsent(command: SetConsentCommand) {
    return invoke<SetConsentCommand, CommunicationConsentFact>("r2SetCustomerConsent", command);
  },
  getConsents(input: { organizationId: string; customerId: string; dataMode: AuthoritativeCustomerDataMode }) {
    return invoke<typeof input, CommunicationConsentFact[]>("r2GetCustomerConsents", input);
  },
  startOnboarding(command: StartOnboardingCommand) {
    return invoke<StartOnboardingCommand, StartOnboardingResult>("r2StartOnboarding", command);
  },
  completeOnboardingStep(command: CompleteOnboardingStepCommand) {
    return invoke<CompleteOnboardingStepCommand, OnboardingStepMutationResult>("r2CompleteOnboardingStep", command);
  },
};

export function createCommandId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new Error("Secure browser randomness is required for customer commands.");
  return `${prefix}:${id}`;
}

export function createLeadLinkProof(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new Error("Secure browser randomness is required for lead capture.");
  const bytes = new Uint8Array(32);
  cryptoApi.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
