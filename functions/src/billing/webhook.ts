import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import type Stripe from "stripe";
import { validateLifecycleEventEnvelope } from "../../../shared/analytics/core.js";
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
  return { provider: "stripe", eventId: event.id, eventType: event.type, providerCreated: event.created, outcome, processedAt: new Date().toISOString(), ...extra };
}
async function rejectProviderEvent(event: Stripe.Event, reason: string) {
  const ref = providerEventRef(event.id);
  await db.runTransaction(async (transaction) => {
    if ((await transaction.get(ref)).exists) return;
    transaction.create(ref, providerRecord(event, "rejected", { reason: reason.slice(0, 500) }));
  });
  logger.error("Rejected Stripe billing event", { eventId: event.id, eventType: event.type, reason });
}
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function expandableId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  const item = record(value); return typeof item?.id === "string" && item.id ? item.id : null;
}
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const raw = record(invoice); const parent = record(raw?.parent); const details = record(parent?.subscription_details);
  return expandableId(details?.subscription);
}
function invoicePaymentReferences(invoice: Stripe.Invoice): string[] {
  const raw = record(invoice); const payments = record(raw?.payments); const rows = Array.isArray(payments?.data) ? payments.data : [];
  const ids = new Set<string>();
  for (const row of rows) {
    const payment = record(record(row)?.payment);
    const charge = expandableId(payment?.charge); const intent = expandableId(payment?.payment_intent);
    if (charge) ids.add(charge); if (intent) ids.add(intent);
  }
  return [...ids];
}
function paymentMappingRef(providerPaymentId: string) { return db.collection("_billingPaymentMappings").doc(providerPaymentId); }
function lifecycleRef(organizationId: string, id: string) { return db.collection("organizations").doc(organizationId).collection("lifecycleEvents").doc(id); }
function safeInteger(value: unknown, fallback = 0) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback; }

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
  if (!mappingSnapshot.exists || mapping?.providerCustomerId !== providerCustomerId) return permanentBillingEvent("Checkout Customer does not match the Nurture billing mapping.");
  const checkout = checkoutSnapshot.data();
  if (!checkoutSnapshot.exists || checkout?.customerId !== customerId || checkout?.offerId !== offerId) return permanentBillingEvent("Checkout Session was not initiated by the trusted Nurture billing boundary.");
  if (session.metadata?.nurtureOfferVersion && Number(session.metadata.nurtureOfferVersion) !== checkout?.offerVersion) return permanentBillingEvent("Checkout Offer version does not match the trusted checkout record.");
  if (session.metadata?.nurtureOfferPriceId && session.metadata.nurtureOfferPriceId !== checkout?.priceId) return permanentBillingEvent("Checkout local Price does not match the trusted checkout record.");

  const eventRef = providerEventRef(event.id);
  const eventDoc = lifecycleRef(organizationId, `stripe-${event.id}`);
  await db.runTransaction(async (transaction) => {
    if ((await transaction.get(eventRef)).exists) return;
    const receivedAt = new Date().toISOString();
    transaction.create(eventRef, providerRecord(event, "processed", { organizationId }));
    transaction.set(eventDoc, {
      eventId: eventDoc.id, eventType: "checkout.completed", schemaVersion: 1, organizationId,
      subjectId: customerId, subjectKind: "customer", customerId, offerId,
      occurredAt: new Date(event.created * 1000).toISOString(), receivedAt, source: "provider_webhook",
      correlationId: session.id, idempotencyKey: `stripe:${event.id}:checkout.completed`, dataMode: "test",
      payload: { provider: "stripe", providerSessionId: session.id, offerVersion: checkout?.offerVersion ?? null, offerPriceId: checkout?.priceId ?? null },
    });
  });
}

