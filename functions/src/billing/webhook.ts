import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import type Stripe from "stripe";
import { db } from "../firebase.js";
import { getStripeClient, stripeSecretKey, stripeWebhookSecret } from "./config.js";
import {
  isPermanentBillingEventError,
  isStaleProviderEvent,
  permanentBillingEvent,
  subscriptionLifecycleEvent,
  type ProviderEventRecord,
  type StoredSubscription,
} from "./model.js";
import {
  billingCustomerRef,
  providerEventRef,
  resolveOfferVersionForSubscription,
  subscriptionRef,
} from "./store.js";
import { subscriptionSnapshotFromStripe } from "./stripe-adapter.js";

function requiredMetadata(metadata: Stripe.Metadata, key: string) {
  const value = metadata[key]?.trim();
  if (!value) return permanentBillingEvent(`Stripe metadata is missing ${key}.`);
  return value;
}

function stripeCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!customer) return permanentBillingEvent("Stripe object is missing its Customer.");
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
  if (session.livemode) return permanentBillingEvent("Release 1 rejects live-mode Checkout events.");
  const organizationId = requiredMetadata(session.metadata ?? {}, "nurtureOrganizationId");
  const customerId = requiredMetadata(session.metadata ?? {}, "nurtureCustomerId");
  const offerId = requiredMetadata(session.metadata ?? {}, "nurtureOfferId");
  const providerCustomerId = stripeCustomerId(session.customer);

  const [mappingSnapshot, checkoutSnapshot] = await Promise.all([
    billingCustomerRef(organizationId, customerId).get(),
    db.collection("organizations").doc(organizationId).collection("billingCheckoutSessions").doc(session.id).get(),
  ]);
  const mapping = mappingSnapshot.data();
  if (!mappingSnapshot.exists || mapping?.providerCustomerId !== providerCustomerId) {
    return permanentBillingEvent("Checkout Customer does not match the Nurture billing mapping.");
  }
  const checkout = checkoutSnapshot.data();
  if (!checkoutSnapshot.exists || checkout?.customerId !== customerId || checkout?.offerId !== offerId) {
    return permanentBillingEvent("Checkout Session was not initiated by the trusted Nurture billing boundary.");
  }
  if (session.metadata?.nurtureOfferVersion && Number(session.metadata.nurtureOfferVersion) !== checkout?.offerVersion) {
    return permanentBillingEvent("Checkout Offer version does not match the trusted checkout record.");
  }
  if (session.metadata?.nurtureOfferPriceId && session.metadata.nurtureOfferPriceId !== checkout?.priceId) {
    return permanentBillingEvent("Checkout local Price does not match the trusted checkout record.");
  }

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
      payload: {
        provider: "stripe",
        providerSessionId: session.id,
        offerVersion: checkout?.offerVersion ?? null,
        offerPriceId: checkout?.priceId ?? null,
      },
    });
  });
}

async function currentSubscriptionForEvent(event: Stripe.Event, payload: Stripe.Subscription) {
  try {
    // Stripe event timestamps are second-resolution and delivery is unordered.
    // Re-read current provider state so equal-timestamp or delayed events cannot
    // regress the Nurture projection.
    return await getStripeClient().subscriptions.retrieve(payload.id);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (event.type === "customer.subscription.deleted" && code === "resource_missing") return payload;
    throw error;
  }
}

async function handleSubscriptionEvent(event: Stripe.Event, eventSubscription: Stripe.Subscription) {
  const subscription = await currentSubscriptionForEvent(event, eventSubscription);
  if (subscription.livemode) return permanentBillingEvent("Release 1 rejects live-mode subscription events.");
  const organizationId = requiredMetadata(subscription.metadata, "nurtureOrganizationId");
  const customerId = requiredMetadata(subscription.metadata, "nurtureCustomerId");
  const offerId = requiredMetadata(subscription.metadata, "nurtureOfferId");
  const providerCustomerId = stripeCustomerId(subscription.customer);
  if (subscription.items.data.length !== 1) return permanentBillingEvent("Release 1 expects exactly one Stripe subscription item.");
  const providerPriceId = subscription.items.data[0].price.id;

  const mappingSnapshot = await billingCustomerRef(organizationId, customerId).get();
  const mapping = mappingSnapshot.data();
  if (!mappingSnapshot.exists || mapping?.providerCustomerId !== providerCustomerId) {
    return permanentBillingEvent("Subscription Customer does not match the Nurture billing mapping.");
  }

  const offer = await resolveOfferVersionForSubscription({
    organizationId,
    offerId,
    providerPriceId,
    subscriptionCreated: subscription.created,
    metadataVersion: subscription.metadata.nurtureOfferVersion,
  });
  const snapshot = subscriptionSnapshotFromStripe({
    subscription,
    offer,
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
      lastProviderEventCreated: Math.max(previous?.lastProviderEventCreated ?? event.created, event.created),
      updatedAt: now,
    });
    transaction.create(eventRef, providerRecord(event, "processed", {
      organizationId,
      providerSubscriptionId: subscription.id,
    }));
    if (eventType) {
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
          offerVersion: snapshot.offerVersion,
          offerPriceId: snapshot.offerPriceId,
          status: snapshot.status,
          billingInterval: snapshot.billingInterval,
          currency: snapshot.currency,
          unitAmountMinor: snapshot.unitAmountMinor,
        },
      });
    }
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

    try {
      if (event.livemode) permanentBillingEvent("Release 1 accepts Stripe test-mode webhooks only.");
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
      if (isPermanentBillingEventError(error)) {
        try {
          await rejectProviderEvent(event, reason);
          response.status(200).send("Rejected invalid billing event.");
        } catch (recordError) {
          logger.error("Could not persist Stripe rejection; request will be retried", {
            eventId: event.id,
            eventType: event.type,
            reason: recordError instanceof Error ? recordError.message : "unknown",
          });
          response.status(500).send("Billing reconciliation retry required.");
        }
        return;
      }

      // Firestore/Stripe/network failures are not permanent properties of the
      // signed event. Return a retryable status so Stripe does not drop state.
      logger.error("Transient Stripe billing reconciliation failure", {
        eventId: event.id,
        eventType: event.type,
        reason,
      });
      response.status(500).send("Billing reconciliation retry required.");
    }
  },
);
