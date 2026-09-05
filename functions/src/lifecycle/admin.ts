import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { AnalyticsDataMode, AnalyticsEventType } from "../../../shared/analytics/contracts.js";
import type {
  CustomerTimelineCategory,
  LifecycleCustomerFilters,
  LifecycleReadAuthorizationPort,
} from "../../../shared/lifecycle/contracts.js";
import { createLifecycleQueryService, LifecycleQueryError } from "../../../shared/lifecycle/query.js";
import { assertOrganizationCapability } from "../billing/store.js";
import { acquisitionRuntimeStore } from "../acquisition/firestore-store.js";
import {
  getLifecycleWorkspaceView,
  publishLifecycleDraft,
  saveLifecycleDraft,
  type LifecycleAutomationConfigurationRecord,
} from "../acquisition/definitions.js";
import { db } from "../firebase.js";
import {
  lifecycleCustomerAliasPort,
  lifecycleProjectionStore,
  lifecycleTimelineEventStore,
} from "./firestore-store.js";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request data must be an object.");
  return value as Record<string, unknown>;
}
function string(input: Record<string, unknown>, key: string, max = 160) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new HttpsError("invalid-argument", `${key} is invalid.`);
  return value.trim();
}
function uid(request: { auth?: { uid: string } }) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  return request.auth.uid;
}
function mode(value: unknown): AnalyticsDataMode {
  if (value === undefined || value === null || value === "") return "live";
  if (value === "live" || value === "test" || value === "preview" || value === "demo" || value === "development") return value;
  throw new HttpsError("invalid-argument", "dataMode is invalid.");
}
function limit(value: unknown, fallback = 50) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 100) throw new HttpsError("invalid-argument", "limit must be between 1 and 100.");
  return value as number;
}
function optionalString(value: unknown, max = 2000) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > max) throw new HttpsError("invalid-argument", "String value is invalid.");
  return value;
}
function stringArray<T extends string>(value: unknown, maxItems = 50): readonly T[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string")) throw new HttpsError("invalid-argument", "Array value is invalid.");
  return [...new Set(value)] as T[];
}

const lifecycleReadAuthorization: LifecycleReadAuthorizationPort = {
  async authorize(request) {
    try {
      await assertOrganizationCapability(request.organizationId, request.actorIdentityId, request.capability);
      return { allowed: true, detailLevel: "standard", allowedModes: ["live", "test"] };
    } catch {
      return { allowed: false, reason: "forbidden" };
    }
  },
};

const lifecycleQueries = createLifecycleQueryService({
  authorization: lifecycleReadAuthorization,
  projections: lifecycleProjectionStore,
  events: lifecycleTimelineEventStore,
  aliases: lifecycleCustomerAliasPort,
});

function lifecycleError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof LifecycleQueryError) {
    if (error.code === "not-found") throw new HttpsError("not-found", error.message);
    if (error.code === "forbidden" || error.code === "mode-forbidden") throw new HttpsError("permission-denied", error.message);
    throw new HttpsError("invalid-argument", error.message);
  }
  throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "Lifecycle operation failed.");
}

export const listLifecycleCustomerSummaries = onCall(async (request) => {
  try {
    const data = object(request.data);
    return await lifecycleQueries.listCustomerSummaries({
      organizationId: string(data, "organizationId"),
      actorIdentityId: uid(request),
      dataMode: mode(data.dataMode),
      limit: limit(data.limit),
      cursor: optionalString(data.cursor, 1000),
      filters: data.filters && typeof data.filters === "object" && !Array.isArray(data.filters)
        ? data.filters as LifecycleCustomerFilters
        : undefined,
    });
  } catch (error) { return lifecycleError(error); }
});

export const getLifecycleCustomerSummary = onCall(async (request) => {
  try {
    const data = object(request.data);
    return await lifecycleQueries.getCustomerSummary({
      organizationId: string(data, "organizationId"),
      customerId: string(data, "customerId"),
      actorIdentityId: uid(request),
      dataMode: mode(data.dataMode),
    });
  } catch (error) { return lifecycleError(error); }
});

export const getLifecycleCustomerTimeline = onCall(async (request) => {
  try {
    const data = object(request.data);
    return await lifecycleQueries.getCustomerTimeline({
      organizationId: string(data, "organizationId"),
      customerId: string(data, "customerId"),
      actorIdentityId: uid(request),
      dataMode: mode(data.dataMode),
      limit: limit(data.limit),
      cursor: optionalString(data.cursor, 1000),
      eventTypes: stringArray<AnalyticsEventType>(data.eventTypes),
      categories: stringArray<CustomerTimelineCategory>(data.categories, 20),
    });
  } catch (error) { return lifecycleError(error); }
});

export const getLifecycleAutomationWorkspace = onCall(async (request) => {
  try {
    const data = object(request.data);
    const organizationId = string(data, "organizationId");
    await assertOrganizationCapability(organizationId, uid(request), "lifecycle.view");
    return await getLifecycleWorkspaceView(organizationId);
  } catch (error) { return lifecycleError(error); }
});

export const saveLifecycleAutomationDraft = onCall(async (request) => {
  try {
    const data = object(request.data);
    const organizationId = string(data, "organizationId");
    const actor = uid(request);
    await assertOrganizationCapability(organizationId, actor, "lifecycle.manage");
    if (!Array.isArray(data.draft)) throw new HttpsError("invalid-argument", "draft must be an array.");
    if (!Number.isInteger(data.expectedRevision) || (data.expectedRevision as number) < 1) throw new HttpsError("invalid-argument", "expectedRevision is invalid.");
    return await saveLifecycleDraft({
      organizationId,
      draft: data.draft as LifecycleAutomationConfigurationRecord[],
      expectedRevision: data.expectedRevision as number,
    });
  } catch (error) { return lifecycleError(error); }
});

export const publishLifecycleAutomationDraft = onCall(async (request) => {
  try {
    const data = object(request.data);
    const organizationId = string(data, "organizationId");
    const actor = uid(request);
    await assertOrganizationCapability(organizationId, actor, "lifecycle.manage");
    if (!Number.isInteger(data.expectedRevision) || (data.expectedRevision as number) < 1) throw new HttpsError("invalid-argument", "expectedRevision is invalid.");
    return await publishLifecycleDraft({ organizationId, expectedRevision: data.expectedRevision as number, actorIdentityId: actor });
  } catch (error) { return lifecycleError(error); }
});

export const getAcquisitionOperations = onCall(async (request) => {
  try {
    const data = object(request.data);
    const organizationId = string(data, "organizationId");
    await assertOrganizationCapability(organizationId, uid(request), "lifecycle.view");
    return await acquisitionRuntimeStore.getOperationsSnapshot({ organizationId, dataMode: mode(data.dataMode), limit: limit(data.limit, 50) });
  } catch (error) { return lifecycleError(error); }
});

export const setOrganizationAcquisitionPause = onCall(async (request) => {
  try {
    const data = object(request.data);
    const organizationId = string(data, "organizationId");
    const actor = uid(request);
    await assertOrganizationCapability(organizationId, actor, "lifecycle.manage");
    if (typeof data.paused !== "boolean") throw new HttpsError("invalid-argument", "paused must be boolean.");
    const at = new Date().toISOString();
    await db.collection("organizations").doc(organizationId).collection("acquisitionControl").doc("runtime").set({
      paused: data.paused,
      updatedAt: at,
      updatedBy: actor,
    }, { merge: true });
    return { organizationId, paused: data.paused, updatedAt: at };
  } catch (error) { return lifecycleError(error); }
});
