import type {
  AnalyticsDataMode,
  EventPayload,
  LifecycleEventEnvelope,
  LifecycleEventSource,
} from "../analytics/contracts";
import type {
  CancellationProjection,
  CommercialServicingSummary,
  EngagementProjection,
  ProvenanceRef,
  SegmentFact,
} from "./contracts";

export const RELEASE3_EVENT_CATALOG = {
  "experience.reactivated": { allowedSources: ["domain_action", "trusted_server"] as const, dimension: "engagement" },
  "payment.failed": { allowedSources: ["provider_webhook", "trusted_server"] as const, dimension: "payment" },
  "payment.recovered": { allowedSources: ["provider_webhook", "trusted_server"] as const, dimension: "payment" },
  "subscription.cancellation_requested": { allowedSources: ["domain_action", "trusted_server", "administrator"] as const, dimension: "cancellation" },
  "treatment.in_app.presented": { allowedSources: ["browser", "domain_action", "trusted_server"] as const, dimension: "treatment" },
  "treatment.in_app.dismissed": { allowedSources: ["browser", "domain_action", "trusted_server"] as const, dimension: "treatment" },
  "treatment.in_app.acted": { allowedSources: ["browser", "domain_action", "trusted_server"] as const, dimension: "treatment" },
  "lifecycle.run.suppressed": { allowedSources: ["scheduler", "trusted_server"] as const, dimension: "treatment" },
  "lifecycle.run.failed": { allowedSources: ["scheduler", "trusted_server"] as const, dimension: "treatment" },
  "lifecycle.run.reconciled": { allowedSources: ["trusted_server", "administrator"] as const, dimension: "treatment" },
} as const;

export type Release3NewEventType = keyof typeof RELEASE3_EVENT_CATALOG;
export type Release3ProjectedEventType =
  | Release3NewEventType
  | "experience.premium_feature_requested"
  | "experience.milestone_reached"
  | "experience.inactive"
  | "subscription.started"
  | "subscription.updated"
  | "subscription.renewed"
  | "subscription.cancelled";

export type Release3LifecycleEventEnvelope = Omit<LifecycleEventEnvelope, "eventType"> & { eventType: Release3ProjectedEventType };

export interface TreatmentTimelineRecord {
  eventId: string;
  eventType: Release3ProjectedEventType;
  occurredAt: string;
  receivedAt: string;
  source: LifecycleEventSource;
  runId?: string;
  automationId?: string;
  treatmentId?: string;
  effectId?: string;
  reason?: string;
}

export interface RetentionProjectionState {
  organizationId: string;
  customerId: string;
  dataMode: AnalyticsDataMode;
  engagement: EngagementProjection;
  commercial: CommercialServicingSummary;
  lastPremiumCapabilityRequested?: string;
  lastMilestone?: string;
  treatmentTimeline: TreatmentTimelineRecord[];
  seenEventIds: string[];
  watermarks: {
    engagement?: string;
    subscription?: string;
    payment?: string;
    cancellation?: string;
    renewal?: string;
  };
  updatedAt?: string;
}

export function initialRetentionProjection(organizationId: string, customerId: string, dataMode: AnalyticsDataMode): RetentionProjectionState {
  return {
    organizationId,
    customerId,
    dataMode,
    engagement: { state: "unknown" },
    commercial: { subscriptionState: "none", entitlementKeys: [], paymentHealth: "unknown", cancellation: { status: "none" } },
    treatmentTimeline: [],
    seenEventIds: [],
    watermarks: {},
  };
}

