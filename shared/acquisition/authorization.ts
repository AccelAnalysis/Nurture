import {
  organizationRoleHasCapability,
  platformCapabilitiesForRole,
  type OrganizationRole,
  type PlatformRole,
} from "../platform/authorization.js";
import type { AuditWriteRequest } from "../platform/audit.js";
import type { AcquisitionCatalogId } from "./contracts.js";

export type AcquisitionTrustedActor =
  | {
      scope: "organization";
      actorId: string;
      organizationId: string;
      role: OrganizationRole;
    }
  | {
      scope: "platform";
      actorId: string;
      role: PlatformRole;
    };

export type AcquisitionOperation =
  | { kind: "read-organization"; organizationId: string }
  | { kind: "manage-organization"; organizationId: string }
  | { kind: "manage-automation"; organizationId: string; automationId: AcquisitionCatalogId }
  | { kind: "pause-platform" };

export class AcquisitionAuthorizationError extends Error {
  constructor(
    public readonly code: "forbidden" | "scope-mismatch",
    message: string,
  ) {
    super(message);
    this.name = "AcquisitionAuthorizationError";
  }
}

/**
 * This helper receives an actor already resolved from server-authoritative
 * membership/claims. It never converts a browser role string into authority.
 */
export function authorizeAcquisitionOperation(actor: AcquisitionTrustedActor, operation: AcquisitionOperation): void {
  if (actor.scope === "platform") {
    const capabilities = platformCapabilitiesForRole(actor.role);
    const required = operation.kind === "read-organization" ? "operations.view" : "operations.manage";
    if (!capabilities.has(required)) {
      throw new AcquisitionAuthorizationError("forbidden", `Platform role lacks ${required}.`);
    }
    return;
  }

  if (operation.kind === "pause-platform") {
    throw new AcquisitionAuthorizationError("forbidden", "Organization authority never grants a platform emergency pause.");
  }
  if (actor.organizationId !== operation.organizationId) {
    throw new AcquisitionAuthorizationError("scope-mismatch", "Organization actor cannot operate on another tenant.");
  }
  const required = operation.kind === "read-organization" ? "lifecycle.view" : "lifecycle.manage";
  if (!organizationRoleHasCapability(actor.role, required)) {
    throw new AcquisitionAuthorizationError("forbidden", `Organization role lacks ${required}.`);
  }
}

function safeReason(value: string): string {
  const normalized = value.replace(/[\r\n\t]+/g, " ").trim();
  return (normalized || "No reason supplied").slice(0, 500);
}

export function acquisitionPauseAuditRequest(input: {
  actor: AcquisitionTrustedActor;
  organizationId?: string;
  automationId?: AcquisitionCatalogId;
  paused: boolean;
  reason: string;
  correlationId?: string;
}): AuditWriteRequest {
  const scope = input.organizationId
    ? { kind: "organization" as const, organizationId: input.organizationId }
    : { kind: "platform" as const };
  return {
    schemaVersion: 1,
    action: input.automationId
      ? "acquisition.automation.pause_changed"
      : input.organizationId
        ? "acquisition.organization.pause_changed"
        : "acquisition.platform.pause_changed",
    scope,
    target: input.automationId
      ? { type: "acquisition-automation", id: input.automationId, organizationId: input.organizationId }
      : input.organizationId
        ? { type: "organization-acquisition-runtime", id: input.organizationId, organizationId: input.organizationId }
        : { type: "platform-acquisition-runtime", id: "global" },
    reason: safeReason(input.reason),
    change: { before: !input.paused, after: input.paused },
    metadata: {
      actorScope: input.actor.scope,
      requestedPause: input.paused,
    },
    correlationId: input.correlationId,
  };
}
