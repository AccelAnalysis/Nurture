import type {
  AcquisitionDefinitionPort,
  AcquisitionEmailDispatchPort,
  AcquisitionEmailEligibilityInput,
  AcquisitionEmailSubmitInput,
  AcquisitionEmailSubmitResult,
  AcquisitionMessagePurpose,
} from "./contracts.js";
import { createAcquisitionRuntime, type AcquisitionRuntimeDependencies } from "./runtime.js";

export interface AcquisitionFrequencyReservationInput {
  organizationId: string;
  subjectId: string;
  dataMode: AcquisitionEmailSubmitInput["dataMode"];
  purpose: AcquisitionMessagePurpose;
  effectId: string;
  windowSeconds: number;
  maxProviderAcceptedEffects: number;
  reservedAt: string;
}

export type AcquisitionFrequencyReservationResult =
  | { status: "reserved" | "duplicate"; reservationId: string }
  | { status: "cap-reached" };

/**
 * Durable implementation must reserve atomically across all workers. The same
 * logical effect is idempotent (`duplicate` is allowed), while a distinct effect
 * may reserve only when accepted effects plus active reservations remain below
 * the definition's cap for the subject/purpose/mode window.
 */
export interface AcquisitionFrequencyReservationPort {
  reserve(input: AcquisitionFrequencyReservationInput): Promise<AcquisitionFrequencyReservationResult>;
  release(input: { reservationId: string; effectId: string; releasedAt: string; reason: string }): Promise<void>;
}

function definitionFor(
  definitions: AcquisitionDefinitionPort,
  input: AcquisitionEmailEligibilityInput,
) {
  return definitions.getVersion({
    organizationId: input.organizationId,
    automationId: input.automationId,
    versionId: input.automationVersionId,
  });
}

/**
 * Integration-layer E executor guard. The base Track E runtime still performs a
 * cheap accepted-count precheck, but this wrapper is the authoritative admission
 * immediately before D's `submit` boundary and closes the multi-worker race.
 */
export function createFrequencyCappedEmailDispatchPort(input: {
  definitions: AcquisitionDefinitionPort;
  frequencyReservations: AcquisitionFrequencyReservationPort;
  email: AcquisitionEmailDispatchPort;
  now?: () => string;
}): AcquisitionEmailDispatchPort {
  const now = input.now ?? (() => new Date().toISOString());
  return {
    evaluate(request) {
      return input.email.evaluate(request);
    },
    async submit(request): Promise<AcquisitionEmailSubmitResult> {
      const definition = await definitionFor(input.definitions, request);
      if (!definition) return { status: "permanent-failure", reason: "Pinned automation definition is unavailable at dispatch." };
      const step = definition.steps.find((candidate) => candidate.stepId === request.stepId);
      if (!step) return { status: "permanent-failure", reason: "Pinned automation step is unavailable at dispatch." };
      if (step.action.purpose !== request.purpose || step.action.templateId !== request.templateId || step.action.templateVersion !== request.templateVersion) {
        return { status: "permanent-failure", reason: "Dispatch request does not match the pinned automation action." };
      }

      const reservation = await input.frequencyReservations.reserve({
        organizationId: request.organizationId,
        subjectId: request.subjectId,
        dataMode: request.dataMode,
        purpose: request.purpose,
        effectId: request.effectId,
        windowSeconds: definition.frequencyPolicy.windowSeconds,
        maxProviderAcceptedEffects: definition.frequencyPolicy.maxProviderAcceptedEffects,
        reservedAt: now(),
      });
      if (reservation.status === "cap-reached") {
        return { status: "suppressed", reason: "frequency-cap-reached" };
      }

      let result: AcquisitionEmailSubmitResult;
      try {
        result = await input.email.submit(request);
      } catch (error) {
        // The provider outcome may be ambiguous. Retain the reservation so another
        // worker cannot consume the same cap slot and blindly amplify exposure.
        throw error;
      }

      if (result.status === "suppressed" || result.status === "permanent-failure") {
        await input.frequencyReservations.release({
          reservationId: reservation.reservationId,
          effectId: request.effectId,
          releasedAt: now(),
          reason: result.status,
        });
      }
      // accepted, retryable, and unknown outcomes retain the slot. A retry of the
      // same effect receives `duplicate`; unknown outcomes require reconciliation.
      return result;
    },
  };
}

/**
 * The Release 2 finisher must compose this executor, not the raw Track E runtime,
 * for any worker that can reach an external provider.
 */
export function createAcquisitionExecutor(
  dependencies: AcquisitionRuntimeDependencies & { frequencyReservations: AcquisitionFrequencyReservationPort },
) {
  return createAcquisitionRuntime({
    ...dependencies,
    email: createFrequencyCappedEmailDispatchPort({
      definitions: dependencies.definitions,
      frequencyReservations: dependencies.frequencyReservations,
      email: dependencies.email,
      now: dependencies.now,
    }),
  });
}
