import type { AnalyticsDataMode, AnalyticsEventType, EventPayload, JsonValue, LifecycleEventEnvelope } from "../analytics/contracts.js";
import { isNurtureEventType } from "../analytics/core.js";
import {
  LIFECYCLE_QUERY_DEFAULT_LIMIT,
  LIFECYCLE_QUERY_MAX_LIMIT,
  type CustomerLifecycleQuery,
  type CustomerLifecycleSummary,
  type CustomerTimelineCategory,
  type CustomerTimelineEntry,
  type CustomerTimelineQuery,
  type LifecycleCustomerListQuery,
  type LifecyclePage,
  type LifecycleProjectionReadStore,
  type LifecycleReadAuthorizationPort,
  type LifecycleTimelineEventStore,
  type LifecycleCustomerAliasPort,
  type LifecycleTimelineLinkPort,
} from "./contracts.js";
import { deriveLifecycleStageView, lifecycleDataQualityIndicators } from "./projection.js";

export type LifecycleQueryErrorCode = "invalid-request" | "forbidden" | "not-found" | "mode-forbidden";

export class LifecycleQueryError extends Error {
  constructor(
    readonly code: LifecycleQueryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LifecycleQueryError";
  }
}

function requireIdentifier(label: string, value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) throw new LifecycleQueryError("invalid-request", `${label} is invalid.`);
  return normalized;
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return LIFECYCLE_QUERY_DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > LIFECYCLE_QUERY_MAX_LIMIT) {
    throw new LifecycleQueryError("invalid-request", `limit must be between 1 and ${LIFECYCLE_QUERY_MAX_LIMIT}.`);
  }
  return value;
}

function requestedMode(value: AnalyticsDataMode | undefined): AnalyticsDataMode {
  return value ?? "live";
}

const timelineLabels: Partial<Record<AnalyticsEventType, string>> = {
  "visitor.identified": "Visitor identified",
  "lead.created": "Lead captured",
  "registration.started": "Registration started",
  "registration.completed": "Registration completed",
  "identity.verified": "Identity verified",
  "trial.started": "Trial started",
  "offer.viewed": "Offer viewed",
  "checkout.started": "Checkout started",
  "checkout.abandoned": "Checkout recovery window reached",
  "checkout.completed": "Checkout completed",
  "subscription.started": "Subscription started",
  "subscription.updated": "Subscription updated",
  "subscription.renewed": "Subscription renewed",
  "subscription.cancelled": "Subscription cancelled",
  "onboarding.started": "Onboarding started",
  "onboarding.step_completed": "Onboarding step completed",
  "onboarding.completed": "Onboarding completed",
  "experience.started": "Experience started",
  "experience.milestone_reached": "Experience milestone reached",
  "experience.premium_feature_requested": "Premium capability requested",
  "experience.inactive": "Experience inactivity inferred",
  "communication.provider_accepted": "Email accepted by provider",
  "communication.delivered": "Email delivered",
  "communication.bounced": "Email bounced",
  "communication.dropped": "Email dropped",
  "communication.complained": "Email complaint recorded",
  "communication.unsubscribed": "Email unsubscribe recorded",
  "communication.suppressed": "Email suppressed",
  "communication.failed": "Email delivery failed",
  "communication.outcome_unknown": "Email outcome requires review",
  "configuration.published": "Configuration published",
};

function humanizeModuleEvent(eventType: string): string {
  const parts = eventType.split(".").slice(1);
  return parts.map((part) => part.replace(/[-_]/g, " ")).join(" · ");
}

export function lifecycleTimelineLabel(eventType: AnalyticsEventType): string {
  return timelineLabels[eventType] ?? (isNurtureEventType(eventType) ? eventType : humanizeModuleEvent(eventType));
}

