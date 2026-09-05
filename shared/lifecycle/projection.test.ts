import { describe, expect, it } from "vitest";
import {
  applyAuthoritativeCommercialSnapshot,
  applyLifecycleEventToProjection,
  createEmptyCustomerLifecycleProjection,
} from "./projection";
import { lifecycleEvent } from "./test-fixtures";

function reduce(events: ReturnType<typeof lifecycleEvent>[]) {
  return events.reduce(
    (projection, event) => applyLifecycleEventToProjection(projection, event).projection,
    createEmptyCustomerLifecycleProjection({ organizationId: "org-a", customerId: "customer-1", dataMode: "live", now: "2026-09-05T12:00:00.000Z" }),
  );
}

const registration = lifecycleEvent({
  eventId: "registration", eventType: "registration.completed", customerId: "customer-1", identityId: "identity-1",
  occurredAt: "2026-09-05T12:10:00.000Z", source: "domain_action",
});
const verified = lifecycleEvent({
  eventId: "verified", eventType: "identity.verified", customerId: "customer-1", identityId: "identity-1",
  occurredAt: "2026-09-05T12:20:00.000Z", source: "domain_action",
});
const onboardingStarted = lifecycleEvent({
  eventId: "onboarding-start", eventType: "onboarding.started", customerId: "customer-1",
  occurredAt: "2026-09-05T12:30:00.000Z", source: "domain_action", payload: { flowVersion: "flow-1" },
});
const onboardingCompleted = lifecycleEvent({
  eventId: "onboarding-complete", eventType: "onboarding.completed", customerId: "customer-1",
  occurredAt: "2026-09-05T12:50:00.000Z", source: "domain_action", payload: { flowVersion: "flow-1", stepId: "ready" },
});
const experienceStarted = lifecycleEvent({
  eventId: "experience-start", eventType: "experience.started", customerId: "customer-1",
  occurredAt: "2026-09-05T13:00:00.000Z", source: "browser",
});
const milestone = lifecycleEvent({
  eventId: "milestone", eventType: "experience.milestone_reached", customerId: "customer-1",
  occurredAt: "2026-09-05T13:10:00.000Z", source: "domain_action",
  payload: { milestoneKey: "first-meaningful-use", activation: true, milestoneLabel: "First meaningful use" },
});
const inactive = lifecycleEvent({
  eventId: "inactive", eventType: "experience.inactive", customerId: "customer-1",
  occurredAt: "2026-09-05T14:00:00.000Z", source: "scheduler",
});
const laterActivity = lifecycleEvent({
  eventId: "activity", eventType: "experience.reference.interacted", customerId: "customer-1",
  occurredAt: "2026-09-05T14:10:00.000Z", source: "browser",
});

describe("Release 2 lifecycle projections", () => {
  it("converges when valid lifecycle facts are delivered out of order", () => {
    const chronological = reduce([registration, verified, onboardingStarted, onboardingCompleted, experienceStarted, milestone, inactive, laterActivity]);
    const shuffled = reduce([laterActivity, onboardingCompleted, registration, inactive, milestone, onboardingStarted, verified, experienceStarted]);

    expect(shuffled.identity.state).toBe("verified");
    expect(shuffled.onboarding.state).toBe("completed");
    expect(shuffled.experience.state).toBe("activated");
    expect(shuffled.experience.milestones).toHaveLength(1);
    expect(shuffled.experience.firstMeaningfulUseAt).toBe(chronological.experience.firstMeaningfulUseAt);
    expect(shuffled.experience.lastUseAt).toBe(chronological.experience.lastUseAt);
  });

  it("does not treat ordinary browser activity as activation", () => {
    const projection = reduce([experienceStarted, laterActivity]);
    expect(projection.experience.state).toBe("started");
    expect(projection.experience.firstMeaningfulUseAt).toBeUndefined();
  });

  it("rejects a browser-forged privileged milestone", () => {
    const forged = lifecycleEvent({
      eventId: "forged", eventType: "experience.milestone_reached", customerId: "customer-1",
      occurredAt: "2026-09-05T13:10:00.000Z", source: "browser", payload: { milestoneKey: "forged", activation: true },
    });
    const empty = createEmptyCustomerLifecycleProjection({ organizationId: "org-a", customerId: "customer-1", dataMode: "live" });
    expect(() => applyLifecycleEventToProjection(empty, forged)).toThrow(/not an allowed source|not registered/i);
  });

  it("isolates test and live projections", () => {
    const testEvent = lifecycleEvent({ ...registration, eventId: "test-registration", dataMode: "test" });
    const live = createEmptyCustomerLifecycleProjection({ organizationId: "org-a", customerId: "customer-1", dataMode: "live" });
    const result = applyLifecycleEventToProjection(live, testEvent);
    expect(result.applied).toBe(false);
    expect(result.ignoredReason).toBe("wrong_mode");
    expect(result.projection.identity.state).toBe("unknown");
  });

  it("uses the trusted billing reconciler instead of guessing commercial state from event order", () => {
    const subscriptionEvent = lifecycleEvent({
      eventId: "sub", eventType: "subscription.started", customerId: "customer-1",
      occurredAt: "2026-09-05T15:00:00.000Z", source: "provider_webhook",
    });
    const projected = reduce([subscriptionEvent]);
    expect(projected.commercial.state).toBe("unknown");
    expect(projected.commercial.metadata.stale).toBe(true);

    const staleSnapshot = applyAuthoritativeCommercialSnapshot(projected, {
      organizationId: "org-a", customerId: "customer-1", version: "billing-1", asOf: "2026-09-05T14:59:00.000Z",
      state: "none", source: "billing-reconciler",
    }, "2026-09-05T15:01:00.000Z");
    expect(staleSnapshot.commercial.metadata.stale).toBe(true);

    const currentSnapshot = applyAuthoritativeCommercialSnapshot(projected, {
      organizationId: "org-a", customerId: "customer-1", version: "billing-2", asOf: "2026-09-05T15:01:00.000Z",
      state: "active", subscriptionId: "sub-1", source: "billing-reconciler",
    }, "2026-09-05T15:02:00.000Z");
    expect(currentSnapshot.commercial.state).toBe("active");
    expect(currentSnapshot.commercial.metadata.stale).toBe(false);
  });
});
