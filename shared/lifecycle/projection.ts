import type { JsonValue, LifecycleEventEnvelope } from "../analytics/contracts.js";
import {
  LIFECYCLE_PROCESSOR_VERSION,
  LIFECYCLE_PROJECTION_SCHEMA_VERSION,
  type AuthoritativeCommercialSnapshot,
  type AuthoritativeCommunicationEligibilitySnapshot,
  type CommercialLifecycleProjection,
  type CustomerLifecycleProjection,
  type ExperienceLifecycleProjection,
  type ExperienceMilestoneProjection,
  type IdentityLifecycleProjection,
  type LifecycleAdminStageView,
  type LifecycleCurrentStateBackfillSnapshot,
  type LifecycleDataQualityIndicator,
  type LifecycleProjectionApplyResult,
  type LifecycleProjectionCheckpoint,
  type LifecycleProjectionMetadata,
  type OnboardingLifecycleProjection,
} from "./contracts.js";
import { validateLifecycleProjectionEvent } from "./registrations.js";

function toMillis(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function minTimestamp(a: string | undefined, b: string): string {
  return !a || toMillis(b) < toMillis(a) ? b : a;
}

function maxTimestamp(a: string | undefined, b: string): string {
  return !a || toMillis(b) > toMillis(a) ? b : a;
}

function payloadString(event: LifecycleEventEnvelope, key: string): string | undefined {
  const value: JsonValue | undefined = event.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function payloadBoolean(event: LifecycleEventEnvelope, key: string): boolean | undefined {
  const value: JsonValue | undefined = event.payload[key];
  return typeof value === "boolean" ? value : undefined;
}

function initialMetadata(now: string): LifecycleProjectionMetadata {
  return {
    provenance: "initial",
    stale: false,
    updatedAt: now,
    note: "No authoritative lifecycle evidence has been projected yet.",
  };
}

function eventMetadata(event: LifecycleEventEnvelope, stale = false, note?: string): LifecycleProjectionMetadata {
  return {
    provenance: "event",
    stale,
    updatedAt: event.receivedAt,
    source: event.source,
    sourceEventId: event.eventId,
    sourceEventType: event.eventType,
    sourceOccurredAt: event.occurredAt,
    sourceReceivedAt: event.receivedAt,
    note,
  };
}

export function createEmptyCustomerLifecycleProjection(input: {
  organizationId: string;
  customerId: string;
  dataMode: CustomerLifecycleProjection["dataMode"];
  now?: string;
}): CustomerLifecycleProjection {
  const now = input.now ?? new Date().toISOString();
  const unknown = initialMetadata(now);
  return {
    projectionSchemaVersion: LIFECYCLE_PROJECTION_SCHEMA_VERSION,
    processorVersion: LIFECYCLE_PROCESSOR_VERSION,
    organizationId: input.organizationId,
    customerId: input.customerId,
    dataMode: input.dataMode,
    identity: { state: "unknown", metadata: unknown },
    onboarding: { state: "unknown", metadata: unknown },
    commercial: { state: "unknown", metadata: unknown },
    experience: { state: "unknown", milestones: [], metadata: unknown },
    communication: {
      email: {
        transactional: { state: "unknown", reasonCodes: [], metadata: unknown },
        marketing: { state: "unknown", reasonCodes: [], metadata: unknown },
      },
    },
    createdAt: now,
    updatedAt: now,
  };
}

const identityRank: Readonly<Record<IdentityLifecycleProjection["state"], number>> = {
  unknown: 0,
  lead: 1,
  registered: 2,
  verified: 3,
};

function applyIdentityEvent(
  projection: IdentityLifecycleProjection,
  event: LifecycleEventEnvelope,
): IdentityLifecycleProjection {
  let candidate: IdentityLifecycleProjection["state"] | null = null;
  if (event.eventType === "visitor.identified" || event.eventType === "lead.created") candidate = "lead";
  if (event.eventType === "registration.completed") candidate = "registered";
  if (event.eventType === "identity.verified") candidate = "verified";
  if (!candidate || identityRank[candidate] < identityRank[projection.state]) return projection;

  const shouldReplaceEvidence = identityRank[candidate] > identityRank[projection.state]
    || toMillis(event.occurredAt) >= toMillis(projection.metadata.sourceOccurredAt);
  if (!shouldReplaceEvidence) return projection;

  return {
    state: candidate,
    identityId: event.identityId ?? projection.identityId,
    metadata: eventMetadata(event),
  };
}

function applyOnboardingEvent(
  projection: OnboardingLifecycleProjection,
  event: LifecycleEventEnvelope,
): OnboardingLifecycleProjection {
  const flowVersion = payloadString(event, "flowVersion") ?? projection.flowVersion;
  const stepId = payloadString(event, "stepId");

  if (event.eventType === "onboarding.completed") {
    const sameFlow = !projection.flowVersion || !flowVersion || projection.flowVersion === flowVersion;
    if (
      projection.state === "completed"
      && !sameFlow
      && toMillis(event.occurredAt) < toMillis(projection.metadata.sourceOccurredAt)
    ) return projection;
    const completedAt = sameFlow && projection.completedAt
      ? minTimestamp(projection.completedAt, event.occurredAt)
      : event.occurredAt;
    return {
      state: "completed",
      flowVersion,
      startedAt: projection.startedAt,
      completedAt,
      lastCompletedStepId: stepId ?? projection.lastCompletedStepId,
      metadata: toMillis(event.occurredAt) >= toMillis(projection.metadata.sourceOccurredAt)
        ? eventMetadata(event)
        : projection.metadata,
    };
  }

  if (event.eventType !== "onboarding.started" && event.eventType !== "onboarding.step_completed") {
    return projection;
  }

  const isDifferentFlow = Boolean(flowVersion && projection.flowVersion && flowVersion !== projection.flowVersion);
  if (projection.state === "completed" && !isDifferentFlow) return projection;
  if (
    projection.state === "completed"
    && isDifferentFlow
    && toMillis(event.occurredAt) <= toMillis(projection.metadata.sourceOccurredAt)
  ) return projection;

  return {
    state: "in_progress",
    flowVersion,
    startedAt: projection.startedAt ? minTimestamp(projection.startedAt, event.occurredAt) : event.occurredAt,
    completedAt: isDifferentFlow ? undefined : projection.completedAt,
    lastCompletedStepId: event.eventType === "onboarding.step_completed"
      ? stepId ?? projection.lastCompletedStepId
      : projection.lastCompletedStepId,
    metadata: toMillis(event.occurredAt) >= toMillis(projection.metadata.sourceOccurredAt)
      ? eventMetadata(event)
      : projection.metadata,
  };
}

const MAX_PROJECTED_MILESTONES = 50;

function milestoneFromEvent(event: LifecycleEventEnvelope): ExperienceMilestoneProjection {
  return {
    milestoneId: event.idempotencyKey,
    milestoneKey: payloadString(event, "milestoneKey") ?? payloadString(event, "milestoneId") ?? event.eventType,
    activation: payloadBoolean(event, "activation") === true,
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    label: payloadString(event, "milestoneLabel"),
    experienceId: event.experienceId,
    moduleId: event.experienceModuleId,
    moduleVersion: event.experienceModuleVersion,
  };
}

function sortMilestones(values: readonly ExperienceMilestoneProjection[]): readonly ExperienceMilestoneProjection[] {
  return [...values].sort((a, b) => {
    const time = toMillis(a.occurredAt) - toMillis(b.occurredAt);
    return time || a.milestoneKey.localeCompare(b.milestoneKey) || a.milestoneId.localeCompare(b.milestoneId);
  });
}

function mergeMilestone(
  values: readonly ExperienceMilestoneProjection[],
  candidate: ExperienceMilestoneProjection,
): readonly ExperienceMilestoneProjection[] {
  const exactDuplicate = values.find((item) => item.milestoneId === candidate.milestoneId);
  if (exactDuplicate) return values;
  const sameKey = values.find((item) => item.milestoneKey === candidate.milestoneKey);
  let next = values;
  if (!sameKey) next = [...values, candidate];
  else if (toMillis(candidate.occurredAt) >= toMillis(sameKey.occurredAt)) {
    next = values.map((item) => item.milestoneKey === candidate.milestoneKey ? candidate : item);
  }
  const sorted = sortMilestones(next);
  return sorted.length > MAX_PROJECTED_MILESTONES ? sorted.slice(sorted.length - MAX_PROJECTED_MILESTONES) : sorted;
}

function applyExperienceActivity(
  projection: ExperienceLifecycleProjection,
  event: LifecycleEventEnvelope,
): ExperienceLifecycleProjection {
  const firstUseAt = minTimestamp(projection.firstUseAt, event.occurredAt);
  const lastUseAt = maxTimestamp(projection.lastUseAt, event.occurredAt);
  const isNewer = toMillis(event.occurredAt) >= toMillis(projection.metadata.sourceOccurredAt);
  let state = projection.state;
  if (state === "unknown" || state === "not_started") state = "started";
  if (state === "inactive" && isNewer) state = projection.milestones.length ? "activated" : "started";

  return {
    ...projection,
    state,
    firstUseAt,
    lastUseAt,
    metadata: isNewer ? eventMetadata(event) : projection.metadata,
  };
}

function applyExperienceMilestone(
  projection: ExperienceLifecycleProjection,
  event: LifecycleEventEnvelope,
): ExperienceLifecycleProjection {
  const milestone = milestoneFromEvent(event);
  const milestones = mergeMilestone(projection.milestones, milestone);
  const exactDuplicate = milestones === projection.milestones;
  if (exactDuplicate) return projection;
  const activity = applyExperienceActivity(projection, event);
  const activation = milestone.activation;
  const firstMeaningfulUseAt = activation ? minTimestamp(projection.firstMeaningfulUseAt, event.occurredAt) : projection.firstMeaningfulUseAt;
  const lastMeaningfulUseAt = activation ? maxTimestamp(projection.lastMeaningfulUseAt, event.occurredAt) : projection.lastMeaningfulUseAt;
  return {
    ...activity,
    state: activation ? "activated" : activity.state,
    firstMeaningfulUseAt,
    lastMeaningfulUseAt,
    milestones,
    metadata: toMillis(event.occurredAt) >= toMillis(projection.metadata.sourceOccurredAt)
      ? eventMetadata(event)
      : projection.metadata,
  };
}

function applyExperienceInactivity(
  projection: ExperienceLifecycleProjection,
  event: LifecycleEventEnvelope,
): ExperienceLifecycleProjection {
  const latestActivity = Math.max(toMillis(projection.lastUseAt), toMillis(projection.lastMeaningfulUseAt));
  if (toMillis(event.occurredAt) < latestActivity) return projection;
  return {
    ...projection,
    state: "inactive",
    metadata: eventMetadata(event),
  };
}

function markCommercialRefresh(
  projection: CommercialLifecycleProjection,
  event: LifecycleEventEnvelope,
): CommercialLifecycleProjection {
  return {
    ...projection,
    metadata: eventMetadata(
      event,
      true,
      "Commercial event observed; current state must be refreshed from the trusted billing reconciler before it is authoritative.",
    ),
  };
}

function markCommunicationRefresh(
  projection: CustomerLifecycleProjection["communication"],
  event: LifecycleEventEnvelope,
): CustomerLifecycleProjection["communication"] {
  const stalePurpose = (current: CustomerLifecycleProjection["communication"]["email"]["marketing"]) => ({
    ...current,
    metadata: eventMetadata(
      event,
      true,
      "Communication outcome observed; current channel/purpose eligibility must be refreshed through D's evaluator.",
    ),
  });
  return {
    email: {
      transactional: stalePurpose(projection.email.transactional),
      marketing: stalePurpose(projection.email.marketing),
    },
  };
}

export function applyLifecycleEventToProjection(
  current: CustomerLifecycleProjection,
  value: unknown,
): LifecycleProjectionApplyResult {
  const { event, registration } = validateLifecycleProjectionEvent(value);

  if (event.organizationId !== current.organizationId || event.customerId !== current.customerId) {
    return {
      projection: current,
      applied: false,
      ignoredReason: event.customerId ? "wrong_scope" : "not_customer_scoped",
      refresh: { commercial: false, communication: false },
    };
  }
  if (event.dataMode !== current.dataMode) {
    return {
      projection: current,
      applied: false,
      ignoredReason: "wrong_mode",
      refresh: { commercial: false, communication: false },
    };
  }

  let projection = current;
  let applied = false;
  let commercialRefresh = false;
  let communicationRefresh = false;

  switch (registration.projectionPolicy) {
    case "identity": {
      const identity = applyIdentityEvent(current.identity, event);
      applied = identity !== current.identity;
      projection = applied ? { ...current, identity } : current;
      break;
    }
    case "onboarding": {
      const onboarding = applyOnboardingEvent(current.onboarding, event);
      applied = onboarding !== current.onboarding;
      projection = applied ? { ...current, onboarding } : current;
      break;
    }
    case "experience_activity": {
      const experience = applyExperienceActivity(current.experience, event);
      applied = JSON.stringify(experience) !== JSON.stringify(current.experience);
      projection = applied ? { ...current, experience } : current;
      break;
    }
    case "experience_milestone": {
      const experience = applyExperienceMilestone(current.experience, event);
      applied = JSON.stringify(experience) !== JSON.stringify(current.experience);
      projection = applied ? { ...current, experience } : current;
      break;
    }
    case "experience_inactivity": {
      const experience = applyExperienceInactivity(current.experience, event);
      applied = experience !== current.experience;
      projection = applied ? { ...current, experience } : current;
      break;
    }
    case "refresh_commercial": {
      const commercial = markCommercialRefresh(current.commercial, event);
      applied = true;
      commercialRefresh = true;
      projection = { ...current, commercial };
      break;
    }
    case "refresh_communication": {
      const communication = markCommunicationRefresh(current.communication, event);
      applied = true;
      communicationRefresh = true;
      projection = { ...current, communication };
      break;
    }
    case "none":
      return {
        projection: current,
        applied: false,
        ignoredReason: "not_projected",
        refresh: { commercial: false, communication: false },
      };
  }

  if (applied) {
    projection = {
      ...projection,
      updatedAt: maxTimestamp(current.updatedAt, event.receivedAt),
    };
  }

  return {
    projection,
    applied,
    refresh: { commercial: commercialRefresh, communication: communicationRefresh },
  };
}

function assertSnapshotScope(
  projection: CustomerLifecycleProjection,
  snapshot: { organizationId: string; customerId: string },
): void {
  if (snapshot.organizationId !== projection.organizationId || snapshot.customerId !== projection.customerId) {
    throw new Error("Lifecycle snapshot scope does not match projection scope.");
  }
}

export function applyAuthoritativeCommercialSnapshot(
  projection: CustomerLifecycleProjection,
  snapshot: AuthoritativeCommercialSnapshot,
  refreshedAt = new Date().toISOString(),
): CustomerLifecycleProjection {
  assertSnapshotScope(projection, snapshot);
  const authoritativeAt = projection.commercial.metadata.sourceOccurredAt;
  if (authoritativeAt && toMillis(snapshot.asOf) < toMillis(authoritativeAt)) return projection;
  return {
    ...projection,
    commercial: {
      state: snapshot.state,
      offerId: snapshot.offerId,
      offerVersion: snapshot.offerVersion,
      subscriptionId: snapshot.subscriptionId,
      trialEnd: snapshot.trialEnd,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      metadata: {
        provenance: "authoritative_snapshot",
        stale: false,
        updatedAt: refreshedAt,
        source: snapshot.source,
        sourceVersion: snapshot.version,
        sourceOccurredAt: snapshot.asOf,
      },
    },
    updatedAt: maxTimestamp(projection.updatedAt, refreshedAt),
  };
}

export function applyAuthoritativeCommunicationSnapshot(
  projection: CustomerLifecycleProjection,
  snapshot: AuthoritativeCommunicationEligibilitySnapshot,
  refreshedAt = new Date().toISOString(),
): CustomerLifecycleProjection {
  assertSnapshotScope(projection, snapshot);
  const newestCurrent = Math.max(
    toMillis(projection.communication.email.transactional.metadata.sourceOccurredAt),
    toMillis(projection.communication.email.marketing.metadata.sourceOccurredAt),
  );
  if (toMillis(snapshot.asOf) < newestCurrent) return projection;
  const makePurpose = (purpose: "transactional" | "marketing") => ({
    state: snapshot.email[purpose].state,
    reasonCodes: [...snapshot.email[purpose].reasonCodes],
    metadata: {
      provenance: "authoritative_snapshot" as const,
      stale: false,
      updatedAt: refreshedAt,
      source: snapshot.source,
      sourceVersion: snapshot.version,
      sourceOccurredAt: snapshot.asOf,
    },
  });
  return {
    ...projection,
    communication: {
      email: {
        transactional: makePurpose("transactional"),
        marketing: makePurpose("marketing"),
      },
    },
    updatedAt: maxTimestamp(projection.updatedAt, refreshedAt),
  };
}

export function applyCurrentStateBackfillSnapshot(
  projection: CustomerLifecycleProjection,
  snapshot: LifecycleCurrentStateBackfillSnapshot,
  refreshedAt = new Date().toISOString(),
): CustomerLifecycleProjection {
  assertSnapshotScope(projection, snapshot);
  const metadata: LifecycleProjectionMetadata = {
    provenance: "backfill_snapshot",
    stale: false,
    updatedAt: refreshedAt,
    source: "accepted-current-state",
    sourceVersion: snapshot.version,
    sourceOccurredAt: snapshot.asOf,
    note: "Current state was backfilled because historical event evidence was unavailable; no historical event was invented.",
  };
  return {
    ...projection,
    identity: snapshot.identity && projection.identity.metadata.provenance === "initial"
      ? { ...projection.identity, ...snapshot.identity, metadata }
      : projection.identity,
    onboarding: snapshot.onboarding && projection.onboarding.metadata.provenance === "initial"
      ? { ...projection.onboarding, ...snapshot.onboarding, metadata }
      : projection.onboarding,
    experience: snapshot.experience && projection.experience.metadata.provenance === "initial" ? {
      ...projection.experience,
      ...snapshot.experience,
      milestones: snapshot.experience.milestones ?? projection.experience.milestones,
      metadata,
    } : projection.experience,
    updatedAt: maxTimestamp(projection.updatedAt, refreshedAt),
  };
}

export function createLifecycleProjectionCheckpoint(input: {
  organizationId: string;
  customerId: string;
  dataMode: LifecycleProjectionCheckpoint["dataMode"];
  now?: string;
}): LifecycleProjectionCheckpoint {
  return {
    organizationId: input.organizationId,
    customerId: input.customerId,
    dataMode: input.dataMode,
    processorVersion: LIFECYCLE_PROCESSOR_VERSION,
    processedCount: 0,
    appliedCount: 0,
    rejectedCount: 0,
    maxReceiptLagMs: 0,
    revision: 0,
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

export function advanceLifecycleProjectionCheckpoint(
  checkpoint: LifecycleProjectionCheckpoint,
  event: LifecycleEventEnvelope,
  input: { applied: boolean; rejected?: boolean; processedAt?: string },
): LifecycleProjectionCheckpoint {
  const lag = Math.max(0, toMillis(event.receivedAt) - toMillis(event.occurredAt));
  const latestReceivedAt = maxTimestamp(checkpoint.latestReceivedAt, event.receivedAt);
  const latestOccurredAt = maxTimestamp(checkpoint.latestOccurredAt, event.occurredAt);
  const isLatestReceipt = latestReceivedAt === event.receivedAt;
  return {
    ...checkpoint,
    processedCount: checkpoint.processedCount + 1,
    appliedCount: checkpoint.appliedCount + (input.applied ? 1 : 0),
    rejectedCount: checkpoint.rejectedCount + (input.rejected ? 1 : 0),
    latestReceivedAt,
    latestOccurredAt,
    latestEventId: isLatestReceipt ? event.eventId : checkpoint.latestEventId,
    maxReceiptLagMs: Math.max(checkpoint.maxReceiptLagMs, lag),
    revision: checkpoint.revision + 1,
    updatedAt: input.processedAt ?? new Date().toISOString(),
  };
}

export function deriveLifecycleStageView(projection: CustomerLifecycleProjection): LifecycleAdminStageView {
  const candidates: Array<{ stage: 1 | 3 | 4 | 6; at: string | undefined; reason: string }> = [];
  if (projection.identity.state === "lead") {
    candidates.push({ stage: 1, at: projection.identity.metadata.sourceOccurredAt, reason: "Lead or identified acquisition relationship" });
  }
  if (projection.identity.state === "registered" || projection.identity.state === "verified" || projection.onboarding.state !== "unknown") {
    candidates.push({ stage: 3, at: projection.onboarding.metadata.sourceOccurredAt ?? projection.identity.metadata.sourceOccurredAt, reason: "Registration/onboarding evidence" });
  }
  if (projection.experience.state !== "unknown" && projection.experience.state !== "not_started") {
    candidates.push({ stage: 4, at: projection.experience.metadata.sourceOccurredAt, reason: "Experience activity evidence" });
  }
  if (projection.commercial.state !== "unknown" && projection.commercial.state !== "none") {
    candidates.push({ stage: 6, at: projection.commercial.metadata.sourceOccurredAt, reason: "Commercial relationship evidence" });
  }

  const activeStages = [...new Set(candidates.map((item) => item.stage))].sort((a, b) => a - b);
  const latest = [...candidates].sort((a, b) => toMillis(b.at) - toMillis(a.at) || b.stage - a.stage)[0];
  const labels: Record<number, string> = {
    1: "Marketing / acquisition",
    2: "Offers",
    3: "Registration + onboarding",
    4: "App Experience",
    5: "Secondary Experience",
    6: "Commercial relationship",
    7: "Feedback + referral",
  };
  return {
    nonAuthoritative: true,
    primaryStage: latest?.stage ?? null,
    activeStages,
    label: latest ? labels[latest.stage] : "Unknown lifecycle position",
    reasons: candidates.map((item) => item.reason),
  };
}

export function lifecycleDataQualityIndicators(
  projection: CustomerLifecycleProjection,
  checkpoint?: LifecycleProjectionCheckpoint,
): readonly LifecycleDataQualityIndicator[] {
  const indicators: LifecycleDataQualityIndicator[] = [];
  const staleDimensions = [
    projection.identity.metadata.stale,
    projection.onboarding.metadata.stale,
    projection.commercial.metadata.stale,
    projection.experience.metadata.stale,
    projection.communication.email.transactional.metadata.stale,
    projection.communication.email.marketing.metadata.stale,
  ].filter(Boolean).length;
  if (staleDimensions) {
    indicators.push({
      code: "projection_stale",
      count: staleDimensions,
      message: `${staleDimensions} lifecycle dimension(s) require authoritative refresh.`,
    });
  }
  if (projection.commercial.metadata.stale) {
    indicators.push({
      code: "missing_authoritative_snapshot",
      count: 1,
      message: "Commercial state is awaiting the trusted billing reconciler snapshot.",
    });
  }
  if (checkpoint?.rejectedCount) {
    indicators.push({
      code: "rejected_event",
      count: checkpoint.rejectedCount,
      message: `${checkpoint.rejectedCount} lifecycle event(s) were rejected during projection processing.`,
    });
  }
  if (checkpoint && checkpoint.maxReceiptLagMs > 5 * 60 * 1000) {
    indicators.push({
      code: "processing_delayed",
      count: 1,
      message: "At least one event arrived more than five minutes after its occurrence time.",
    });
  }
  return indicators;
}
