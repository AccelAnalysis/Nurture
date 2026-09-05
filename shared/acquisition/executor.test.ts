import { describe, expect, it } from "vitest";
import type {
  AcquisitionAutomationDefinition,
  AcquisitionDefinitionPort,
  AcquisitionEmailDispatchPort,
  AcquisitionEmailEligibilityInput,
  AcquisitionEmailSubmitInput,
  AcquisitionEmailSubmitResult,
} from "./contracts";
import {
  createFrequencyCappedEmailDispatchPort,
  type AcquisitionFrequencyReservationInput,
  type AcquisitionFrequencyReservationPort,
} from "./executor";

const definition: AcquisitionAutomationDefinition = {
  schemaVersion: 1,
  organizationId: "org-a",
  automationId: "R2-LEAD",
  versionId: "v1",
  enabled: true,
  triggerEventType: "lead.created",
  allowedTriggerSources: ["domain_action"],
  predicates: ["subject.active", "registration.incomplete"],
  stopRules: ["subject.deleted", "registration.completed"],
  steps: [{
    stepId: "follow-up",
    schedule: { kind: "after-trigger", delaySeconds: 60 },
    action: { kind: "email", templateId: "lead-follow-up", templateVersion: 1, purpose: "marketing" },
  }],
  expirationSeconds: 86_400,
  retryPolicy: { maxAttempts: 3, baseBackoffSeconds: 60, maxBackoffSeconds: 3_600 },
  frequencyPolicy: { maxProviderAcceptedEffects: 1, windowSeconds: 86_400 },
  publishedAt: "2026-09-05T12:00:00.000Z",
};

const definitions: AcquisitionDefinitionPort = {
  async listPublishedForTrigger() { return [definition]; },
  async getVersion(input) {
    return input.organizationId === definition.organizationId
      && input.automationId === definition.automationId
      && input.versionId === definition.versionId ? definition : null;
  },
};

function request(effectId: string): AcquisitionEmailSubmitInput {
  return {
    organizationId: "org-a",
    subjectKind: "lead",
    subjectId: "lead-1",
    leadId: "lead-1",
    automationId: "R2-LEAD",
    automationVersionId: "v1",
    dataMode: "test",
    effectId,
    stepId: "follow-up",
    templateId: "lead-follow-up",
    templateVersion: 1,
    purpose: "marketing",
    recipientRef: "lead:lead-1",
    correlationId: "corr-1",
    idempotencyKey: effectId,
  };
}

class Reservations implements AcquisitionFrequencyReservationPort {
  slots = new Map<string, AcquisitionFrequencyReservationInput>();
  async reserve(input: AcquisitionFrequencyReservationInput) {
    const existing = this.slots.get(input.effectId);
    if (existing) return { status: "duplicate" as const, reservationId: input.effectId };
    const active = [...this.slots.values()].filter((slot) =>
      slot.organizationId === input.organizationId
      && slot.subjectId === input.subjectId
      && slot.dataMode === input.dataMode
      && slot.purpose === input.purpose).length;
    if (active >= input.maxProviderAcceptedEffects) return { status: "cap-reached" as const };
    this.slots.set(input.effectId, structuredClone(input));
    return { status: "reserved" as const, reservationId: input.effectId };
  }
  async release(input: { reservationId: string; effectId: string }) {
    if (input.reservationId === input.effectId) this.slots.delete(input.effectId);
  }
}

function email(outcome: AcquisitionEmailSubmitResult = { status: "provider-accepted", acceptedAt: "2026-09-05T13:00:00Z", messageId: "msg-1" }) {
  const submissions: AcquisitionEmailSubmitInput[] = [];
  const port: AcquisitionEmailDispatchPort = {
    async evaluate(input: AcquisitionEmailEligibilityInput) {
      return { status: "eligible", checkedAt: "2026-09-05T13:00:00Z", recipientRef: `${input.subjectKind}:${input.subjectId}` };
    },
    async submit(input) {
      submissions.push(structuredClone(input));
      return structuredClone(outcome);
    },
  };
  return { port, submissions };
}

describe("Release 2 acquisition executor frequency admission", () => {
  it("allows one distinct effect and suppresses a concurrent distinct effect at a one-slot cap", async () => {
    const frequencyReservations = new Reservations();
    const provider = email();
    const guarded = createFrequencyCappedEmailDispatchPort({ definitions, frequencyReservations, email: provider.port });
    const [first, second] = await Promise.all([guarded.submit(request("effect-1")), guarded.submit(request("effect-2"))]);
    expect([first.status, second.status].sort()).toEqual(["provider-accepted", "suppressed"]);
    expect(provider.submissions).toHaveLength(1);
  });

  it("treats a retry of the same logical effect as the same reservation", async () => {
    const frequencyReservations = new Reservations();
    const provider = email({ status: "retryable-failure", reason: "temporary" });
    const guarded = createFrequencyCappedEmailDispatchPort({ definitions, frequencyReservations, email: provider.port });
    expect((await guarded.submit(request("effect-1"))).status).toBe("retryable-failure");
    expect((await guarded.submit(request("effect-1"))).status).toBe("retryable-failure");
    expect(provider.submissions).toHaveLength(2);
    expect(frequencyReservations.slots.size).toBe(1);
  });

  it("releases a known terminal pre-acceptance result but retains unknown outcomes", async () => {
    const frequencyReservations = new Reservations();
    const terminal = email({ status: "permanent-failure", reason: "rejected" });
    const terminalGuard = createFrequencyCappedEmailDispatchPort({ definitions, frequencyReservations, email: terminal.port });
    await terminalGuard.submit(request("effect-terminal"));
    expect(frequencyReservations.slots.size).toBe(0);

    const unknown = email({ status: "unknown-outcome", reason: "ambiguous" });
    const unknownGuard = createFrequencyCappedEmailDispatchPort({ definitions, frequencyReservations, email: unknown.port });
    await unknownGuard.submit(request("effect-unknown"));
    expect(frequencyReservations.slots.has("effect-unknown")).toBe(true);
  });
});