export function lifecycleTimelineCategory(eventType: AnalyticsEventType): CustomerTimelineCategory {
  if (eventType.startsWith("public.")) return "public";
  if (eventType.startsWith("registration.") || eventType.startsWith("identity.") || eventType === "lead.created" || eventType === "visitor.identified") return "identity";
  if (eventType.startsWith("onboarding.")) return "onboarding";
  if (eventType.startsWith("checkout.") || eventType.startsWith("subscription.") || eventType === "trial.started" || eventType === "offer.viewed") return "commerce";
  if (eventType.startsWith("experience.")) return "experience";
  if (eventType.startsWith("communication.")) return "communication";
  if (eventType.startsWith("automation.")) return "automation";
  if (eventType.startsWith("configuration.")) return "configuration";
  return "other";
}

const standardDetailKeys = new Set([
  "flowVersion",
  "stepId",
  "milestoneId",
  "milestoneKey",
  "milestoneLabel",
  "activation",
  "actionId",
  "evidenceVersion",
  "status",
  "reasonCode",
  "communicationId",
  "messageId",
  "automationRunId",
  "automationId",
  "templateVersion",
  "subscriptionStatus",
  "offerVersion",
]);
const sensitiveDetailKeys = new Set([
  ...standardDetailKeys,
  "agreementVersion",
  "providerStatus",
  "providerEventType",
]);

function safeTimelineDetails(event: LifecycleEventEnvelope, detailLevel: "standard" | "sensitive"): EventPayload {
  const allowed = detailLevel === "sensitive" ? sensitiveDetailKeys : standardDetailKeys;
  const details: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(event.payload)) {
    if (allowed.has(key)) details[key] = value;
  }
  return details;
}

function eventSortDescending(a: LifecycleEventEnvelope, b: LifecycleEventEnvelope): number {
  const occurred = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
  if (occurred) return occurred;
  const received = Date.parse(b.receivedAt) - Date.parse(a.receivedAt);
  if (received) return received;
  return b.eventId.localeCompare(a.eventId);
}

function timelineEntry(
  event: LifecycleEventEnvelope,
  customerId: string,
  detailLevel: "standard" | "sensitive",
): CustomerTimelineEntry {
  return {
    id: event.eventId,
    organizationId: event.organizationId,
    customerId,
    eventId: event.eventId,
    eventType: event.eventType,
    category: lifecycleTimelineCategory(event.eventType),
    label: lifecycleTimelineLabel(event.eventType),
    occurredAt: event.occurredAt,
    receivedAt: event.receivedAt,
    dataMode: event.dataMode,
    source: event.source,
    sourceReference: {
      eventId: event.eventId,
      eventType: event.eventType,
      source: event.source,
      correlationId: event.correlationId,
      idempotencyKey: event.idempotencyKey,
    },
    details: safeTimelineDetails(event, detailLevel),
  };
}

export interface LifecycleQueryServiceDependencies {
  authorization: LifecycleReadAuthorizationPort;
  projections: LifecycleProjectionReadStore;
  events: LifecycleTimelineEventStore;
  aliases: LifecycleCustomerAliasPort;
  links?: LifecycleTimelineLinkPort;
}

async function authorize(
  deps: LifecycleQueryServiceDependencies,
  input: { organizationId: string; actorIdentityId: string; capability: "customers.view" | "lifecycle.view"; dataMode: AnalyticsDataMode },
) {
  const decision = await deps.authorization.authorize({
    organizationId: input.organizationId,
    actorIdentityId: input.actorIdentityId,
    capability: input.capability,
  });
  if (!decision.allowed) throw new LifecycleQueryError("forbidden", "Lifecycle data is not available for this principal and organization.");
  if (!decision.allowedModes.includes(input.dataMode)) {
    throw new LifecycleQueryError("mode-forbidden", `Lifecycle mode ${input.dataMode} is not available to this principal.`);
  }
  return decision;
}

