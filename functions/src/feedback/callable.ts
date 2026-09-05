import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { FeedbackError } from "../../../shared/feedback/contracts.js";
import { invariant, onlyKeys, record } from "../../../shared/feedback/validation.js";
import { feedbackCommands, type FeedbackRequestContext } from "./commands.js";
import type { FeedbackDependencies } from "./ports.js";

export type { FeedbackRequestContext } from "./commands.js";

export interface FeedbackBoundary {
  /** Use the existing verified domain/organization mapping; never trust organizationId or dataMode from JSON. */
  resolve(request: CallableRequest<unknown>, applicationKey: unknown): Promise<FeedbackRequestContext>;
  /** Existing abuse/cap service must rate-limit anonymous and authenticated calls before token lookup. */
  rateLimit(request: CallableRequest<unknown>, context: FeedbackRequestContext): Promise<void>;
}
export function createFeedbackCallable(deps: FeedbackDependencies, boundary: FeedbackBoundary, secretNames: string[] = []) {
  const command = feedbackCommands(deps);
  return onCall({ region: "us-central1", enforceAppCheck: true, maxInstances: 10, secrets: secretNames }, async request => {
    try {
      invariant(request.app, "permission-denied");
      const body = record(request.data); onlyKeys(body,["applicationKey","action","payload"]);
      const context = await boundary.resolve(request,body.applicationKey);
      await boundary.rateLimit(request,context);
      return await command(context,{ action: body.action, payload: body.payload });
    } catch (error) {
      // Never echo raw tokens, answer text, provider failures, UID or customer IDs in errors/logs.
      if (error instanceof FeedbackError) {
        const code = error.code === "permission-denied" ? "permission-denied" : error.code === "invalid-input" ? "invalid-argument" : error.code === "conflict" ? "aborted" : "failed-precondition";
        throw new HttpsError(code, "Feedback action could not be completed.", { reason: error.code });
      }
      throw new HttpsError("internal", "Feedback is temporarily unavailable.");
    }
  });
}
