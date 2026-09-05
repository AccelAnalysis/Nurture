import assert from "node:assert/strict";
import { test } from "node:test";
import type { SubscriptionSnapshot } from "../../../shared/billing/contracts.js";
import {
  isStaleProviderEvent,
  subscriptionLifecycleEvent,
  type StoredSubscription,
} from "./model.js";

function snapshot(status: SubscriptionSnapshot["status"]): SubscriptionSnapshot {
  return {
    id: "sub_test",
    organizationId: "org_test",
    customerId: "customer_test",
    offerId: "primary",
    offerVersion: 2,
    offerPriceId: "primary-month-v2",
    provider: "stripe",
    providerCustomerId: "cus_test",
    providerSubscriptionId: "sub_test",
    providerPriceId: "price_test",
    billingInterval: "month",
    currency: "usd",
    unitAmountMinor: 2900,
    status,
    cancelAtPeriodEnd: false,
    currentPeriodStart: "2026-09-01T00:00:00.000Z",
    currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    trustedAt: "2026-09-05T10:00:00.000Z",
    providerEventId: "evt_test",
  };
}

test("strictly older provider events are stale; equal timestamps require provider-state reconciliation", () => {
  assert.equal(isStaleProviderEvent(undefined, 10), false);
  assert.equal(isStaleProviderEvent(10, 9), true);
  assert.equal(isStaleProviderEvent(10, 10), false);
  assert.equal(isStaleProviderEvent(10, 11), false);
});

test("the first reconciled subscription emits subscription.started", () => {
  assert.equal(subscriptionLifecycleEvent(null, snapshot("incomplete"), "customer.subscription.created"), "subscription.started");
});

test("material state changes emit updated or cancelled", () => {
  const previous: StoredSubscription = {
    ...snapshot("active"),
    lastProviderEventCreated: 10,
    updatedAt: "2026-09-05T10:00:00.000Z",
  };
  assert.equal(subscriptionLifecycleEvent(previous, snapshot("past_due"), "customer.subscription.updated"), "subscription.updated");
  assert.equal(subscriptionLifecycleEvent(previous, snapshot("canceled"), "customer.subscription.updated"), "subscription.cancelled");
  assert.equal(subscriptionLifecycleEvent(previous, snapshot("canceled"), "customer.subscription.deleted"), "subscription.cancelled");
});

test("a second provider event that reconciles to identical commercial state emits no lifecycle duplicate", () => {
  const previous: StoredSubscription = {
    ...snapshot("active"),
    lastProviderEventCreated: 10,
    updatedAt: "2026-09-05T10:00:00.000Z",
  };
  const same = { ...snapshot("active"), providerEventId: "evt_equal", trustedAt: "2026-09-05T10:01:00.000Z" };
  assert.equal(subscriptionLifecycleEvent(previous, same, "customer.subscription.updated"), null);
});