async function toSummary(
  deps: LifecycleQueryServiceDependencies,
  projection: NonNullable<Awaited<ReturnType<LifecycleProjectionReadStore["getProjection"]>>>,
): Promise<CustomerLifecycleSummary> {
  const checkpoint = deps.projections.getCheckpoint
    ? await deps.projections.getCheckpoint({
      organizationId: projection.organizationId,
      customerId: projection.customerId,
      dataMode: projection.dataMode,
    })
    : null;
  return {
    organizationId: projection.organizationId,
    customerId: projection.customerId,
    dataMode: projection.dataMode,
    identity: projection.identity,
    onboarding: projection.onboarding,
    commercial: projection.commercial,
    experience: projection.experience,
    communication: projection.communication,
    stageView: deriveLifecycleStageView(projection),
    dataQuality: lifecycleDataQualityIndicators(projection, checkpoint ?? undefined),
    updatedAt: projection.updatedAt,
  };
}

export function createLifecycleQueryService(deps: LifecycleQueryServiceDependencies) {
  return {
    async listCustomerSummaries(query: LifecycleCustomerListQuery): Promise<LifecyclePage<CustomerLifecycleSummary>> {
      const organizationId = requireIdentifier("organizationId", query.organizationId);
      const actorIdentityId = requireIdentifier("actorIdentityId", query.actorIdentityId);
      const dataMode = requestedMode(query.dataMode);
      await authorize(deps, { organizationId, actorIdentityId, capability: "customers.view", dataMode });
      const page = await deps.projections.listProjections({
        organizationId,
        dataMode,
        limit: boundedLimit(query.limit),
        cursor: query.cursor,
        filters: query.filters,
      });
      return {
        items: await Promise.all(page.items.map((projection) => toSummary(deps, projection))),
        nextCursor: page.nextCursor,
      };
    },

    async getCustomerSummary(query: CustomerLifecycleQuery): Promise<CustomerLifecycleSummary> {
      const organizationId = requireIdentifier("organizationId", query.organizationId);
      const customerId = requireIdentifier("customerId", query.customerId);
      const actorIdentityId = requireIdentifier("actorIdentityId", query.actorIdentityId);
      const dataMode = requestedMode(query.dataMode);
      await authorize(deps, { organizationId, actorIdentityId, capability: "customers.view", dataMode });
      const projection = await deps.projections.getProjection({ organizationId, customerId, dataMode });
      if (!projection) throw new LifecycleQueryError("not-found", "Customer lifecycle summary is unavailable.");
      return toSummary(deps, projection);
    },

    async getCustomerTimeline(query: CustomerTimelineQuery): Promise<LifecyclePage<CustomerTimelineEntry>> {
      const organizationId = requireIdentifier("organizationId", query.organizationId);
      const customerId = requireIdentifier("customerId", query.customerId);
      const actorIdentityId = requireIdentifier("actorIdentityId", query.actorIdentityId);
      const dataMode = requestedMode(query.dataMode);
      const decision = await authorize(deps, { organizationId, actorIdentityId, capability: "lifecycle.view", dataMode });
      const aliases = await deps.aliases.resolveAliases({ organizationId, customerId });
      const page = await deps.events.listCustomerEvents({
        organizationId,
        customerId,
        identityIds: aliases.identityIds,
        leadIds: aliases.leadIds,
        dataMode,
        limit: boundedLimit(query.limit),
        cursor: query.cursor,
        eventTypes: query.eventTypes,
      });
      let entries = [...page.items]
        .sort(eventSortDescending)
        .map((event) => timelineEntry(event, customerId, decision.detailLevel));
      if (query.categories?.length) {
        const categories = new Set(query.categories);
        entries = entries.filter((entry) => categories.has(entry.category));
      }
      if (deps.links && entries.length) {
        const links = await deps.links.resolveLinks({
          organizationId,
          customerId,
          eventIds: entries.map((entry) => entry.eventId),
        });
        entries = entries.map((entry) => ({ ...entry, ...links[entry.eventId] }));
      }
      return { items: entries, nextCursor: page.nextCursor };
    },
  };
}
