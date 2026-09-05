import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { AnalyticsDataMode, EventPayload } from "../../shared/analytics/contracts.js";
import { validateEventPayload } from "../../shared/analytics/core.js";
import type {
  ExperienceMilestoneRecorder,
  ExperienceMilestoneRecordResult,
} from "../../shared/experience/lifecycle.js";

interface AuthenticatedMilestoneRequest {
  auth?: {
    uid: string;
    token: Record<string, unknown>;
  };
  data: unknown;
}

export interface ExperienceMilestoneCallableDependencies {
  recorder: ExperienceMilestoneRecorder;
  /**
   * Must derive the execution mode from trusted server/application context.
   * Browser request data is deliberately not accepted as mode authority.
   */
  resolveDataMode(request: AuthenticatedMilestoneRequest): Promise<AnalyticsDataMode> | AnalyticsDataMode;
}

function requestRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Experience milestone request must be an object.");
  }
  return value as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${key} is required.`);
  }
  if (value.length > 256) throw new HttpsError("invalid-argument", `${key} is too long.`);
  return value.trim();
}

function evidencePayload(value: unknown): EventPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "evidence must be an object.");
  }
  try {
    return validateEventPayload(value as EventPayload);
  } catch (error) {
    throw new HttpsError(
      "invalid-argument",
      error instanceof Error ? error.message : "Experience milestone evidence is invalid.",
    );
  }
}

function verifiedIdentity(request: AuthenticatedMilestoneRequest): string {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to record an Experience milestone.");
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Verify your email before recording a customer milestone.");
  }
  return request.auth.uid;
}

function mapRecorderResult(result: ExperienceMilestoneRecordResult) {
  if (result.status === "accepted") {
    return { status: "accepted" as const, eventId: result.eventId };
  }
  if (result.status === "failed") {
    throw new HttpsError(
      result.retryable ? "unavailable" : "internal",
      "The trusted milestone could not be recorded.",
    );
  }
  if (result.reason === "binding-unavailable" || result.reason === "binding-mismatch") {
    throw new HttpsError("permission-denied", "The Experience customer scope could not be verified.");
  }
  if (result.reason === "definition-unregistered" || result.reason === "validator-unavailable") {
    throw new HttpsError("failed-precondition", "The Experience milestone is not available for this module version.");
  }
  throw new HttpsError("invalid-argument", "The Experience milestone evidence was not accepted.");
}

/**
 * Track B callable factory. The Release 2 finisher owns the Functions export and
 * must compose this with E's trusted binding/event persistence adapter. No
 * browser-provided customerId, identityId, event source, or data mode is used.
 */
export function createRecordExperienceMilestoneCallable(deps: ExperienceMilestoneCallableDependencies) {
  return onCall(async (request) => {
    const identityId = verifiedIdentity(request as AuthenticatedMilestoneRequest);
    const data = requestRecord(request.data);
    const organizationId = requiredString(data, "organizationId");
    const experienceId = requiredString(data, "experienceId");
    const moduleId = requiredString(data, "moduleId");
    const moduleVersion = requiredString(data, "moduleVersion");
    const milestoneKey = requiredString(data, "milestoneKey");
    const actionId = requiredString(data, "actionId");
    const evidence = evidencePayload(data.evidence);
    const dataMode = await deps.resolveDataMode(request as AuthenticatedMilestoneRequest);

    const result = await deps.recorder.record({
      identityId,
      organizationId,
      experienceId,
      moduleId,
      moduleVersion,
      milestoneKey,
      actionId,
      evidence,
      correlationId: `experience-milestone:${actionId}`,
      dataMode,
    });
    return mapRecorderResult(result);
  });
}
