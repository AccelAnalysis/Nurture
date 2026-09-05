import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { LifecycleEventSubmission } from "../../../shared/analytics/contracts.js";
import { createExperienceMilestoneRecorder } from "../../../shared/experience/lifecycle.js";
import {
  REFERENCE_EXPERIENCE_EVIDENCE_VALIDATORS,
  REFERENCE_EXPERIENCE_MILESTONE_DEFINITIONS,
} from "../../../shared/experience/reference-lifecycle.js";
import { createRecordExperienceMilestoneCallable } from "../experience-lifecycle.js";
import {
  firestoreLifecycleEventIntegrationPort,
  organizationCustomerBindingPort,
  secureLifecycleEventAppender,
} from "../platform/firestore-lifecycle.js";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request data must be an object.");
  return value as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, key: string, max = 256) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new HttpsError("invalid-argument", `${key} is invalid.`);
  return value.trim();
}

function verifiedIdentity(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  if (auth.token.email_verified !== true) throw new HttpsError("permission-denied", "Verify your email before recording lifecycle activity.");
  return auth.uid;
}

export const appendLifecycleEvent = onCall(async (request) => {
  const identityId = verifiedIdentity(request.auth as { uid: string; token: Record<string, unknown> } | undefined);
  const data = object(request.data);
  const organizationId = requiredString(data, "organizationId", 160);
  const submission = data.submission;
  if (!submission || typeof submission !== "object" || Array.isArray(submission)) throw new HttpsError("invalid-argument", "submission is required.");
  try {
    const result = await secureLifecycleEventAppender.appendAuthenticatedBrowserSubmission({
      organizationId,
      identityId,
      submission: submission as LifecycleEventSubmission,
      dataMode: "live",
    });
    return { status: result.status, eventId: result.event.eventId };
  } catch (error) {
    throw new HttpsError("permission-denied", error instanceof Error ? error.message : "Lifecycle event was rejected.");
  }
});

const experienceMilestoneRecorder = createExperienceMilestoneRecorder({
  definitions: REFERENCE_EXPERIENCE_MILESTONE_DEFINITIONS,
  evidenceValidators: REFERENCE_EXPERIENCE_EVIDENCE_VALIDATORS,
  bindingPort: organizationCustomerBindingPort,
  eventPort: firestoreLifecycleEventIntegrationPort,
});

export const recordExperienceMilestone = createRecordExperienceMilestoneCallable({
  recorder: experienceMilestoneRecorder,
  resolveDataMode: () => "live",
});
