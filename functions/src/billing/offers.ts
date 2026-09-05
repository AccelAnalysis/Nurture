import { randomUUID } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createReleaseOneDefaultOffers } from "../../../shared/billing/defaults.js";
import type { CommercialOffer } from "../../../shared/billing/contracts.js";
import { billingTrialsEnabled, stripeSecretKey } from "./config.js";
import { resolveCustomerId } from "./customer-binding.js";
import {
  parseCommercialOffer,
  parseRequiredId,
  validateOfferForPublish,
} from "./model.js";
import {
  assertOrganizationCapability,
  getOfferRecord,
  listOfferRecords,
  publishOfferWithAudit,
  saveOfferDraftWithAudit,
  seedOfferWithAudit,
  writeLifecycleEvent,
} from "./store.js";
import { validateStripePriceMapping } from "./stripe-adapter.js";

function dataRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request data must be an object.");
  return value as Record<string, unknown>;
}

function requireUserId(auth: { uid: string } | undefined) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in to continue.");
  return auth.uid;
}

function asPrecondition(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "The offer operation could not be completed.");
}

export const listPublishedOffers = onCall(async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = parseRequiredId(data.organizationId, "organizationId");
    const records = await listOfferRecords(organizationId);
    let customerId: string | null = null;
    if (request.auth) {
      try {
        customerId = await resolveCustomerId(organizationId, request.auth.uid);
      } catch {
        customerId = null;
      }
    }
    const offers = records
      .map((item) => item.published)
      .filter((offer): offer is CommercialOffer => Boolean(
        offer
        && offer.status === "published"
        && (offer.visibility === "public" || (customerId && offer.visibility === "authenticated")),
      ))
      .sort((a, b) => a.order - b.order);
    return { offers, trialsEnabled: billingTrialsEnabled.value() };
  } catch (error) {
    asPrecondition(error);
  }
});

export const listOrganizationOffers = onCall(async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = parseRequiredId(data.organizationId, "organizationId");
    const userId = requireUserId(request.auth);
    await assertOrganizationCapability(organizationId, userId, "offers.view");
    const records = await listOfferRecords(organizationId);
    return { offers: records.map((item) => item.draft).sort((a, b) => a.order - b.order) };
  } catch (error) {
    asPrecondition(error);
  }
});

export const seedReleaseOneOffers = onCall(async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = parseRequiredId(data.organizationId, "organizationId");
    const userId = requireUserId(request.auth);
    await assertOrganizationCapability(organizationId, userId, "offers.manage");
    let created = 0;
    for (const template of createReleaseOneDefaultOffers(organizationId)) {
      if (await seedOfferWithAudit({ organizationId, template, actorUserId: userId })) created += 1;
    }
    return { created };
  } catch (error) {
    asPrecondition(error);
  }
});

export const saveOfferDraft = onCall(async (request) => {
  try {
    const data = dataRecord(request.data);
    const rawOffer = data.offer;
    const raw = dataRecord(rawOffer);
    const organizationId = parseRequiredId(raw.organizationId, "offer.organizationId");
    const userId = requireUserId(request.auth);
    await assertOrganizationCapability(organizationId, userId, "offers.manage");
    const parsed = parseCommercialOffer(rawOffer, organizationId);
    const existing = await getOfferRecord(organizationId, parsed.id);
    const now = new Date().toISOString();
    const draft: CommercialOffer = {
      ...parsed,
      status: "draft",
      version: existing?.published?.version ?? parsed.version,
      updatedAt: now,
    };
    await saveOfferDraftWithAudit({ organizationId, offer: draft, actorUserId: userId });
    return { offer: draft };
  } catch (error) {
    asPrecondition(error);
  }
});

export const publishOffer = onCall({ secrets: [stripeSecretKey] }, async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = parseRequiredId(data.organizationId, "organizationId");
    const offerId = parseRequiredId(data.offerId, "offerId");
    const userId = requireUserId(request.auth);
    await assertOrganizationCapability(organizationId, userId, "offers.publish");
    const record = await getOfferRecord(organizationId, offerId);
    if (!record) throw new HttpsError("not-found", "Offer not found.");
    if (record.draft.status === "published" && record.published?.updatedAt === record.draft.updatedAt) {
      return { offer: record.published };
    }
    validateOfferForPublish(record.draft);
    for (const price of record.draft.prices.filter((item) => item.active && item.unitAmountMinor > 0)) {
      await validateStripePriceMapping(price);
    }
    const published = await publishOfferWithAudit({
      organizationId,
      offerId,
      expectedDraftUpdatedAt: record.draft.updatedAt,
      actorUserId: userId,
    });
    return { offer: published };
  } catch (error) {
    asPrecondition(error);
  }
});

export const recordOfferViewed = onCall(async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = parseRequiredId(data.organizationId, "organizationId");
    const offerId = parseRequiredId(data.offerId, "offerId");
    const record = await getOfferRecord(organizationId, offerId);
    if (!record?.published || record.published.status !== "published" || record.published.visibility !== "public") {
      throw new HttpsError("not-found", "Published offer not found.");
    }
    const correlationId = randomUUID();
    await writeLifecycleEvent({
      eventType: "offer.viewed",
      organizationId,
      subjectKind: "offer",
      subjectId: offerId,
      offerId,
      source: "browser",
      correlationId,
      idempotencyKey: correlationId,
      payload: {},
    });
    return { accepted: true as const };
  } catch (error) {
    asPrecondition(error);
  }
});
