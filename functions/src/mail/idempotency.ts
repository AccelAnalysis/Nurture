import { createHash } from "node:crypto";

/**
 * Stable UUID-shaped identity derived from trusted tenant + logical effect key.
 * This is not a secret and is used only as a deterministic spool identity.
 */
export function mailDeliveryIdForEffect(organizationId: string, idempotencyKey: string) {
  const org = organizationId.trim();
  const key = idempotencyKey.trim();
  if (!org || !key) throw new Error("Mail submission requires organization and idempotency identities.");
  const bytes = createHash("sha256").update(`nurture-mail:v1:${org}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // UUID version 5 shape (name-derived).
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant.
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
