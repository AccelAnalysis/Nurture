import { describe, expect, it } from "vitest";
import type { LifecycleEventEnvelope } from "../analytics/contracts";
import {
  integrationSuccess,
  type EventIntegrationPort,
  type IntegrationHealth,
} from "../platform/integrations";
import type { OrganizationCustomerBindingPort } from "../platform/tenant-binding";
import {
  createExperienceMilestoneRecorder,
  experienceMilestoneEffectId,
  type ExperienceMilestoneCommand,
} from "./lifecycle";
import {
  REFERENCE_ASSESSMENT_MILESTONE_KEY,
  REFERENCE_ASSESSMENT_MODULE_ID,
  REFERENCE_ASSESSMENT_MODULE_VERSION,
  REFERENCE_EXPERIENCE_EVIDENCE_VALIDATORS,
  REFERENCE_EXPERIENCE_MILESTONE_DEFINITIONS,
  referenceAssessmentEvidence,
} from "./reference-lifecycle";

function health(): IntegrationHealth {
  return { integration: "events", status: "ready", checkedAt: "2026-09-05T13:00:00.000Z" };
}

function eventPort(published: LifecycleEventEnvelope[]): EventIntegrationPort<LifecycleEventEnvelope> {
  return {
    async publish(event, context) {
      published.push(event);
      return integrationSuccess(undefined, {
        integration: "events",
        correlationId: context.correlationId,
      });
    },
    async publishBatch(events, context) {
      published.push(...events);
      return integrationSuccess(undefined, {
        integration: "events",
        correlationId: context.correlationId,
      });
    },
    async health() {
      return health();
    },
  };
}

const validBindingPort: OrganizationCustomerBindingPort = {
  async resolve(input) {
    return {
      status: "ready",
      binding: {
        organizationId: input.organizationId,
        customerId: "customer-1",
        identityId: input.identityId,
        status: "active",
        verifiedAt: "2026-09-05T12:59:00.000Z",
      },
    };
  },
};

function validCommand(overrides: Partial<ExperienceMilestoneCommand> = {}): ExperienceMilestoneCommand {
  return {
    identityId: "identity-1",
    organizationId: "org-1",
    experienceId: "org-1:primary:nurture.reference-assessment",
    moduleId: REFERENCE_ASSESSMENT_MODULE_ID,
    moduleVersion: REFERENCE_ASSESSMENT_MODULE_VERSION,
    milestoneKey: REFERENCE_ASSESSMENT_MILESTONE_KEY,
    actionId: "assessment-completed-action-1",
    evidence: referenceAssessmentEvidence({
      clarity: "very-clear",
      momentum: "strong",
      support: "prompt",
    }),
    correlationId: "correlation-1",
    dataMode: "test",
    ...overrides,
  };
}

describe("trusted Experience milestone recorder", () => {
  it("publishes a canonical customer milestone only after binding and domain evidence validation", async () => {
    const published: LifecycleEventEnvelope[] = [];
    const recorder = createExperienceMilestoneRecorder({
      definitions: REFERENCE_EXPERIENCE_MILESTONE_DEFINITIONS,
      evidenceValidators: REFERENCE_EXPERIENCE_EVIDENCE_VALIDATORS,
      bindingPort: validBindingPort,
      eventPort: eventPort(published),
      now: () => "2026-09-05T13:00:00.000Z",
    });

    const result = await recorder.record(validCommand());
    expect(result.status).toBe("accepted");
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      eventType: "experience.milestone_reached",
      organizationId: "org-1",
      customerId: "customer-1",
      subjectId: "customer-1",
      subjectKind: "customer",
      source: "domain_action",
      dataMode: "test",
      experienceModuleId: REFERENCE_ASSESSMENT_MODULE_ID,
      payload: {
        milestoneKey: REFERENCE_ASSESSMENT_MILESTONE_KEY,
        activation: true,
        completedQuestions: 3,
      },
    });
    expect(published[0].payload).not.toHaveProperty("answers");
  });

  it("gives a duplicate source action the same tenant- and mode-scoped logical identity", async () => {
    const published: LifecycleEventEnvelope[] = [];
    const recorder = createExperienceMilestoneRecorder({
      definitions: REFERENCE_EXPERIENCE_MILESTONE_DEFINITIONS,
      evidenceValidators: REFERENCE_EXPERIENCE_EVIDENCE_VALIDATORS,
      bindingPort: validBindingPort,
      eventPort: eventPort(published),
      now: () => "2026-09-05T13:00:00.000Z",
    });

    const command = validCommand();
    await recorder.record(command);
    await recorder.record(command);

    expect(published).toHaveLength(2);
    expect(published[0].eventId).toBe(published[1].eventId);
    expect(published[0].idempotencyKey).toBe(published[1].idempotencyKey);
    expect(published[0].eventId).toBe(experienceMilestoneEffectId({
      organizationId: "org-1",
      customerId: "customer-1",
      moduleId: REFERENCE_ASSESSMENT_MODULE_ID,
      moduleVersion: REFERENCE_ASSESSMENT_MODULE_VERSION,
      milestoneKey: REFERENCE_ASSESSMENT_MILESTONE_KEY,
      actionId: command.actionId,
      dataMode: "test",
    }));
  });

  it("rejects invalid domain evidence before the canonical event port", async () => {
    const published: LifecycleEventEnvelope[] = [];
    const recorder = createExperienceMilestoneRecorder({
      definitions: REFERENCE_EXPERIENCE_MILESTONE_DEFINITIONS,
      evidenceValidators: REFERENCE_EXPERIENCE_EVIDENCE_VALIDATORS,
      bindingPort: validBindingPort,
      eventPort: eventPort(published),
    });

    const result = await recorder.record(validCommand({
      evidence: referenceAssessmentEvidence({
        clarity: "fabricated-option",
        momentum: "strong",
        support: "prompt",
      }),
    }));
    expect(result).toMatchObject({ status: "rejected", reason: "evidence-invalid" });
    expect(published).toEqual([]);
  });

  it("rejects a wrong-tenant trusted binding", async () => {
    const published: LifecycleEventEnvelope[] = [];
    const wrongTenantPort: OrganizationCustomerBindingPort = {
      async resolve(input) {
        return {
          status: "ready",
          binding: {
            organizationId: "org-other",
            customerId: "customer-1",
            identityId: input.identityId,
            status: "active",
            verifiedAt: "2026-09-05T12:59:00.000Z",
          },
        };
      },
    };
    const recorder = createExperienceMilestoneRecorder({
      definitions: REFERENCE_EXPERIENCE_MILESTONE_DEFINITIONS,
      evidenceValidators: REFERENCE_EXPERIENCE_EVIDENCE_VALIDATORS,
      bindingPort: wrongTenantPort,
      eventPort: eventPort(published),
    });

    const result = await recorder.record(validCommand());
    expect(result).toMatchObject({ status: "rejected", reason: "binding-mismatch" });
    expect(published).toEqual([]);
  });

  it("rejects an unregistered module/version instead of accepting a forged privileged fact", async () => {
    const published: LifecycleEventEnvelope[] = [];
    const recorder = createExperienceMilestoneRecorder({
      definitions: REFERENCE_EXPERIENCE_MILESTONE_DEFINITIONS,
      evidenceValidators: REFERENCE_EXPERIENCE_EVIDENCE_VALIDATORS,
      bindingPort: validBindingPort,
      eventPort: eventPort(published),
    });

    const result = await recorder.record(validCommand({ moduleVersion: "999.0.0" }));
    expect(result).toMatchObject({ status: "rejected", reason: "definition-unregistered" });
    expect(published).toEqual([]);
  });
});