async function currentSubscriptionForEvent(event: Stripe.Event, payload: Stripe.Subscription) {
  try { return await getStripeClient().subscriptions.retrieve(payload.id); }
  catch (error) {
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
  if (!mappingSnapshot.exists || mapping?.providerCustomerId !== providerCustomerId) return permanentBillingEvent("Subscription Customer does not match the Nurture billing mapping.");
  const offer = await resolveOfferVersionForSubscription({ organizationId, offerId, providerPriceId, subscriptionCreated: subscription.created, metadataVersion: subscription.metadata.nurtureOfferVersion });
  const snapshot = subscriptionSnapshotFromStripe({ subscription, offer, organizationId, customerId, providerEventId: event.id });
  const eventRef = providerEventRef(event.id);
  const currentRef = subscriptionRef(organizationId, subscription.id);
  const eventDoc = lifecycleRef(organizationId, `stripe-${event.id}`);
  await db.runTransaction(async (transaction) => {
    const [seen, current] = await Promise.all([transaction.get(eventRef), transaction.get(currentRef)]);
    if (seen.exists) return;
    const previous = current.exists ? current.data() as StoredSubscription : null;
    if (isStaleProviderEvent(previous?.lastProviderEventCreated, event.created)) {
      transaction.create(eventRef, providerRecord(event, "ignored_stale", { organizationId, providerSubscriptionId: subscription.id })); return;
    }
    const eventType = subscriptionLifecycleEvent(previous, snapshot, event.type); const now = new Date().toISOString();
    transaction.set(currentRef, { ...snapshot, lastProviderEventCreated: Math.max(previous?.lastProviderEventCreated ?? event.created, event.created), updatedAt: now });
    transaction.create(eventRef, providerRecord(event, "processed", { organizationId, providerSubscriptionId: subscription.id }));
    if (eventType) transaction.set(eventDoc, {
      eventId: eventDoc.id, eventType, schemaVersion: 1, organizationId, subjectId: subscription.id, subjectKind: "subscription", customerId, offerId,
      occurredAt: new Date(event.created * 1000).toISOString(), receivedAt: now, source: "provider_webhook", correlationId: subscription.id,
      idempotencyKey: `stripe:${event.id}:${eventType}`, dataMode: "test",
      payload: { provider: "stripe", subscriptionId: subscription.id, offerVersion: snapshot.offerVersion, offerPriceId: snapshot.offerPriceId, status: snapshot.status, billingInterval: snapshot.billingInterval, currency: snapshot.currency, unitAmountMinor: snapshot.unitAmountMinor },
    });
  });
}

interface InvoiceContext {
  organizationId: string; customerId: string; offerId: string; subscriptionId: string; snapshot: StoredSubscription;
}
async function invoiceContext(invoice: Stripe.Invoice): Promise<InvoiceContext> {
  if (invoice.livemode) return permanentBillingEvent("Release 5 payment analytics rejects live-mode invoice events until commercial live mode is separately accepted.");
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return permanentBillingEvent("Invoice is not attached to a subscription supported by Nurture.");
  const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
  if (subscription.livemode) return permanentBillingEvent("Release 5 payment analytics rejects live-mode subscriptions.");
  const organizationId = requiredMetadata(subscription.metadata, "nurtureOrganizationId");
  const customerId = requiredMetadata(subscription.metadata, "nurtureCustomerId");
  const offerId = requiredMetadata(subscription.metadata, "nurtureOfferId");
  const [mapping, stored] = await Promise.all([billingCustomerRef(organizationId, customerId).get(), subscriptionRef(organizationId, subscriptionId).get()]);
  if (!mapping.exists || mapping.data()?.providerCustomerId !== stripeCustomerId(subscription.customer)) return permanentBillingEvent("Invoice subscription Customer does not match the Nurture billing mapping.");
  if (!stored.exists) throw new Error("Trusted subscription snapshot is not available yet; retry invoice reconciliation.");
  const snapshot = stored.data() as StoredSubscription;
  if (snapshot.customerId !== customerId || snapshot.offerId !== offerId || snapshot.providerSubscriptionId !== subscriptionId) return permanentBillingEvent("Invoice subscription does not match the trusted Nurture subscription snapshot.");
  return { organizationId, customerId, offerId, subscriptionId, snapshot };
}
function paymentEventData(input: { id: string; type: "payment.collected" | "payment.refunded" | "payment.failed" | "payment.recovered" | "subscription.renewed"; context: InvoiceContext; occurredAt: string; receivedAt: string; correlationId: string; payload: Record<string, unknown> }) {
  return validateLifecycleEventEnvelope({
    eventId: input.id, eventType: input.type, schemaVersion: 1, organizationId: input.context.organizationId,
    subjectId: input.context.subscriptionId, subjectKind: "subscription", customerId: input.context.customerId, offerId: input.context.offerId,
    occurredAt: input.occurredAt, receivedAt: input.receivedAt, source: "provider_webhook", correlationId: input.correlationId,
    idempotencyKey: input.id, dataMode: "test", payload: input.payload,
  });
}
async function handleInvoicePaid(event: Stripe.Event, payload: Stripe.Invoice) {
  const invoice = await getStripeClient().invoices.retrieve(payload.id, { expand: ["payments"] });
  const context = await invoiceContext(invoice); const eventRef = providerEventRef(event.id); const now = new Date().toISOString(); const occurredAt = new Date(event.created * 1000).toISOString();
  const raw = record(invoice) ?? {}; const amountMinor = safeInteger(raw.amount_paid); const currency = typeof raw.currency === "string" ? raw.currency : context.snapshot.currency;
  const billingReason = typeof raw.billing_reason === "string" ? raw.billing_reason : "unknown"; const attemptCount = safeInteger(raw.attempt_count, 1);
  const ledgerId = `stripe:invoice:${invoice.id}`;
  const collectedRef = lifecycleRef(context.organizationId, `stripe-invoice-${invoice.id}-collected`);
  const renewedRef = lifecycleRef(context.organizationId, `stripe-invoice-${invoice.id}-renewed`);
  const recoveredRef = lifecycleRef(context.organizationId, `stripe-invoice-${invoice.id}-recovered`);
  const paymentRefs = invoicePaymentReferences(invoice).map(paymentMappingRef);
  await db.runTransaction(async (transaction) => {
    const [seen, collected, renewed, recovered, ...mappings] = await Promise.all([transaction.get(eventRef), transaction.get(collectedRef), transaction.get(renewedRef), transaction.get(recoveredRef), ...paymentRefs.map((ref) => transaction.get(ref))]);
    if (seen.exists) return;
    for (const mapping of mappings) if (mapping.exists && (mapping.data()?.organizationId !== context.organizationId || mapping.data()?.subscriptionId !== context.subscriptionId)) return permanentBillingEvent("Stripe payment reference is already bound to another Nurture subscription.");
    transaction.create(eventRef, providerRecord(event, "processed", { organizationId: context.organizationId, providerSubscriptionId: context.subscriptionId }));
    for (const ref of paymentRefs) transaction.set(ref, { organizationId: context.organizationId, customerId: context.customerId, offerId: context.offerId, subscriptionId: context.subscriptionId, invoiceId: invoice.id, dataMode: "test", updatedAt: now }, { merge: false });
    if (amountMinor > 0 && !collected.exists) transaction.create(collectedRef, paymentEventData({ id: collectedRef.id, type: "payment.collected", context, occurredAt, receivedAt: now, correlationId: invoice.id, payload: { provider: "stripe", ledgerEntryId: ledgerId, invoiceId: invoice.id, subscriptionId: context.subscriptionId, amountMinor, currency, billingReason } }));
    if (billingReason === "subscription_cycle" && !renewed.exists) transaction.create(renewedRef, paymentEventData({ id: renewedRef.id, type: "subscription.renewed", context, occurredAt, receivedAt: now, correlationId: invoice.id, payload: { provider: "stripe", subscriptionId: context.subscriptionId, offerVersion: context.snapshot.offerVersion, offerPriceId: context.snapshot.offerPriceId, status: context.snapshot.status, billingInterval: context.snapshot.billingInterval, currency: context.snapshot.currency, unitAmountMinor: context.snapshot.unitAmountMinor, invoiceId: invoice.id } }));
    if (attemptCount > 1 && !recovered.exists) transaction.create(recoveredRef, paymentEventData({ id: recoveredRef.id, type: "payment.recovered", context, occurredAt, receivedAt: now, correlationId: invoice.id, payload: { provider: "stripe", invoiceId: invoice.id, subscriptionId: context.subscriptionId, attemptCount } }));
  });
}
async function handleInvoiceFailed(event: Stripe.Event, payload: Stripe.Invoice) {
  const invoice = await getStripeClient().invoices.retrieve(payload.id); const context = await invoiceContext(invoice); const eventRef = providerEventRef(event.id); const now = new Date().toISOString();
  const raw = record(invoice) ?? {}; const failedRef = lifecycleRef(context.organizationId, `stripe-invoice-${invoice.id}-failed-${event.id}`);
  await db.runTransaction(async (transaction) => {
    const [seen, existing] = await Promise.all([transaction.get(eventRef), transaction.get(failedRef)]); if (seen.exists) return;
    transaction.create(eventRef, providerRecord(event, "processed", { organizationId: context.organizationId, providerSubscriptionId: context.subscriptionId }));
    if (!existing.exists) transaction.create(failedRef, paymentEventData({ id: failedRef.id, type: "payment.failed", context, occurredAt: new Date(event.created * 1000).toISOString(), receivedAt: now, correlationId: invoice.id, payload: { provider: "stripe", invoiceId: invoice.id, subscriptionId: context.subscriptionId, amountMinor: safeInteger(raw.amount_due), currency: typeof raw.currency === "string" ? raw.currency : context.snapshot.currency, attemptCount: safeInteger(raw.attempt_count, 1) } }));
  });
}
async function handleRefund(event: Stripe.Event, refund: Stripe.Refund) {
  if (refund.livemode) return permanentBillingEvent("Release 5 payment analytics rejects live-mode refund events.");
  const eventRef = providerEventRef(event.id);
  if (refund.status !== "succeeded") {
    await db.runTransaction(async (transaction) => { if (!(await transaction.get(eventRef)).exists) transaction.create(eventRef, providerRecord(event, "processed", { reason: `refund-${refund.status ?? "unknown"}` })); });
    return;
  }
  const references = [expandableId(refund.payment_intent), expandableId(refund.charge)].filter((value): value is string => Boolean(value));
  if (!references.length) return permanentBillingEvent("Refund is missing a provider payment reference.");
  const mappingSnapshots = await Promise.all(references.map((id) => paymentMappingRef(id).get()));
  const mappings = mappingSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.data() as { organizationId: string; customerId: string; offerId: string; subscriptionId: string; dataMode: string });
  if (!mappings.length) throw new Error("Refund payment mapping is not available yet; retry refund reconciliation.");
  const mapping = mappings[0];
  if (mappings.some((item) => item.organizationId !== mapping.organizationId || item.subscriptionId !== mapping.subscriptionId) || mapping.dataMode !== "test") return permanentBillingEvent("Refund payment references resolve to inconsistent Nurture scope.");
  const stored = await subscriptionRef(mapping.organizationId, mapping.subscriptionId).get(); if (!stored.exists) throw new Error("Refund subscription snapshot is unavailable; retry reconciliation.");
  const context: InvoiceContext = { ...mapping, snapshot: stored.data() as StoredSubscription };
  const refundRef = lifecycleRef(mapping.organizationId, `stripe-refund-${refund.id}`); const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const [seen, existing] = await Promise.all([transaction.get(eventRef), transaction.get(refundRef)]); if (seen.exists) return;
    transaction.create(eventRef, providerRecord(event, "processed", { organizationId: mapping.organizationId, providerSubscriptionId: mapping.subscriptionId }));
    if (!existing.exists) transaction.create(refundRef, paymentEventData({ id: refundRef.id, type: "payment.refunded", context, occurredAt: new Date(event.created * 1000).toISOString(), receivedAt: now, correlationId: refund.id, payload: { provider: "stripe", ledgerEntryId: `stripe:refund:${refund.id}`, refundId: refund.id, subscriptionId: mapping.subscriptionId, amountMinor: refund.amount, currency: refund.currency } }));
  });
}

