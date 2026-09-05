import assert from "node:assert/strict";
import {
  AnalyticsContractError,
  bindLifecycleEvent,
  createLifecycleEventSubmission,
  isNurtureEventType,
  isSourceAllowedForEvent,
  validateEventPayload,
} from "../.tmp/analytics/core.js";

const id = () => "evt-001";
const now = () => "2026-09-05T12:00:00.000Z";

const pageView = createLifecycleEventSubmission(
  "public.page_viewed",
  { path: "/" },
  { sessionId: "session-1", dataMode: "test" },
  { id, now },
);
assert.equal(pageView.eventId, "evt-001");
assert.equal(pageView.correlationId, "session-1");
assert.equal(pageView.idempotencyKey, "evt-001");
assert.equal(pageView.schemaVersion, 1);
assert.equal(isNurtureEventType("public.page_viewed"), true);
assert.equal(isNurtureEventType("made.up"), false);

const boundPageView = bindLifecycleEvent(pageView, {
  organizationId: "org-1",
  source: "browser",
  subject: { kind: "visitor", id: "visitor-1" },
}, { now });
assert.equal(boundPageView.organizationId, "org-1");
assert.equal(boundPageView.subjectKind, "visitor");
assert.equal(boundPageView.source, "browser");

const checkoutCompleted = createLifecycleEventSubmission(
  "checkout.completed",
  { provider: "stripe" },
  { dataMode: "test", offerId: "offer-primary" },
  { id: () => "evt-checkout", now },
);
assert.equal(isSourceAllowedForEvent("checkout.completed", "browser"), false);
assert.throws(
  () => bindLifecycleEvent(checkoutCompleted, { organizationId: "org-1", source: "browser" }, { now }),
  AnalyticsContractError,
);
const trustedCheckout = bindLifecycleEvent(checkoutCompleted, {
  organizationId: "org-1",
  source: "provider_webhook",
  customerId: "customer-1",
}, { now });
assert.equal(trustedCheckout.source, "provider_webhook");
assert.equal(trustedCheckout.customerId, "customer-1");

const published = createLifecycleEventSubmission(
  "configuration.published",
  { configurationVersion: "v3" },
  { dataMode: "preview" },
  { id: () => "evt-publish", now },
);
assert.throws(
  () => bindLifecycleEvent(published, { organizationId: "org-1", source: "browser" }, { now }),
  AnalyticsContractError,
);
assert.equal(
  bindLifecycleEvent(published, { organizationId: "org-1", source: "administrator" }, { now }).source,
  "administrator",
);

assert.throws(
  () => validateEventPayload({ authorization_token: "do-not-log" }),
  AnalyticsContractError,
);
assert.throws(
  () => validateEventPayload({ invalid: Number.NaN }),
  AnalyticsContractError,
);

const malformed = { ...pageView, eventType: "made.up" };
assert.throws(
  () => bindLifecycleEvent(malformed, { organizationId: "org-1", source: "browser" }, { now }),
  AnalyticsContractError,
);

console.log("Track F analytics contract verification passed.");
