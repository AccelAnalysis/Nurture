import { twilioAccountSid, twilioAuthToken } from "./config.js";

export function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function getTwilioCredentials() {
  const accountSid = twilioAccountSid.value().trim();
  const authToken = twilioAuthToken.value().trim();
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !authToken) throw new Error("Twilio server credentials are not configured.");
  return { accountSid, authToken };
}

function authorization() {
  const { accountSid, authToken } = getTwilioCredentials();
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`, "utf8").toString("base64")}`;
}

export async function twilioRequest(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: authorization(), ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 500) }; }
  }
  if (!response.ok) {
    const record = objectRecord(data);
    const message = typeof record.message === "string" ? record.message : `Twilio request failed (${response.status}).`;
    const error = new Error(`Twilio: ${message}`) as Error & { status?: number; providerCode?: string };
    error.status = response.status;
    if (typeof record.code === "number" || typeof record.code === "string") error.providerCode = String(record.code);
    throw error;
  }
  return { data: objectRecord(data), status: response.status, headers: response.headers };
}

export async function twilioForm(url: string, values: Record<string, string | number | boolean | undefined>, method = "POST") {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) body.set(key, String(value));
  return twilioRequest(url, {
    method,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function twilioJson(url: string, value: unknown, method = "POST") {
  return twilioRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

export function requireTwilioSid(value: unknown, prefix: string, field: string) {
  if (typeof value !== "string" || !new RegExp(`^${prefix}[0-9a-fA-F]{32}$`).test(value)) throw new Error(`Twilio did not return a valid ${field}.`);
  return value;
}
