import { HttpsError } from "firebase-functions/v2/https";
import type { OrganizationCustomerProfileChanges, UpdateOrganizationCustomerProfileCommand } from "../../../shared/customer/contracts.js";
import { parseDataMode, parseOrganizationId } from "./validation.js";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "A profile update object is required.");
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new HttpsError("invalid-argument", `${field} must be text or null.`);
  const normalized = value.trim();
  if (normalized.length > max) throw new HttpsError("invalid-argument", `${field} is too long.`);
  return normalized || null;
}

function customerId(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 320 || value.includes("/")) {
    throw new HttpsError("invalid-argument", "customerId is invalid.");
  }
  return value.trim();
}

function idempotencyKey(value: unknown) {
  if (typeof value !== "string" || value.trim().length < 8 || value.length > 200) {
    throw new HttpsError("invalid-argument", "idempotencyKey is invalid.");
  }
  return value.trim();
}

function parseChanges(value: unknown): OrganizationCustomerProfileChanges {
  const source = record(value);
  const changes: OrganizationCustomerProfileChanges = {};
  for (const field of ["displayName", "firstName", "lastName", "phone", "company"] as const) {
    const parsed = optionalText(source[field], field, field === "phone" ? 40 : 160);
    if (parsed !== undefined) changes[field] = parsed;
  }
  if (source.customFields !== undefined) {
    const rawFields = record(source.customFields);
    const entries = Object.entries(rawFields);
    if (entries.length > 20) throw new HttpsError("invalid-argument", "Too many custom profile fields were supplied.");
    const customFields: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) throw new HttpsError("invalid-argument", "A custom profile field ID is invalid.");
      if (typeof value !== "string" || value.length > 500) throw new HttpsError("invalid-argument", `Custom profile field ${key} is invalid.`);
      customFields[key] = value.trim();
    }
    changes.customFields = customFields;
  }
  if (!Object.keys(changes).length) throw new HttpsError("invalid-argument", "At least one profile change is required.");
  return changes;
}

export function parseUpdateOrganizationCustomerProfileCommand(value: unknown): UpdateOrganizationCustomerProfileCommand {
  const source = record(value);
  return {
    organizationId: parseOrganizationId(source.organizationId),
    customerId: customerId(source.customerId),
    dataMode: parseDataMode(source.dataMode),
    idempotencyKey: idempotencyKey(source.idempotencyKey),
    changes: parseChanges(source.changes),
  };
}
