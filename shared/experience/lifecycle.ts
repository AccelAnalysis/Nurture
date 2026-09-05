import type {
  AnalyticsDataMode,
  EventPayload,
  LifecycleEventEnvelope,
} from "../analytics/contracts.js";
import { validateLifecycleEventEnvelope } from "../analytics/core.js";
import type {
  EventIntegrationPort,
  IntegrationResult,
} from "../platform/integrations.js";
import type {
  OrganizationCustomerBinding,
  OrganizationCustomerBindingPort,
} from "../platform/tenant-binding.js";
import { bindingMatchesScope } from "../platform/tenant-binding.js";

export interface ExperienceMilestoneDefinition {
  moduleId: string;
  moduleVersion: string;
  milestoneKey: string;
  description: string;
  activation: boolean;
  evidenceValidatorId: string;
  evidenceVersion: number;
}

export interface ExperienceMilestoneCommand {
  /** Trusted server identity from the authenticated request, never a browser claim. */
  identityId: string;
  /** Requested tenant scope; OrganizationCustomerBindingPort must independently verify it. */
  organizationId: string;
  experienceId: string;
  moduleId: string;
  moduleVersion: string;
  milestoneKey: string;
  /** Stable identifier for the owning domain action. Used in the logical effect identity. */
  actionId: string;
  /** Candidate evidence. It is not copied into lifecycle history and is untrusted until validated. */
  evidence: EventPayload;
  correlationId: string;
  dataMode: AnalyticsDataMode;
}

export type ExperienceMilestoneEvidenceResult =
  | {
      ok: true;
      /** Domain action occurrence time when the owning validator can establish one. */
      occurredAt?: string;
      /** Bounded, non-sensitive facts that are safe to project onto the global milestone event. */
      safePayload?: EventPayload;
    }
  | {
      ok: false;
      reason: string;
    };

export interface ExperienceMilestoneEvidenceValidator {
  validate(input: {
    definition: ExperienceMilestoneDefinition;
    command: ExperienceMilestoneCommand;
    binding: OrganizationCustomerBinding;
  }): Promise<ExperienceMilestoneEvidenceResult> | ExperienceMilestoneEvidenceResult;
}

export type ExperienceMilestoneRecordResult =
  | {
      status: "accepted";
      eventId: string;
      idempotencyKey: string;
    }
  | {
      status: "rejected";
      reason:
        | "definition-unregistered"
        | "binding-unavailable"
        | "binding-mismatch"
        | "validator-unavailable"
        | "evidence-invalid";
      detail: string;
    }
  | {
      status: "failed";
      reason: string;
      retryable: boolean;
    };

export interface ExperienceMilestoneRecorder {
  record(command: ExperienceMilestoneCommand): Promise<ExperienceMilestoneRecordResult>;
}