function payloadString(payload: EventPayload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
function payloadNumber(payload: EventPayload, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function sourceToProvenance(event: Release3LifecycleEventEnvelope): ProvenanceRef {
  const source: ProvenanceRef["source"] = event.source === "provider_webhook" ? "provider" : event.source === "scheduler" ? "scheduler" : event.source === "administrator" ? "administrator" : event.source === "domain_action" ? "experience" : event.source === "browser" ? "browser" : "projection";
  return { source, sourceId: event.eventId, occurredAt: event.occurredAt, receivedAt: event.receivedAt, schemaVersion: event.schemaVersion };
}
function atOrAfter(current: string | undefined, candidate: string): boolean { return !current || candidate >= current; }
function normalizedSubscriptionState(value: string | undefined): CommercialServicingSummary["subscriptionState"] | undefined {
  if (!value) return undefined;
  const allowed: CommercialServicingSummary["subscriptionState"][] = ["none", "trialing", "active", "past_due", "unpaid", "paused", "canceled", "incomplete"];
  return allowed.includes(value as CommercialServicingSummary["subscriptionState"]) ? value as CommercialServicingSummary["subscriptionState"] : undefined;
}

export function sourceAllowedForRelease3Event(event: Release3LifecycleEventEnvelope): boolean {
  const newDefinition = RELEASE3_EVENT_CATALOG[event.eventType as Release3NewEventType];
  if (newDefinition) return (newDefinition.allowedSources as readonly LifecycleEventSource[]).includes(event.source);
  if (event.eventType === "experience.inactive") return event.source === "scheduler" || event.source === "trusted_server";
  if (event.eventType === "subscription.renewed" || event.eventType === "subscription.cancelled" || event.eventType === "subscription.started" || event.eventType === "subscription.updated") return event.source === "provider_webhook" || event.source === "trusted_server";
  if (event.eventType === "experience.milestone_reached") return event.source === "domain_action" || event.source === "trusted_server";
  if (event.eventType === "experience.premium_feature_requested") return event.source === "browser" || event.source === "domain_action" || event.source === "trusted_server";
  return false;
}

export function validateProjectedEvent(event: Release3LifecycleEventEnvelope, state: RetentionProjectionState): string[] {
  const errors: string[] = [];
  if (event.organizationId !== state.organizationId) errors.push("wrong-organization");
  if (event.customerId !== state.customerId && event.subjectId !== state.customerId) errors.push("wrong-customer");
  if (event.dataMode !== state.dataMode) errors.push("wrong-mode");
  if (!sourceAllowedForRelease3Event(event)) errors.push("untrusted-source");
  if (!event.eventId || !event.idempotencyKey) errors.push("missing-identity");
  return errors;
}

function updateCancellation(current: CancellationProjection, event: Release3LifecycleEventEnvelope): CancellationProjection {
  const provenance = sourceToProvenance(event);
  if (event.eventType === "subscription.cancellation_requested") return { ...current, status: "requested", requestedAt: event.occurredAt, provenance };
  if (event.eventType === "subscription.updated" && event.payload.cancelAtPeriodEnd === true) {
    return { ...current, status: "scheduled", requestedAt: current.requestedAt ?? event.occurredAt, effectiveAt: payloadString(event.payload, "effectiveAt"), accessEndsAt: payloadString(event.payload, "accessEndsAt") ?? payloadString(event.payload, "currentPeriodEnd"), provenance };
  }
  if (event.eventType === "subscription.cancelled") return { ...current, status: "completed", completedAt: event.occurredAt, effectiveAt: payloadString(event.payload, "effectiveAt") ?? event.occurredAt, accessEndsAt: payloadString(event.payload, "accessEndsAt"), provenance };
  return current;
}

function timelineRecord(event: Release3LifecycleEventEnvelope): TreatmentTimelineRecord {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    receivedAt: event.receivedAt,
    source: event.source,
    ...(payloadString(event.payload, "runId") ? { runId: payloadString(event.payload, "runId") } : {}),
    ...(payloadString(event.payload, "automationId") ? { automationId: payloadString(event.payload, "automationId") } : {}),
    ...(payloadString(event.payload, "treatmentId") ? { treatmentId: payloadString(event.payload, "treatmentId") } : {}),
    ...(payloadString(event.payload, "effectId") ? { effectId: payloadString(event.payload, "effectId") } : {}),
    ...(payloadString(event.payload, "reason") ? { reason: payloadString(event.payload, "reason") } : {}),
  };
}

export function applyRetentionEvent(state: RetentionProjectionState, event: Release3LifecycleEventEnvelope): RetentionProjectionState {
  if (state.seenEventIds.includes(event.eventId)) return state;
  if (validateProjectedEvent(event, state).length) return state;
  const next: RetentionProjectionState = { ...state, engagement: { ...state.engagement }, commercial: { ...state.commercial, entitlementKeys: [...state.commercial.entitlementKeys], cancellation: { ...state.commercial.cancellation } }, treatmentTimeline: [...state.treatmentTimeline], seenEventIds: [...state.seenEventIds, event.eventId], watermarks: { ...state.watermarks }, updatedAt: state.updatedAt && state.updatedAt > event.receivedAt ? state.updatedAt : event.receivedAt };
  const provenance = sourceToProvenance(event);

  if ((event.eventType === "experience.milestone_reached" || event.eventType === "experience.reactivated") && atOrAfter(next.watermarks.engagement, event.occurredAt)) {
    next.engagement = { state: "active", lastMeaningfulActivityAt: event.occurredAt, ...(event.eventType === "experience.reactivated" ? { reactivatedAt: event.occurredAt } : {}), provenance };
    next.watermarks.engagement = event.occurredAt;
    if (event.eventType === "experience.milestone_reached") next.lastMilestone = payloadString(event.payload, "milestoneKey") ?? event.eventType;
  }
  if (event.eventType === "experience.inactive" && atOrAfter(next.watermarks.engagement, event.occurredAt)) {
    next.engagement = { state: "inactive", lastMeaningfulActivityAt: payloadString(event.payload, "lastMeaningfulActivityAt") ?? next.engagement.lastMeaningfulActivityAt, inactiveSince: payloadString(event.payload, "inactiveSince") ?? event.occurredAt, thresholdHours: payloadNumber(event.payload, "thresholdHours"), provenance };
    next.watermarks.engagement = event.occurredAt;
  }
  if (event.eventType === "experience.premium_feature_requested") next.lastPremiumCapabilityRequested = payloadString(event.payload, "capabilityKey");

  if ((event.eventType === "subscription.started" || event.eventType === "subscription.updated" || event.eventType === "subscription.renewed" || event.eventType === "subscription.cancelled") && atOrAfter(next.watermarks.subscription, event.occurredAt)) {
    const status = event.eventType === "subscription.cancelled" ? "canceled" : normalizedSubscriptionState(payloadString(event.payload, "status"));
    if (status) next.commercial.subscriptionState = status;
    next.commercial = {
      ...next.commercial,
      ...(payloadString(event.payload, "subscriptionId") ? { subscriptionId: payloadString(event.payload, "subscriptionId") } : {}),
      ...(payloadString(event.payload, "offerId") ? { offerId: payloadString(event.payload, "offerId") } : {}),
      ...(payloadNumber(event.payload, "offerVersion") !== undefined ? { offerVersion: payloadNumber(event.payload, "offerVersion") } : {}),
      ...(payloadString(event.payload, "currentPeriodEnd") ? { nextRenewalAt: payloadString(event.payload, "currentPeriodEnd") } : {}),
      ...(payloadNumber(event.payload, "amountMinor") !== undefined ? { renewalAmountMinor: payloadNumber(event.payload, "amountMinor") } : {}),
      ...(payloadString(event.payload, "currency") ? { currency: payloadString(event.payload, "currency") } : {}),
      provenance,
    };
    next.watermarks.subscription = event.occurredAt;
  }
  if (event.eventType === "subscription.renewed" && atOrAfter(next.watermarks.renewal, event.occurredAt)) {
    next.watermarks.renewal = event.occurredAt;
    next.commercial.paymentHealth = "healthy";
  }
  if ((event.eventType === "payment.failed" || event.eventType === "payment.recovered") && atOrAfter(next.watermarks.payment, event.occurredAt)) {
    next.commercial.paymentHealth = event.eventType === "payment.failed" ? "failed" : "recovered";
    next.commercial.provenance = provenance;
    next.watermarks.payment = event.occurredAt;
  }
  if ((event.eventType === "subscription.cancellation_requested" || event.eventType === "subscription.updated" || event.eventType === "subscription.cancelled") && atOrAfter(next.watermarks.cancellation, event.occurredAt)) {
    next.commercial.cancellation = updateCancellation(next.commercial.cancellation, event);
    next.watermarks.cancellation = event.occurredAt;
  }

  if (event.eventType.startsWith("treatment.") || event.eventType.startsWith("lifecycle.run.")) {
    next.treatmentTimeline.push(timelineRecord(event));
    next.treatmentTimeline.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.receivedAt.localeCompare(right.receivedAt) || left.eventId.localeCompare(right.eventId));
  }
  return next;
}

