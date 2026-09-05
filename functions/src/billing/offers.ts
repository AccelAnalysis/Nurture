import { randomUUID } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createReleaseOneDefaultOffers } from "../../../shared/billing/defaults.js";
import type { CommercialOffer } from "../../../shared/billing/contracts.js";
import { stripeSecretKey } from "./config.js";
import {
  parseCommercialOffer,
  parseRequiredId,
  validateOfferForPublish,
} from "./model.js";
import {
  assertOrganizationCapability,
  getOfferRecord,
  listOfferRecords,
  offerRef,
  resolveCustomerId,
  saveOfferRecord,
  writeAuditEvent,
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
    return { offers };
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
    const now = new Date().toISOString();
    let created = 0;
    for (const template of createReleaseOneDefaultOffers(organizationId)) {
      const ref = offerRef(organizationId, template.id);
      if ((await ref.get()).exists) continue;
      const draft = { ...template, updatedAt: now };
      const record = template.status === "published"
        ? { draft, published: { ...draft, status: "published" as const, publishedAt: now }, updatedAt: now }
        : { draft: { ...draft, status: "draft" as const }, updatedAt: now };
      try {
        await ref.create(record);
        created += 1;
      } catch (error) {
        const code = (error as { code?: string | number }).code;
        if (code !== 6 && code !== "6" && code !== "already-exists") throw error;
      }
    }
    await writeAuditEvent({
      organizationId,
      actorUserId: userId,
      action: "billing.offers.defaults_seeded",
      targetType: "offer-set",
      context: { created },
    });
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
    await saveOfferRecord(organizationId, parsed.id, {
      draft,
      ...(existing?.published ? { published: existing.published } : {}),
      updatedAt: now,
    });
    await writeAuditEvent({
      organizationId,
      actorUserId: userId,
      action: "billing.offer.draft_saved",
      targetType: "offer",
      targetId: parsed.id,
      context: { version: draft.version, hasPublishedVersion: Boolean(existing?.published) },
    });
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
    validateOfferForPublish(record.draft);
    for (const price of record.draft.prices.filter((item) => item.active && item.unitAmountMinor > 0)) {
      await validateStripePriceMapping(price);
    }
    const now = new Date().toISOString();
    const version = (record.published?.version ?? 0) + 1;
    const published: CommercialOffer = {
      ...record.draft,
      status: "published",
      version,
      publishedAt: now,
      updatedAt: now,
    };
    await saveOfferRecord(organizationId, offerId, {
      draft: published,
      published,
      updatedAt: now,
    });
    await writeAuditEvent({
      organizationId,
      actorUserId: userId,
      action: "billing.offer.published",
      targetType: "offer",
      targetId: offerId,
      context: { version },
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