function requireIdentifier(label: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function encodeIdentityPart(value: string): string {
  return encodeURIComponent(requireIdentifier("identity part", value));
}

/**
 * Stable logical identity for a verified Experience milestone. Track E owns
 * durable de-duplication; this identity guarantees duplicate source actions are
 * handed to that boundary with the same tenant- and mode-scoped key.
 */
export function experienceMilestoneEffectId(input: {
  organizationId: string;
  customerId: string;
  moduleId: string;
  moduleVersion: string;
  milestoneKey: string;
  actionId: string;
  dataMode: AnalyticsDataMode;
}): string {
  return [
    "experience-milestone-v1",
    input.dataMode,
    input.organizationId,
    input.customerId,
    input.moduleId,
    input.moduleVersion,
    input.milestoneKey,
    input.actionId,
  ].map(encodeIdentityPart).join(":");
}

function findDefinition(
  definitions: readonly ExperienceMilestoneDefinition[],
  command: ExperienceMilestoneCommand,
): ExperienceMilestoneDefinition | undefined {
  return definitions.find((definition) => (
    definition.moduleId === command.moduleId
    && definition.moduleVersion === command.moduleVersion
    && definition.milestoneKey === command.milestoneKey
  ));
}

function publicationFailure(result: IntegrationResult<void>): ExperienceMilestoneRecordResult {
  if (result.ok) throw new Error("publicationFailure received a successful result.");
  return {
    status: "failed",
    reason: result.error.message,
    retryable: result.error.retryable,
  };
}

/**
 * Track B-owned verification policy composed with Track E's binding/event ports
 * and Track F's canonical envelope validator. This service deliberately has no
 * Firestore implementation and maintains no second event store.
 */
export function createExperienceMilestoneRecorder(input: {
  definitions: readonly ExperienceMilestoneDefinition[];
  evidenceValidators: Readonly<Record<string, ExperienceMilestoneEvidenceValidator>>;
  bindingPort: OrganizationCustomerBindingPort;
  eventPort: EventIntegrationPort<LifecycleEventEnvelope>;
  now?: () => string;
}): ExperienceMilestoneRecorder {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    async record(command) {
      const definition = findDefinition(input.definitions, command);
      if (!definition) {
        return {
          status: "rejected",
          reason: "definition-unregistered",
          detail: "The Experience did not register this milestone for the active module version.",
        };
      }

      const bindingResult = await input.bindingPort.resolve({
        organizationId: command.organizationId,
        identityId: command.identityId,
        correlationId: command.correlationId,
      });
      if (bindingResult.status !== "ready") {
        return {
          status: "rejected",
          reason: "binding-unavailable",
          detail: bindingResult.reason,
        };
      }
      const binding = bindingResult.binding;
      if (!bindingMatchesScope(binding, command.organizationId, command.identityId)) {
        return {
          status: "rejected",
          reason: "binding-mismatch",
          detail: "The trusted organization/customer binding does not match the requested scope.",
        };
      }

      const validator = input.evidenceValidators[definition.evidenceValidatorId];
      if (!validator) {
        return {
          status: "rejected",
          reason: "validator-unavailable",
          detail: "The owning domain evidence validator is unavailable.",
        };
      }
      const evidence = await validator.validate({ definition, command, binding });
      if (!evidence.ok) {
        return {
          status: "rejected",
          reason: "evidence-invalid",
          detail: evidence.reason,
        };
      }

      const effectId = experienceMilestoneEffectId({
        organizationId: binding.organizationId,
        customerId: binding.customerId,
        moduleId: definition.moduleId,
        moduleVersion: definition.moduleVersion,
        milestoneKey: definition.milestoneKey,
        actionId: command.actionId,
        dataMode: command.dataMode,
      });
      const receivedAt = now();
      const occurredAt = evidence.occurredAt ?? receivedAt;
      const event = validateLifecycleEventEnvelope({
        eventId: effectId,
        eventType: "experience.milestone_reached",
        schemaVersion: 1,
        organizationId: binding.organizationId,
        subjectId: binding.customerId,
        subjectKind: "customer",
        identityId: binding.identityId,
        customerId: binding.customerId,
        experienceId: command.experienceId,
        experienceModuleId: definition.moduleId,
        experienceModuleVersion: definition.moduleVersion,
        occurredAt,
        receivedAt,
        source: "domain_action",
        correlationId: command.correlationId,
        idempotencyKey: effectId,
        dataMode: command.dataMode,
        payload: {
          milestoneKey: definition.milestoneKey,
          activation: definition.activation,
          actionId: command.actionId,
          evidenceVersion: definition.evidenceVersion,
          ...(evidence.safePayload ?? {}),
        },
      });

      const publication = await input.eventPort.publish(event, {
        organizationId: binding.organizationId,
        correlationId: command.correlationId,
        idempotencyKey: effectId,
      });
      if (!publication.ok) return publicationFailure(publication);
      return {
        status: "accepted",
        eventId: effectId,
        idempotencyKey: effectId,
      };
    },
  };
}
