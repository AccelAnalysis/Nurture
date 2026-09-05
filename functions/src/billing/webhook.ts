import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import type Stripe from "stripe";
import { db } from "../firebase.js";
import { getStripeClient, stripeSecretKey, stripeWebhookSecret } from "./config.js";
import {
  isStaleProviderEvent,
  subscriptionLifecycleEvent,
  type ProviderEventRecord,
  type StoredSubscription,
} from "./model.js";
import {
  billingCustomerRef,
  offerRef,
  providerEventRef,
  subscriptionRef,
} from "./store.js";
import { subscriptionSnapshotFromStripe } from "./stripe-adapter.js";

function requiredMetadata(metadata: Stripe.Metadata, key: string) {
  const value = metadata[key]?.trim();
  if (!value) throw new Error(`Stripe metadata is missing ${key}.`);
  return value;
}

function stripeCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!customer) throw new Error("Stripe object is missing its Customer.");
  return typeof customer === "string" ? customer : customer.id;
}

function providerRecord(event: Stripe.Event, outcome: ProviderEventRecord["outcome"], extra: Partial<ProviderEventRecord> = {}): ProviderEventRecord {
  return {
    provider: "stripe",
    eventId: event.id,
    eventType: event.type,
    providerCreated: event.created,
    outcome,
    processedAt: new Date().toISOString(),
    ...extra,
  };
}

async function rejectProviderEvent(event: Stripe.Event, reason: string) {
  const ref = providerEventRef(event.id);
  await db.runTransaction(async (transaction) => {
    if ((await transaction.get(ref)).exists) return;
    transaction.create(ref, providerRecord(event, "rejected", { reason: reason.slice(0, 500) }));
  });
  logger.error("Rejected Stripe billing event", { eventId: event.id, eventType: event.type, reason });
}

async function handleCheckoutCompleted(event: Stripe.Event, session: Stripe.Checkout.Session) {
  if (session.livemode) throw new Error("Release 1 rejects live-mode Checkout events.");
  const organizationId = requiredMetadata(session.metadata ?? {}, "nurtureOrganizationId");
  const customerId = requiredMetadata(session.metadata ?? {}, "nurtureCustomerId");
  const offerId = requiredMetadata(session.metadata ?? {}, "nurtureOfferId");
  const providerCustomerId = stripeCustomerId(session.customer);

  const [mappingSnapshot, offerSnapshot, checkoutSnapshot] = await Promise.all([
    billingCustomerRef(organizationId, customerId).get(),
    offerRef(organizationId, offerId).get(),
    db.collection("organizations").doc(organizationId).collection("billingCheckoutSessions").doc(session.id).get(),
  ]);
  const mapping = mappingSnapshot.data();
  if (!mappingSnapshot.exists || mapping?.providerCustomerId !== providerCustomerId) throw new Error("Checkout Customer does not match the Nurture billing mapping.");
  const offerRecord = offerSnapshot.data();
  if (!offerSnapshot.exists || !offerRecord?.published || offerRecord.published.status !== "published") throw new Error("Checkout Offer is not a published Nurture Offer.");
  const checkout = checkoutSnapshot.data();
  if (!checkoutSnapshot.exists || checkout?.customerId !== customerId || checkout?.offerId !== offerId) throw new Error("Checkout Session was not initiated by the trusted Nurture billing boundary.");

  const eventRef = providerEventRef(event.id);
  const lifecycleRef = db.collection("organizations").doc(organizationId).collection("lifecycleEvents").doc(`stripe-${event.id}`);
  await db.runTransaction(async (transaction) => {
    if ((await transaction.get(eventRef)).exists) return;
    const receivedAt = new Date().toISOString();
    transaction.create(eventRef, providerRecord(event, "processed", { organizationId }));
    transaction.set(lifecycleRef, {
      eventId: lifecycleRef.id,
      eventType: "checkout.completed",
      schemaVersion: 1,
      organizationId,
      subjectId: customerId,
      subjectKind: "customer",
      customerId,
      offerId,
      occurredAt: new Date(event.created * 1000).toISOString(),
      receivedAt,
      source: "provider_webhook",
      correlationId: session.id,
      idempotencyKey: `stripe:${event.id}:checkout.completed`,
      dataMode: "test",
      payload: { provider: "stripe", providerSessionId: session.id },
    });
  });
}

