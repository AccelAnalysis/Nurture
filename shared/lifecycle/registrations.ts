import {
  ANALYTICS_SCHEMA_VERSION,
  EVENT_CATALOG,
  MAX_EVENT_PAYLOAD_BYTES,
  type AnalyticsDataMode,
  type AnalyticsEventType,
  type EventPayload,
  type LifecycleEventEnvelope,
  type LifecycleEventSource,
  type NurtureEventType,
} from "../analytics/contracts.js";
import {
  isExperienceModuleEventType,
  isNurtureEventType,
  validateLifecycleEventEnvelope,
} from "../analytics/core.js";

export type LifecycleProjectionPolicy =
  | "none"
  | "identity"
  | "onboarding"
  | "experience_activity"
  | "experience_milestone"
  | "experience_inactivity"
  | "refresh_commercial"
  | "refresh_communication";

export type LifecycleSubjectRequirement = "optional" | "lead_or_customer" | "customer_for_projection";

export interface LifecycleEventRegistration {
  eventType: AnalyticsEventType;
  producerOwner: string;
  schemaVersion: typeof ANALYTICS_SCHEMA_VERSION;
  payloadSchema: string;
  allowedSources: readonly LifecycleEventSource[];
  allowedModes: readonly AnalyticsDataMode[];
  subjectRequirement: LifecycleSubjectRequirement;
  maxPayloadBytes: number;
  projectionPolicy: LifecycleProjectionPolicy;
}

const ALL_MODES: readonly AnalyticsDataMode[] = ["live", "test", "preview", "demo", "development"];
const MODULE_SOURCES: readonly LifecycleEventSource[] = ["browser", "domain_action", "trusted_server"];

const identityEvents = new Set<NurtureEventType>(["visitor.identified", "lead.created", "registration.completed", "identity.verified"]);
const onboardingEvents = new Set<NurtureEventType>(["onboarding.started", "onboarding.step_completed", "onboarding.completed"]);
const commercialRefreshEvents = new Set<NurtureEventType>([
  "trial.started",
  "checkout.completed",
  "subscription.started",
  "subscription.updated",
  "subscription.renewed",
  "subscription.cancelled",
]);
const experienceActivityEvents = new Set<NurtureEventType>(["experience.started", "experience.premium_feature_requested"]);
const communicationEvents = new Set<NurtureEventType>([
  "communication.provider_accepted",
  "communication.delivered",
  "communication.bounced",
  "communication.dropped",
  "communication.complained",
  "communication.unsubscribed",
  "communication.suppressed",
  "communication.failed",
  "communication.outcome_unknown",
]);

function projectionPolicy(eventType: NurtureEventType): LifecycleProjectionPolicy {
  if (identityEvents.has(eventType)) return "identity";
  if (onboardingEvents.has(eventType)) return "onboarding";
  if (commercialRefreshEvents.has(eventType)) return "refresh_commercial";
  if (experienceActivityEvents.has(eventType)) return "experience_activity";
  if (communicationEvents.has(eventType)) return "refresh_communication";
  if (eventType === "experience.milestone_reached") return "experience_milestone";
  if (eventType === "experience.inactive") return "experience_inactivity";
  return "none";
}

function subjectRequirement(eventType: NurtureEventType): LifecycleSubjectRequirement {
  if (eventType === "lead.created" || eventType === "visitor.identified") return "lead_or_customer";
  if (
    eventType === "registration.completed"
    || eventType === "identity.verified"
    || onboardingEvents.has(eventType)
    || commercialRefreshEvents.has(eventType)
    || eventType === "experience.milestone_reached"
    || eventType === "experience.inactive"
  ) return "customer_for_projection";
  if (communicationEvents.has(eventType)) return "lead_or_customer";
  return "optional";
}

function payloadSchema(eventType: AnalyticsEventType): string {
  if (eventType === "experience.milestone_reached") return "experience.milestone_reached/v1";
  if (communicationEvents.has(eventType as NurtureEventType)) return "communication.lifecycle/v1";
  if (eventType.startsWith("onboarding.")) return "onboarding.lifecycle/v1";
  if (isExperienceModuleEventType(eventType)) return "experience.module.signal/v1";
  return `${eventType}/v1`;
}

