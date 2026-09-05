import assert from "node:assert/strict";
import {
  AnalyticsContractError,
  bindLifecycleEvent,
  createLifecycleEventSubmission,
  isAnalyticsEventType,
  isExperienceModuleEventType,
  isNurtureEventType,
  isSourceAllowedForEvent,
  validateEventPayload,
  validateLifecycleEventEnvelope,
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
assert.equal(isAnalyticsEventType("made.up"), false);

const boundPageView = bindLifecycleEvent(pageView, {
  organizationId: "org-1",
  source: "browser",
  subject: { kind: "visitor", id: "visitor-1" },
}, { now });
assert.equal(boundPageView.organizationId, "org-1");
assert.equal(boundPageView.subjectKind, "visitor");
assert.equal(boundPageView.source, "browser");

const identitySignal = createLifecycleEventSubmission(
  "registration.completed",
  { method: "password" },
  {
    eventId: "event-track-c",
    occurredAt: now(),
    correlationId: "corr-track-c",
    idempotencyKey: "event-track-c",
    identityIdHint: "firebase-uid-hint",
    customerIdHint: "customer-hint",
    subjectHint: { kind: "customer", id: "customer-hint" },
    dataMode: "development",
  },
);
assert.equal(identitySignal.eventType, "registration.completed");
assert.equal(identitySignal.identityIdHint, "firebase-uid-hint");
assert.equal(identitySignal.customerIdHint, "customer-hint");
assert.equal(isSourceAllowedForEvent(identitySignal.eventType, "browser"), false);
const boundIdentitySignal = bindLifecycleEvent(identitySignal, {
  organizationId: "verified-org",
  source: "domain_action",
  identityId: "verified-identity",
  customerId: "verified-customer",
  subject: { kind: "customer", id: "verified-customer" },
}, { now });
assert.equal(boundIdentitySignal.identityId, "verified-identity");
assert.equal(boundIdentitySignal.customerId, "verified-customer");
assert.notEqual(boundIdentitySignal.customerId, identitySignal.customerIdHint);

const moduleEvent = createLifecycleEventSubmission(
  "experience.reference-assessment.completed",
  { completedQuestions: 3 },
  {
    dataMode: "test",
    organizationIdHint: "browser-claimed-org",
    customerIdHint: "browser-claimed-customer",
    experienceId: "experience-1",
    experienceModuleId: "nurture.reference-assessment",
    experienceModuleVersion: "1.0.0",
  },
  { id: () => "evt-module", now },
);
assert.equal(isExperienceModuleEventType(moduleEvent.eventType), true);
assert.equal(isSourceAllowedForEvent(moduleEvent.eventType, "browser"), true);
const boundModuleEvent = bindLifecycleEvent(moduleEvent, {
  organizationId: "verified-org",
  source: "browser",
  customerId: "verified-customer",
}, { now });
assert.equal(boundModuleEvent.organizationId, "verified-org");
assert.equal(boundModuleEvent.customerId, "verified-customer");
assert.notEqual(boundModuleEvent.organizationId, moduleEvent.organizationIdHint);
assert.notEqual(boundModuleEvent.customerId, moduleEvent.customerIdHint);

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

const trackDSubscriptionEvent = {
  eventId: "billing-event-1",
  eventType: "subscription.started",
  schemaVersion: 1,
  organizationId: "org-1",
  subjectId: "sub-1",
  subjectKind: "subscription",
  customerId: "customer-1",
  offerId: "offer-primary",
  occurredAt: now(),
  receivedAt: now(),
  source: "provider_webhook",
  correlationId: "stripe-event-1",
  idempotencyKey: "stripe-event-1",
  dataMode: "test",
  payload: { provider: "stripe", status: "active" },
};
const validatedTrackDEvent = validateLifecycleEventEnvelope(trackDSubscriptionEvent);
assert.equal(validatedTrackDEvent.eventType, "subscription.started");
assert.equal(validatedTrackDEvent.dataMode, "test");
assert.equal(validatedTrackDEvent.source, "provider_webhook");
assert.throws(
  () => validateLifecycleEventEnvelope({ ...trackDSubscriptionEvent, eventType: "checkout.completed", source: "browser" }),
  AnalyticsContractError,
);
assert.throws(
  () => validateLifecycleEventEnvelope({ ...trackDSubscriptionEvent, subjectKind: undefined }),
  AnalyticsContractError,
);

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
assert.throws(
  () => createLifecycleEventSubmission("experience.bad", {}, {}, { id, now }),
  AnalyticsContractError,
);

const malformed = { ...pageView, eventType: "made.up" };
assert.throws(
  () => bindLifecycleEvent(malformed, { organizationId: "org-1", source: "browser" }, { now }),
  AnalyticsContractError,
);

console.log("Track F analytics contract verification passed.");
