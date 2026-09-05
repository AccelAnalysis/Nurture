import {
  ANALYTICS_SCHEMA_VERSION,
  EVENT_CATALOG,
  MAX_EVENT_PAYLOAD_BYTES,
  type AnalyticsDataMode,
  type AnalyticsEventType,
  type CreateSubmissionOptions,
  type EventPayload,
  type ExperienceModuleEventType,
  type JsonValue,
  type LifecycleEventEnvelope,
  type LifecycleEventSource,
  type LifecycleEventSubmission,
  type LifecycleSubjectKind,
  type NurtureEventType,
  type TrustedEventBinding,
} from "./contracts.js";

const SECRET_KEY_PATTERN = /(^|_)(password|passcode|secret|token|authorization|cookie|card_?number|cvc|cvv|ssn|social_?security)($|_)/i;
const MODULE_EVENT_PATTERN = /^experience\.[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9_-]*)+$/;
const MODULE_EVENT_SOURCES: readonly LifecycleEventSource[] = ["browser", "domain_action", "trusted_server"];
const EVENT_SOURCES = new Set<LifecycleEventSource>([
  "browser",
  "domain_action",
  "provider_webhook",
  "trusted_server",
  "scheduler",
  "administrator",
]);
const DATA_MODES = new Set<AnalyticsDataMode>(["live", "test", "preview", "demo", "development"]);
const SUBJECT_KINDS = new Set<LifecycleSubjectKind>([
  "visitor",
  "lead",
  "identity",
  "customer",
  "organization",
  "offer",
  "subscription",
  "experience",
  "configuration",
]);

export class AnalyticsContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsContractError";
  }
}

function requireNonEmpty(label: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new AnalyticsContractError(`${label} is required.`);
  return normalized;
}

function requireString(label: string, value: unknown): string {
  if (typeof value !== "string") throw new AnalyticsContractError(`${label} must be a string.`);
  return requireNonEmpty(label, value);
}

function optionalString(label: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return requireString(label, value);
}