export function projectRetentionEvents(initial: RetentionProjectionState, events: Release3LifecycleEventEnvelope[]): RetentionProjectionState {
  const deduped = [...new Map(events.map((event) => [event.eventId, event])).values()]
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.receivedAt.localeCompare(right.receivedAt) || left.eventId.localeCompare(right.eventId));
  return deduped.reduce(applyRetentionEvent, initial);
}

export function segmentFactsFromProjection(state: RetentionProjectionState, observedAt: string): SegmentFact[] {
  const projectionProvenance: ProvenanceRef = { source: "projection", occurredAt: observedAt, schemaVersion: 1 };
  const facts: SegmentFact[] = [
    { key: "subscription.state", value: state.commercial.subscriptionState, observedAt, provenance: state.commercial.provenance ?? projectionProvenance },
    { key: "payment.health", value: state.commercial.paymentHealth, observedAt, provenance: state.commercial.provenance ?? projectionProvenance },
    { key: "cancellation.status", value: state.commercial.cancellation.status, observedAt, provenance: state.commercial.cancellation.provenance ?? projectionProvenance },
    { key: "engagement.state", value: state.engagement.state, observedAt, provenance: state.engagement.provenance ?? projectionProvenance },
  ];
  if (state.commercial.offerId) facts.push({ key: "subscription.offer_id", value: state.commercial.offerId, observedAt, provenance: state.commercial.provenance ?? projectionProvenance });
  if (state.lastMilestone) facts.push({ key: "experience.milestone", value: state.lastMilestone, observedAt, provenance: state.engagement.provenance ?? projectionProvenance });
  if (state.engagement.state === "inactive" && state.engagement.inactiveSince) facts.push({ key: "engagement.inactive_hours", value: Math.max(0, (Date.parse(observedAt) - Date.parse(state.engagement.inactiveSince)) / 3_600_000), observedAt, provenance: state.engagement.provenance ?? projectionProvenance });
  return facts;
}
