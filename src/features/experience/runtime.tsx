import { createContext, useContext, useMemo, type ReactNode } from "react";
import type {
  EntitlementSnapshotResult,
  ExperienceEntitlementRequest,
  ExperienceEntitlementSource,
  ExperienceEventSink,
  ExperienceLifecycleEvent,
} from "./contracts";

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

interface ExperienceRuntimeValue {
  entitlementSource: ExperienceEntitlementSource;
  eventSink: ExperienceEventSink;
}

const defaultRuntime: ExperienceRuntimeValue = {
  entitlementSource: unavailableEntitlementSource,
  eventSink: browserEventSink,
};

const ExperienceRuntimeContext = createContext<ExperienceRuntimeValue>(defaultRuntime);

/**
 * Composition point for Tracks D/E/F. Track B supplies fail-closed defaults;
 * billing/entitlement and lifecycle owners can inject trusted implementations
 * without changing Experience modules.
 */
export function ExperienceRuntimeProvider({
  children,
  entitlementSource = unavailableEntitlementSource,
  eventSink = browserEventSink,
}: {
  children: ReactNode;
  entitlementSource?: ExperienceEntitlementSource;
  eventSink?: ExperienceEventSink;
}) {
  const value = useMemo(() => ({ entitlementSource, eventSink }), [entitlementSource, eventSink]);
  return <ExperienceRuntimeContext.Provider value={value}>{children}</ExperienceRuntimeContext.Provider>;
}

export function useExperienceRuntime() {
  return useContext(ExperienceRuntimeContext);
}

export function createExperienceEventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `experience-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
