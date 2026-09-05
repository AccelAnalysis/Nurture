import { describe, expect, it } from "vitest";
import type { AutomationDefinitionV3, CommercialServicingSummary, ContactabilitySummary, SegmentFact } from "./contracts";
import { evaluateRecoveryCommand, evaluateTreatmentAdmission, planEffects, type AdmissionContext } from "./runtime";

const now = "2026-09-05T12:00:00.000Z";
const commercial: CommercialServicingSummary = {
  subscriptionState: "active",
  entitlementKeys: ["basic"],
  paymentHealth: "healthy",
  cancellation: { status: "none" },
};
const contactability: ContactabilitySummary = {
  organizationId: "org-a", customerId: "customer-a", channel: "email", purpose: "promotional", state: "eligible", checkedAt: now, reasons: ["allowed"],
};
const upsell: AutomationDefinitionV3 = {
  id: "upsell", organizationId: "org-a", version: 2, name: "Premium", kind: "upsell",
  trigger: { eventType: "experience.premium_feature_requested" },
  audience: { mode: "all", predicates: [{ fact: "capability.absent", operator: "eq", value: "premium" }] },
  branches: [{ id: "default", actions: [{ type: "in-app", templateId: "premium", templateVersion: 1, placementId: "experience.contextual", purpose: "promotional" }] }],
  reentry: { kind: "after-cooldown", cooldownHours: 72 },
  conflict: { group: "promotion", priority: "promotion", caps: { customerPerDay: 1, customerPerWeek: 3 } },
  mode: "test", enabled: true,
};
const facts: SegmentFact[] = [{ key: "capability.absent", value: "premium", observedAt: now, provenance: { source: "projection", occurredAt: now } }];
const context: AdmissionContext = { now, organizationPaused: false, automationPaused: false, facts, contactability, commercial, priorRuns: [], competingRuns: [] };

describe("Release 3 general lifecycle runtime", () => {
  it("admits an eligible contextual upsell", () => {
    expect(evaluateTreatmentAdmission(upsell, context)).toEqual({ allowed: true, reasons: ["allowed"], evaluatedAt: now, policyVersion: 1 });
  });

  it("suppresses promotional treatment after cancellation starts", () => {
    const decision = evaluateTreatmentAdmission(upsell, { ...context, commercial: { ...commercial, cancellation: { status: "requested", requestedAt: now } } });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("cancellation-conflict");
  });

  it("lets service priority block a competing promotion in the same conflict group", () => {
    const decision = evaluateTreatmentAdmission(upsell, { ...context, competingRuns: [{ runId: "payment-recovery", automationId: "recovery", automationVersion: 1, kind: "payment-recovery", priority: "service", conflictGroup: "promotion", state: "executing", createdAt: now }] });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("conflict-group-blocked");
  });

  it("enforces cooldown and cross-cycle customer cap", () => {
    const decision = evaluateTreatmentAdmission(upsell, { ...context, priorRuns: [{ runId: "prior", automationId: "upsell", automationVersion: 2, kind: "upsell", priority: "promotion", conflictGroup: "promotion", state: "succeeded", createdAt: "2026-09-05T10:00:00.000Z" }] });
    expect(decision.reasons).toContain("cooldown-active");
    expect(decision.reasons).toContain("frequency-cap-reached");
  });

  it("uses one logical effect identity when a source event is replayed", () => {
    const first = planEffects({ definition: upsell, customerId: "customer-a", triggerId: "event-1", facts });
    const replay = planEffects({ definition: upsell, customerId: "customer-a", triggerId: "event-1", facts });
    expect(first[0].effectId).toBe(replay[0].effectId);
  });

  it("requires reconciliation instead of blindly retrying an ambiguous provider effect", () => {
    const result = evaluateRecoveryCommand({ command: { type: "safe-retry", organizationId: "org-a", runId: "run-1", effectId: "effect-1", mode: "test", reason: "operator retry" }, knownEffect: { effectId: "effect-1", state: "ambiguous", reversible: false }, authorized: true });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("ambiguous-provider-outcome");
  });

  it("rejects unauthorized operator recovery", () => {
    expect(evaluateRecoveryCommand({ command: { type: "pause", organizationId: "org-a", mode: "test", reason: "pause" }, authorized: false }).reason).toBe("unauthorized");
  });
});