export const stripeBillingWebhook = onRequest({ secrets: [stripeSecretKey, stripeWebhookSecret] }, async (request, response) => {
  const signature = request.get("stripe-signature");
  if (!signature) { response.status(400).send("Missing Stripe-Signature header."); return; }
  let event: Stripe.Event;
  try { event = getStripeClient().webhooks.constructEvent(request.rawBody, signature, stripeWebhookSecret.value()); }
  catch (error) { logger.warn("Stripe webhook signature verification failed", { message: error instanceof Error ? error.message : "unknown" }); response.status(400).send("Invalid Stripe signature."); return; }
  try {
    if (event.livemode) permanentBillingEvent("Release 1 accepts Stripe test-mode webhooks only.");
    if (event.type === "checkout.session.completed") await handleCheckoutCompleted(event, event.data.object as Stripe.Checkout.Session);
    else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") await handleSubscriptionEvent(event, event.data.object as Stripe.Subscription);
    else if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") await handleInvoicePaid(event, event.data.object as Stripe.Invoice);
    else if (event.type === "invoice.payment_failed") await handleInvoiceFailed(event, event.data.object as Stripe.Invoice);
    else if (event.type === "refund.created" || event.type === "refund.updated") await handleRefund(event, event.data.object as Stripe.Refund);
    response.status(200).send("ok");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown reconciliation error.";
    if (isPermanentBillingEventError(error)) {
      try { await rejectProviderEvent(event, reason); response.status(200).send("Rejected invalid billing event."); }
      catch (recordError) { logger.error("Could not persist Stripe rejection; request will be retried", { eventId: event.id, eventType: event.type, reason: recordError instanceof Error ? recordError.message : "unknown" }); response.status(500).send("Billing reconciliation retry required."); }
      return;
    }
    logger.error("Transient Stripe billing reconciliation failure", { eventId: event.id, eventType: event.type, reason }); response.status(500).send("Billing reconciliation retry required.");
  }
});