function assertIsoTimestamp(label: string, value: string): void {
  if (Number.isNaN(Date.parse(value))) throw new AnalyticsContractError(`${label} must be an ISO-compatible timestamp.`);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AnalyticsContractError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertJsonValue(value: unknown, path: string): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AnalyticsContractError(`${path} must contain only finite numbers.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new AnalyticsContractError(`${path}.${key} looks secret-bearing and must not be sent to analytics.`);
      }
      assertJsonValue(child, `${path}.${key}`);
    }
    return;
  }
  throw new AnalyticsContractError(`${path} must be JSON-serializable.`);
}

export function validateEventPayload(payload: EventPayload): EventPayload {
  assertJsonValue(payload, "payload");
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (bytes > MAX_EVENT_PAYLOAD_BYTES) {
    throw new AnalyticsContractError(`payload exceeds ${MAX_EVENT_PAYLOAD_BYTES} bytes.`);
  }
  return payload;
}

export function isNurtureEventType(value: unknown): value is NurtureEventType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EVENT_CATALOG, value);
}

export function isExperienceModuleEventType(value: unknown): value is ExperienceModuleEventType {
  return typeof value === "string" && !isNurtureEventType(value) && MODULE_EVENT_PATTERN.test(value);
}

export function isAnalyticsEventType(value: unknown): value is AnalyticsEventType {
  return isNurtureEventType(value) || isExperienceModuleEventType(value);
}

export function isLifecycleEventSource(value: unknown): value is LifecycleEventSource {
  return typeof value === "string" && EVENT_SOURCES.has(value as LifecycleEventSource);
}

export function isAnalyticsDataMode(value: unknown): value is AnalyticsDataMode {
  return typeof value === "string" && DATA_MODES.has(value as AnalyticsDataMode);
}

export function isLifecycleSubjectKind(value: unknown): value is LifecycleSubjectKind {
  return typeof value === "string" && SUBJECT_KINDS.has(value as LifecycleSubjectKind);
}

export function isSourceAllowedForEvent(eventType: AnalyticsEventType, source: LifecycleEventSource): boolean {
  if (isNurtureEventType(eventType)) {
    return (EVENT_CATALOG[eventType].allowedSources as readonly LifecycleEventSource[]).includes(source);
  }
  return isExperienceModuleEventType(eventType) && MODULE_EVENT_SOURCES.includes(source);
}

export function createLifecycleEventSubmission(
  eventType: AnalyticsEventType,
  payload: EventPayload = {},
  options: CreateSubmissionOptions = {},
  factories: { id?: () => string; now?: () => string } = {},
): LifecycleEventSubmission {
  if (!isAnalyticsEventType(eventType)) {
    throw new AnalyticsContractError(`Unknown or invalid event type: ${String(eventType)}.`);
  }

  const id = options.eventId ?? factories.id?.() ?? globalThis.crypto?.randomUUID?.();
  const occurredAt = options.occurredAt ?? factories.now?.() ?? new Date().toISOString();
  const eventId = requireNonEmpty("eventId", id);
  assertIsoTimestamp("occurredAt", occurredAt);
  validateEventPayload(payload);

  const correlationId = requireNonEmpty("correlationId", options.correlationId ?? options.sessionId ?? eventId);
  const idempotencyKey = requireNonEmpty("idempotencyKey", options.idempotencyKey ?? eventId);

  if (options.subjectHint) requireNonEmpty("subjectHint.id", options.subjectHint.id);

  return {
    eventId,
    eventType,
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    occurredAt,
    sessionId: options.sessionId,
    correlationId,
    idempotencyKey,
    dataMode: options.dataMode ?? "live",
    organizationIdHint: options.organizationIdHint,
    identityIdHint: options.identityIdHint,
    customerIdHint: options.customerIdHint,
    subjectHint: options.subjectHint,
    experienceId: options.experienceId,
    experienceModuleId: options.experienceModuleId,
    experienceModuleVersion: options.experienceModuleVersion,
    offerId: options.offerId,
    payload,
  };
}

export function bindLifecycleEvent(
  submission: LifecycleEventSubmission,
  binding: TrustedEventBinding,
  factories: { now?: () => string } = {},
): LifecycleEventEnvelope {
  const organizationId = requireNonEmpty("organizationId", binding.organizationId);
  if (!isAnalyticsEventType(submission.eventType)) {
    throw new AnalyticsContractError(`Unknown or invalid event type: ${String(submission.eventType)}.`);
  }
  if (submission.schemaVersion !== ANALYTICS_SCHEMA_VERSION) {
    throw new AnalyticsContractError(`Unsupported schema version: ${String(submission.schemaVersion)}.`);
  }
  if (!isSourceAllowedForEvent(submission.eventType, binding.source)) {
    throw new AnalyticsContractError(`${binding.source} is not an allowed source for ${submission.eventType}.`);
  }

  const receivedAt = binding.receivedAt ?? factories.now?.() ?? new Date().toISOString();
  assertIsoTimestamp("receivedAt", receivedAt);
  assertIsoTimestamp("occurredAt", submission.occurredAt);
  validateEventPayload(submission.payload);

  if (binding.subject) requireNonEmpty("subject.id", binding.subject.id);

  return {
    eventId: requireNonEmpty("eventId", submission.eventId),
    eventType: submission.eventType,
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    organizationId,
    subjectId: binding.subject?.id,
    subjectKind: binding.subject?.kind,
    identityId: binding.identityId,
    customerId: binding.customerId,
    experienceId: binding.experienceId ?? submission.experienceId,
    experienceModuleId: binding.experienceModuleId ?? submission.experienceModuleId,
    experienceModuleVersion: binding.experienceModuleVersion ?? submission.experienceModuleVersion,
    offerId: binding.offerId ?? submission.offerId,
    sessionId: submission.sessionId,
    occurredAt: submission.occurredAt,
    receivedAt,
    source: binding.source,
    correlationId: requireNonEmpty("correlationId", submission.correlationId),
    idempotencyKey: requireNonEmpty("idempotencyKey", submission.idempotencyKey),
    dataMode: binding.dataMode ?? submission.dataMode,
    payload: submission.payload,
  };
}

/**
 * Validates a materialized trusted envelope before durable persistence or before
 * handing it to Track E's EventIntegrationPort. This is also the convergence
 * check for server-side producers such as Track D billing reconciliation.
 */
export function validateLifecycleEventEnvelope(value: unknown): LifecycleEventEnvelope {
  const input = assertRecord(value, "event");
  const eventId = requireString("eventId", input.eventId);
  if (!isAnalyticsEventType(input.eventType)) {
    throw new AnalyticsContractError(`Unknown or invalid event type: ${String(input.eventType)}.`);
  }
  const eventType = input.eventType;
  if (input.schemaVersion !== ANALYTICS_SCHEMA_VERSION) {
    throw new AnalyticsContractError(`Unsupported schema version: ${String(input.schemaVersion)}.`);
  }

  const organizationId = requireString("organizationId", input.organizationId);
  const occurredAt = requireString("occurredAt", input.occurredAt);
  const receivedAt = requireString("receivedAt", input.receivedAt);
  assertIsoTimestamp("occurredAt", occurredAt);
  assertIsoTimestamp("receivedAt", receivedAt);

  if (!isLifecycleEventSource(input.source)) {
    throw new AnalyticsContractError(`Unknown lifecycle event source: ${String(input.source)}.`);
  }
  const source = input.source;
  if (!isSourceAllowedForEvent(eventType, source)) {
    throw new AnalyticsContractError(`${source} is not an allowed source for ${eventType}.`);
  }

  if (!isAnalyticsDataMode(input.dataMode)) {
    throw new AnalyticsContractError(`Unknown analytics data mode: ${String(input.dataMode)}.`);
  }
  const dataMode = input.dataMode;

  const subjectId = optionalString("subjectId", input.subjectId);
  let subjectKind: LifecycleSubjectKind | undefined;
  if (input.subjectKind !== undefined) {
    if (!isLifecycleSubjectKind(input.subjectKind)) {
      throw new AnalyticsContractError(`Unknown lifecycle subject kind: ${String(input.subjectKind)}.`);
    }
    subjectKind = input.subjectKind;
  }
  if (Boolean(subjectId) !== Boolean(subjectKind)) {
    throw new AnalyticsContractError("subjectId and subjectKind must be supplied together.");
  }

  const payloadInput = assertRecord(input.payload, "payload") as EventPayload;
  const payload = validateEventPayload(payloadInput);

  return {
    eventId,
    eventType,
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    organizationId,
    subjectId,
    subjectKind,
    identityId: optionalString("identityId", input.identityId),
    customerId: optionalString("customerId", input.customerId),
    experienceId: optionalString("experienceId", input.experienceId),
    experienceModuleId: optionalString("experienceModuleId", input.experienceModuleId),
    experienceModuleVersion: optionalString("experienceModuleVersion", input.experienceModuleVersion),
    offerId: optionalString("offerId", input.offerId),
    sessionId: optionalString("sessionId", input.sessionId),
    occurredAt,
    receivedAt,
    source,
    correlationId: requireString("correlationId", input.correlationId),
    idempotencyKey: requireString("idempotencyKey", input.idempotencyKey),
    dataMode,
    payload,
  };
}
