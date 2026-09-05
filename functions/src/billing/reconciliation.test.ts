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
    provider: "stripe",
    providerCustomerId: "cus_test",
    providerSubscriptionId: "sub_test",
    providerPriceId: "price_test",
    billingInterval: "month",
    currency: "usd",
    unitAmountMinor: 2900,
    status,
    cancelAtPeriodEnd: false,
    trustedAt: "2026-09-05T10:00:00.000Z",
    providerEventId: "evt_test",
  };
}

test("older provider events are stale but equal/newer events remain eligible", () => {
  assert.equal(isStaleProviderEvent(undefined, 10), false);
  assert.equal(isStaleProviderEvent(10, 9), true);
  assert.equal(isStaleProviderEvent(10, 10), false);
  assert.equal(isStaleProviderEvent(10, 11), false);
});

test("the first reconciled subscription emits subscription.started", () => {
  assert.equal(subscriptionLifecycleEvent(null, snapshot("incomplete"), "customer.subscription.created"), "subscription.started");
});

test("cancellation emits subscription.cancelled and other changes emit updated", () => {
  const previous: StoredSubscription = {
    ...snapshot("active"),
    lastProviderEventCreated: 10,
    updatedAt: "2026-09-05T10:00:00.000Z",
  };
  assert.equal(subscriptionLifecycleEvent(previous, snapshot("past_due"), "customer.subscription.updated"), "subscription.updated");
  assert.equal(subscriptionLifecycleEvent(previous, snapshot("canceled"), "customer.subscription.updated"), "subscription.cancelled");
  assert.equal(subscriptionLifecycleEvent(previous, snapshot("canceled"), "customer.subscription.deleted"), "subscription.cancelled");
});