async function handleSubscriptionEvent(event: Stripe.Event, subscription: Stripe.Subscription) {
  if (subscription.livemode) throw new Error("Release 1 rejects live-mode subscription events.");
  const organizationId = requiredMetadata(subscription.metadata, "nurtureOrganizationId");
  const customerId = requiredMetadata(subscription.metadata, "nurtureCustomerId");
  const offerId = requiredMetadata(subscription.metadata, "nurtureOfferId");
  const providerCustomerId = stripeCustomerId(subscription.customer);

  const [mappingSnapshot, offerSnapshot] = await Promise.all([
    billingCustomerRef(organizationId, customerId).get(),
    offerRef(organizationId, offerId).get(),
  ]);
  const mapping = mappingSnapshot.data();
  if (!mappingSnapshot.exists || mapping?.providerCustomerId !== providerCustomerId) throw new Error("Subscription Customer does not match the Nurture billing mapping.");
  const record = offerSnapshot.data();
  if (!offerSnapshot.exists || !record?.published || record.published.status !== "published") throw new Error("Subscription Offer is not a published Nurture Offer.");

  const snapshot = subscriptionSnapshotFromStripe({
    subscription,
    offer: record.published,
    organizationId,
    customerId,
    providerEventId: event.id,
  });
  const eventRef = providerEventRef(event.id);
  const currentRef = subscriptionRef(organizationId, subscription.id);
  const lifecycleRef = db.collection("organizations").doc(organizationId).collection("lifecycleEvents").doc(`stripe-${event.id}`);

  await db.runTransaction(async (transaction) => {
    const [seen, current] = await Promise.all([transaction.get(eventRef), transaction.get(currentRef)]);
    if (seen.exists) return;
    const previous = current.exists ? current.data() as StoredSubscription : null;
    if (isStaleProviderEvent(previous?.lastProviderEventCreated, event.created)) {
      transaction.create(eventRef, providerRecord(event, "ignored_stale", {
        organizationId,
        providerSubscriptionId: subscription.id,
      }));
      return;
    }

    const eventType = subscriptionLifecycleEvent(previous, snapshot, event.type);
    const now = new Date().toISOString();
    transaction.set(currentRef, {
      ...snapshot,
      lastProviderEventCreated: event.created,
      updatedAt: now,
    });
    transaction.create(eventRef, providerRecord(event, "processed", {
      organizationId,
      providerSubscriptionId: subscription.id,
    }));
    transaction.set(lifecycleRef, {
      eventId: lifecycleRef.id,
      eventType,
      schemaVersion: 1,
      organizationId,
      subjectId: subscription.id,
      subjectKind: "subscription",
      customerId,
      offerId,
      occurredAt: new Date(event.created * 1000).toISOString(),
      receivedAt: now,
      source: "provider_webhook",
      correlationId: subscription.id,
      idempotencyKey: `stripe:${event.id}:${eventType}`,
      dataMode: "test",
      payload: {
        provider: "stripe",
        status: snapshot.status,
        billingInterval: snapshot.billingInterval,
        currency: snapshot.currency,
        unitAmountMinor: snapshot.unitAmountMinor,
      },
    });
  });
}

export const stripeBillingWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (request, response) => {
    const signature = request.get("stripe-signature");
    if (!signature) {
      response.status(400).send("Missing Stripe-Signature header.");
      return;
    }

    let event: Stripe.Event;
    try {
      event = getStripeClient().webhooks.constructEvent(request.rawBody, signature, stripeWebhookSecret.value());
    } catch (error) {
      logger.warn("Stripe webhook signature verification failed", { message: error instanceof Error ? error.message : "unknown" });
      response.status(400).send("Invalid Stripe signature.");
      return;
    }

    if (event.livemode) {
      await rejectProviderEvent(event, "Release 1 accepts Stripe test-mode webhooks only.");
      response.status(200).send("Rejected live-mode event.");
      return;
    }

    try {
      if (event.type === "checkout.session.completed") {
        await handleCheckoutCompleted(event, event.data.object as Stripe.Checkout.Session);
      } else if (
        event.type === "customer.subscription.created"
        || event.type === "customer.subscription.updated"
        || event.type === "customer.subscription.deleted"
      ) {
        await handleSubscriptionEvent(event, event.data.object as Stripe.Subscription);
      }
      response.status(200).send("ok");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown reconciliation error.";
      // Scope/provider mismatches are permanent for the signed payload. Record a
      // rejection and acknowledge it so retries cannot manufacture access.
      await rejectProviderEvent(event, reason);
      response.status(200).send("Rejected invalid billing event.");
    }
  },
);
