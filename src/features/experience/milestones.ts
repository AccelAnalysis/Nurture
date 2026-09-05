import { httpsCallable, type Functions } from "firebase/functions";
import type {
  ExperienceMilestoneRequest,
  ExperienceMilestoneResult,
  ExperienceMilestoneSource,
} from "./contracts";

interface CallableMilestoneResponse {
  status?: unknown;
  eventId?: unknown;
}

function parseMilestoneResponse(value: unknown): ExperienceMilestoneResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "unavailable", reason: "The trusted milestone response was invalid." };
  }
  const response = value as CallableMilestoneResponse;
  const eventId = typeof response.eventId === "string" ? response.eventId : undefined;
  if (response.status === "accepted") return { status: "accepted", eventId };
  if (response.status === "duplicate") return { status: "duplicate", eventId };
  return { status: "unavailable", reason: "The trusted milestone response was not accepted." };
}

/**
 * Client adapter only. Firebase Auth supplies identity to the callable; this
 * request contains no customerId/identityId/source/mode authority. The server
 * factory in `functions/src/experience-lifecycle.ts` must be composed with E/F.
 */
export function createFirebaseExperienceMilestoneSource(
  functions: Functions,
  callableName = "recordExperienceMilestone",
): ExperienceMilestoneSource {
  const recordMilestone = httpsCallable<ExperienceMilestoneRequest, CallableMilestoneResponse>(
    functions,
    callableName,
  );

  return {
    async record(request) {
      try {
        const response = await recordMilestone(request);
        return parseMilestoneResponse(response.data);
      } catch {
        return {
          status: "unavailable",
          reason: "The trusted Experience milestone service is unavailable.",
        };
      }
    },
  };
}
