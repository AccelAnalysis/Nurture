import { createHash, createHmac, randomUUID } from "node:crypto";
import { invariant } from "../../../shared/feedback/validation.js";
/** Resolve retained keys from the server secret boundary; never environment values beginning VITE_. */
export function feedbackCrypto(activeKeyId: string, secretForKey: (id: string) => Uint8Array) {
  invariant(/^[A-Za-z0-9_-]{1,80}$/.test(activeKeyId), "invalid-input");
  return {
    tokenKeyId: activeKeyId,
    now: () => Date.now(),
    randomId: () => randomUUID(),
    digest: (value: string) => createHash("sha256").update(value, "utf8").digest("hex"),
    token: (keyId: string, purpose: string) => {
      const secret = secretForKey(keyId); invariant(secret.byteLength >= 32, "unavailable", "Token key is unavailable.");
      return createHmac("sha256", secret).update(purpose, "utf8").digest("base64url");
    },
  };
}
