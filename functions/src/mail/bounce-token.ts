import { createHmac, timingSafeEqual } from "node:crypto";

function uuidToHex(value: string) {
  const normalized = value.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) throw new Error("Bounce delivery id must be a UUID.");
  return normalized.replace(/-/g, "");
}

function hexToUuid(value: string) {
  if (!/^[0-9a-f]{32}$/.test(value)) throw new Error("Bounce token delivery id is invalid.");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function signature(payload: string, secret: string) {
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("Bounce token secret must contain at least 32 bytes.");
  return createHmac("sha256", secret).update(`nurture-mail-bounce:v1:${payload}`).digest().subarray(0, 12).toString("base64url");
}

export function createBounceToken(deliveryId: string, secret: string) {
  const payload = uuidToHex(deliveryId);
  return `b+${payload}.${signature(payload, secret)}`;
}

export function parseBounceToken(token: string, secret: string) {
  const match = token.match(/^b\+([0-9a-f]{32})\.([A-Za-z0-9_-]{16})$/);
  if (!match) throw new Error("Bounce token is malformed.");
  const payload = match[1]!;
  const provided = Buffer.from(match[2]!, "utf8");
  const expected = Buffer.from(signature(payload, secret), "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error("Bounce token signature is invalid.");
  return { deliveryId: hexToUuid(payload) };
}

export function createBounceAddress(deliveryId: string, mailFromDomain: string, secret: string) {
  const domain = mailFromDomain.trim().toLowerCase().replace(/\.$/, "");
  if (!domain || /[\s@]/.test(domain)) throw new Error("MAIL FROM domain is invalid.");
  return `${createBounceToken(deliveryId, secret)}@${domain}`;
}
