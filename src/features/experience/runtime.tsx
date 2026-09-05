import { createContext, useContext, useMemo, type ReactNode } from "react";
import type {
  EntitlementSnapshotResult,
  ExperienceCustomerRequest,
  ExperienceCustomerResult,
  ExperienceCustomerSource,
  ExperienceDefinitionSource,
  ExperienceEntitlementRequest,
  ExperienceEntitlementSource,
  ExperienceEventSink,
  ExperienceLifecycleEvent,
  ExperienceOnboardingBridge,
  ExperienceOnboardingResult,
  ExperienceRecoverableErrorReporter,
} from "./contracts";

const unavailableCustomerSource: ExperienceCustomerSource = {
  async resolveCustomer(_request: ExperienceCustomerRequest): Promise<ExperienceCustomerResult> {
    return {
      status: "unavailable",
      reason: "Customer/profile resolution has not been connected by the identity/customer owner.",
    };
  },
};

const unavailableEntitlementSource: ExperienceEntitlementSource = {
  async loadPresentationSnapshot(_request: ExperienceEntitlementRequest): Promise<EntitlementSnapshotResult> {
    return {
      status: "unavailable",
      reason: "Trusted entitlement delivery has not been connected at the application composition boundary.",
    };
  },
};

const browserEventSink: ExperienceEventSink = {
  submit(event: ExperienceLifecycleEvent) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("nurture:experience-event", { detail: event }));
  },
};

const unavailableOnboardingBridge: ExperienceOnboardingBridge = {
  async completeStep(): Promise<ExperienceOnboardingResult> {
    return {
      status: "unavailable",
      reason: "The host onboarding completion bridge has not been connected by the onboarding owner.",
    };
  },
};

const browserRecoverableErrorReporter: ExperienceRecoverableErrorReporter = {
  report(input) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("nurture:experience-recoverable-error", { detail: input }));
  },
};

export interface ExperienceRuntimeValue {
  /** Optional Track A source. When absent, the trusted registry default is used. */
  definitionSource?: ExperienceDefinitionSource;
  /** Track C source. Default does not infer Customer from Firebase identity. */
  customerSource: ExperienceCustomerSource;
  /** Tracks D/E source. Default denies protected access. */
  entitlementSource: ExperienceEntitlementSource;
  /** Track F/lifecycle sink. Default emits a browser event only. */
  eventSink: ExperienceEventSink;
  /** Track C bridge. Default reports unavailable rather than inventing completion. */
  onboardingBridge: ExperienceOnboardingBridge;
  /** Track E diagnostics boundary. Default emits only safe browser diagnostics. */
  recoverableErrorReporter: ExperienceRecoverableErrorReporter;
}

const defaultRuntime: ExperienceRuntimeValue = {
  definitionSource: undefined,
  customerSource: unavailableCustomerSource,
  entitlementSource: unavailableEntitlementSource,
  eventSink: browserEventSink,
  onboardingBridge: unavailableOnboardingBridge,
  recoverableErrorReporter: browserRecoverableErrorReporter,
};

const ExperienceRuntimeContext = createContext<ExperienceRuntimeValue>(defaultRuntime);

/**
 * Composition point shared across Release 1 tracks. Track B supplies safe
 * defaults so another owner can inject its authoritative adapter without
 * changing Experience module code or teaching modules about Firebase/Stripe.
 */
export function ExperienceRuntimeProvider({
  children,
  definitionSource,
  customerSource = unavailableCustomerSource,
  entitlementSource = unavailableEntitlementSource,
  eventSink = browserEventSink,
  onboardingBridge = unavailableOnboardingBridge,
  recoverableErrorReporter = browserRecoverableErrorReporter,
}: {
  children: ReactNode;
  definitionSource?: ExperienceDefinitionSource;
  customerSource?: ExperienceCustomerSource;
  entitlementSource?: ExperienceEntitlementSource;
  eventSink?: ExperienceEventSink;
  onboardingBridge?: ExperienceOnboardingBridge;
  recoverableErrorReporter?: ExperienceRecoverableErrorReporter;
}) {
  const value = useMemo<ExperienceRuntimeValue>(() => ({
    definitionSource,
    customerSource,
    entitlementSource,
    eventSink,
    onboardingBridge,
    recoverableErrorReporter,
  }), [definitionSource, customerSource, entitlementSource, eventSink, onboardingBridge, recoverableErrorReporter]);
  return <ExperienceRuntimeContext.Provider value={value}>{children}</ExperienceRuntimeContext.Provider>;
}

export function useExperienceRuntime() {
  return useContext(ExperienceRuntimeContext);
}

export function createExperienceEventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `experience-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
