import { FeedbackError } from "../../../shared/feedback/contracts.js";
import { createFeedbackComposition } from "./composition.js";

export const RELEASE4_R3_BASE_SHA = "7dfc66c1892c44661d77869865d94a08ad82e95f" as const;
export const RELEASE4_FEEDBACK_TOKEN_SECRET = "R4_FEEDBACK_TOKEN_KEY_V1" as const;
export const RELEASE4_FEEDBACK_TOKEN_KEY_ID = "v1" as const;

/**
 * Constructs Release 4 against the immutable merged Release 3 base. The secret
 * value is resolved only while a deployed function that declares the secret is
 * executing; it is never read into the browser or committed to source.
 */
export function createRelease4FeedbackComposition() {
  return createFeedbackComposition({
    release3AcceptedSha: RELEASE4_R3_BASE_SHA,
    tokenKeyId: RELEASE4_FEEDBACK_TOKEN_KEY_ID,
    tokenSecret(keyId) {
      if (keyId !== RELEASE4_FEEDBACK_TOKEN_KEY_ID) throw new FeedbackError("unavailable", "Feedback token key version is unavailable.");
      const value = process.env[RELEASE4_FEEDBACK_TOKEN_SECRET];
      if (!value || Buffer.byteLength(value, "utf8") < 32) throw new FeedbackError("unavailable", "Feedback token secret is unavailable.");
      return Buffer.from(value, "utf8");
    },
  });
}
