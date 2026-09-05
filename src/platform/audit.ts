export type AuditScope =
  | { kind: "platform" }
  | { kind: "organization"; organizationId: string };

export interface AuditTarget {
  type: string;
  id?: string;
  organizationId?: string;
  versionId?: string;
}

export interface AuditActor {
  kind: "user" | "service" | "provider" | "system";
  id: string;
}

export type AuditSource = "cloud-function" | "provider-webhook" | "trusted-service" | "system";

export type AuditScalar = string | number | boolean | null;
export type AuditValue = AuditScalar | AuditValue[] | { [key: string]: AuditValue };

export interface AuditChange {
  before?: AuditValue;
  after?: AuditValue;
  versionRef?: string;
  redactedFields?: readonly string[];
}

/**
 * A feature track may construct this request, but it must not choose the final
 * actor or authoritative timestamp. Trusted server code resolves those values
 * from verified identity / provider context before persisting AuditRecord.
 */
export interface AuditWriteRequest {
  schemaVersion: 1;
  action: string;
  scope: AuditScope;
  target: AuditTarget;
  reason?: string;
  change?: AuditChange;
  metadata?: { [key: string]: AuditValue };
  correlationId?: string;
  idempotencyKey?: string;
}

export interface AuditRecord extends AuditWriteRequest {
  id: string;
  actor: AuditActor;
  occurredAt: string;
  receivedAt?: string;
  source: AuditSource;
}

export interface AuditWriter {
  write(request: AuditWriteRequest): Promise<AuditRecord>;
}

const SENSITIVE_KEY = /(authorization|cookie|password|passcode|secret|token|api[-_]?key|client[-_]?secret|private[-_]?key|card|cvc|cvv|payment[-_]?method|bank|routing|ssn|social[-_]?security)/i;
const MAX_DEPTH = 4;
const MAX_OBJECT_KEYS = 30;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 1024;

function clippedString(value: string) {
  return value.length <= MAX_STRING_LENGTH ? value : `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`;
}

/**
 * Produce a bounded, JSON-safe value for audit context. This is defense in
 * depth, not permission to pass secrets into the audit pipeline: provider
 * secrets and raw credentials should never enter AuditWriteRequest at all.
 */
export function sanitizeAuditValue(value: unknown, depth = 0): AuditValue {
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return clippedString(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    const sanitized = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeAuditValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) sanitized.push(`[${value.length - MAX_ARRAY_ITEMS} more items]`);
    return sanitized;
  }

  if (typeof value === "object") {
    const result: { [key: string]: AuditValue } = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, item] of entries.slice(0, MAX_OBJECT_KEYS)) {
      result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeAuditValue(item, depth + 1);
    }
    if (entries.length > MAX_OBJECT_KEYS) {
      result.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
    }
    return result;
  }

  return `[unsupported:${typeof value}]`;
}

export function sanitizeAuditMetadata(value: Record<string, unknown> | undefined): { [key: string]: AuditValue } | undefined {
  if (!value) return undefined;
  return sanitizeAuditValue(value) as { [key: string]: AuditValue };
}

export function createAuditChange(before: unknown, after: unknown, versionRef?: string): AuditChange {
  return {
    before: sanitizeAuditValue(before),
    after: sanitizeAuditValue(after),
    ...(versionRef ? { versionRef } : {}),
  };
}