function optionalBoundedString(payload: EventPayload, key: string, max = 160): void {
  const value = payload[key];
  if (value === undefined) return;
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${key} must be a non-empty string of at most ${max} characters.`);
  }
}

function validateRegisteredPayload(event: LifecycleEventEnvelope): void {
  if (event.eventType.startsWith("onboarding.")) {
    optionalBoundedString(event.payload, "flowVersion", 120);
    optionalBoundedString(event.payload, "stepId", 160);
  }
  if (communicationEvents.has(event.eventType as NurtureEventType)) {
    const messageId = event.payload.messageId ?? event.payload.communicationId;
    if (typeof messageId !== "string" || !messageId.trim() || messageId.length > 160) {
      throw new Error(`${event.eventType} requires a bounded messageId.`);
    }
    optionalBoundedString(event.payload, "reasonCode", 160);
    optionalBoundedString(event.payload, "providerEventType", 160);
  }
  if (event.eventType === "experience.milestone_reached") {
    const milestoneKey = event.payload.milestoneKey ?? event.payload.milestoneId;
    if (typeof milestoneKey !== "string" || !milestoneKey.trim() || milestoneKey.length > 256) {
      throw new Error("experience.milestone_reached requires a bounded milestoneKey.");
    }
    if (event.payload.activation !== undefined && typeof event.payload.activation !== "boolean") {
      throw new Error("experience.milestone_reached activation must be boolean when supplied.");
    }
    optionalBoundedString(event.payload, "milestoneLabel", 240);
    optionalBoundedString(event.payload, "actionId", 256);
  }
}

export function getLifecycleEventRegistration(eventType: AnalyticsEventType): LifecycleEventRegistration | null {
  if (isNurtureEventType(eventType)) {
    const catalogEntry = EVENT_CATALOG[eventType];
    return {
      eventType,
      producerOwner: catalogEntry.owner,
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      payloadSchema: payloadSchema(eventType),
      allowedSources: catalogEntry.allowedSources as readonly LifecycleEventSource[],
      allowedModes: ALL_MODES,
      subjectRequirement: subjectRequirement(eventType),
      maxPayloadBytes: MAX_EVENT_PAYLOAD_BYTES,
      projectionPolicy: projectionPolicy(eventType),
    };
  }

  if (isExperienceModuleEventType(eventType)) {
    return {
      eventType,
      producerOwner: "B",
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      payloadSchema: payloadSchema(eventType),
      allowedSources: MODULE_SOURCES,
      allowedModes: ALL_MODES,
      subjectRequirement: "optional",
      maxPayloadBytes: MAX_EVENT_PAYLOAD_BYTES,
      projectionPolicy: "experience_activity",
    };
  }

  return null;
}

/**
 * Projection validation layers on the Release 1 envelope validator. It cannot
 * turn a browser signal into a privileged domain/provider source; E still owns
 * verified tenant/customer binding and canonical append persistence.
 */
export function validateLifecycleProjectionEvent(value: unknown): {
  event: LifecycleEventEnvelope;
  registration: LifecycleEventRegistration;
} {
  const event = validateLifecycleEventEnvelope(value);
  const registration = getLifecycleEventRegistration(event.eventType);
  if (!registration) throw new Error(`No lifecycle registration for ${event.eventType}.`);
  if (!registration.allowedSources.includes(event.source)) throw new Error(`${event.source} is not registered for ${event.eventType}.`);
  if (!registration.allowedModes.includes(event.dataMode)) throw new Error(`${event.dataMode} is not registered for ${event.eventType}.`);

  if (registration.subjectRequirement === "customer_for_projection" && !event.customerId) {
    throw new Error(`${event.eventType} requires a trusted customer subject for lifecycle projection.`);
  }
  if (
    registration.subjectRequirement === "lead_or_customer"
    && !event.customerId
    && !(event.subjectKind === "lead" && event.subjectId)
  ) {
    throw new Error(`${event.eventType} requires a trusted lead or customer subject.`);
  }
  validateRegisteredPayload(event);
  return { event, registration };
}
