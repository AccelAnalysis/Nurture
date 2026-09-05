import type { OrganizationCapability, PlatformCapability } from "../../platform/authorization.js";
import type {
  ModuleTrustDecision,
  ModuleTrustStatus,
  OrganizationId,
} from "./contracts.js";

export type EcosystemAction =
  | "module.register"
  | "module.review"
  | "module.trust"
  | "module.reject"
  | "module.deprecate"
  | "module.revoke"
  | "module.emergency-disable"
  | "installation.install"
  | "installation.configure"
  | "installation.publish"
  | "installation.upgrade"
  | "installation.disable"
  | "installation.uninstall"
  | "ecosystem.audit.view";

export interface EcosystemActor {
  actorId: string;
  platformCapabilities?: readonly PlatformCapability[];
  organizationId?: string;
  organizationCapabilities?: readonly OrganizationCapability[];
}

export interface EcosystemAuthorizationRequest {
  actor: EcosystemActor;
  action: EcosystemAction;
  organizationId?: OrganizationId;
}

export interface EcosystemAuthorizationDecision {
  allowed: boolean;
  reason: "allowed" | "platform-capability-required" | "organization-capability-required" | "organization-scope-mismatch";
  requiredCapability: PlatformCapability | OrganizationCapability;
}

export interface ModuleReviewArtifact {
  reviewedArtifactId: string;
  moduleId: string;
  moduleVersion: string;
  manifestDigest: string;
  submittedBy: string;
  submittedAt: string;
  source: "repository-build" | "signed-package";
}

export interface TrustTransitionRequest {
  actor: EcosystemActor;
  artifact: ModuleReviewArtifact;
  currentStatus?: ModuleTrustStatus;
  nextStatus: ModuleTrustStatus;
  decisionId: string;
  decidedAt?: string;
  safeSummary?: string;
}

const platformActions: Partial<Record<EcosystemAction, PlatformCapability>> = {
  "module.register": "product.manage",
  "module.review": "product.manage",
  "module.trust": "product.manage",
  "module.reject": "product.manage",
  "module.deprecate": "product.manage",
  "module.revoke": "product.manage",
  "module.emergency-disable": "operations.manage",
  "ecosystem.audit.view": "audit.view",
};

const organizationActions: Partial<Record<EcosystemAction, OrganizationCapability>> = {
  "installation.install": "experience.manage",
  "installation.configure": "experience.manage",
  "installation.publish": "experience.publish",
  "installation.upgrade": "experience.manage",
  "installation.disable": "experience.manage",
  "installation.uninstall": "experience.manage",
};

const trustTransitions: Readonly<Record<ModuleTrustStatus, readonly ModuleTrustStatus[]>> = {
  registered: ["under-review"],
  "under-review": ["trusted", "rejected"],
  trusted: ["deprecated", "revoked"],
  rejected: ["under-review"],
  deprecated: ["trusted", "revoked"],
  revoked: [],
};

export function authorizeEcosystemAction(request: EcosystemAuthorizationRequest): EcosystemAuthorizationDecision {
  const platformCapability = platformActions[request.action];
  if (platformCapability) {
    return request.actor.platformCapabilities?.includes(platformCapability)
      ? { allowed: true, reason: "allowed", requiredCapability: platformCapability }
      : { allowed: false, reason: "platform-capability-required", requiredCapability: platformCapability };
  }

  const organizationCapability = organizationActions[request.action];
  if (!organizationCapability) {
    throw new Error(`Unknown ecosystem action: ${request.action}`);
  }
  if (!request.organizationId || request.actor.organizationId !== request.organizationId) {
    return { allowed: false, reason: "organization-scope-mismatch", requiredCapability: organizationCapability };
  }
  return request.actor.organizationCapabilities?.includes(organizationCapability)
    ? { allowed: true, reason: "allowed", requiredCapability: organizationCapability }
    : { allowed: false, reason: "organization-capability-required", requiredCapability: organizationCapability };
}

function transitionAction(status: ModuleTrustStatus): EcosystemAction {
  switch (status) {
    case "registered": return "module.register";
    case "under-review": return "module.review";
    case "trusted": return "module.trust";
    case "rejected": return "module.reject";
    case "deprecated": return "module.deprecate";
    case "revoked": return "module.revoke";
  }
}

export function createTrustDecision(request: TrustTransitionRequest): ModuleTrustDecision {
  const action = transitionAction(request.nextStatus);
  const authorization = authorizeEcosystemAction({ actor: request.actor, action });
  if (!authorization.allowed) throw new Error(`Not authorized for ${action}: ${authorization.reason}.`);

  if (request.currentStatus === undefined) {
    if (request.nextStatus !== "registered") throw new Error("A module must enter governance as registered.");
  } else if (!trustTransitions[request.currentStatus].includes(request.nextStatus)) {
    throw new Error(`Invalid module trust transition ${request.currentStatus} -> ${request.nextStatus}.`);
  }

  if (request.nextStatus === "trusted" && request.artifact.submittedBy === request.actor.actorId) {
    throw new Error("A module submitter cannot approve their own artifact as trusted.");
  }

  return {
    moduleId: request.artifact.moduleId,
    moduleVersion: request.artifact.moduleVersion,
    status: request.nextStatus,
    decisionId: request.decisionId,
    reviewedArtifactId: request.artifact.reviewedArtifactId,
    manifestDigest: request.artifact.manifestDigest,
    decidedBy: request.actor.actorId,
    decidedAt: request.decidedAt ?? new Date().toISOString(),
    safeSummary: request.safeSummary,
  };
}

export function assertTrustDecisionMatchesArtifact(decision: ModuleTrustDecision, artifact: ModuleReviewArtifact): void {
  if (
    decision.moduleId !== artifact.moduleId
    || decision.moduleVersion !== artifact.moduleVersion
    || decision.reviewedArtifactId !== artifact.reviewedArtifactId
    || decision.manifestDigest !== artifact.manifestDigest
  ) {
    throw new Error("Trust decision does not match the reviewed module artifact.");
  }
}

export function assertOrganizationMutationScope(authoritativeOrganizationId: string, requestedOrganizationId: string): void {
  if (authoritativeOrganizationId !== requestedOrganizationId) {
    throw new Error("Experience ecosystem mutation crossed the validated organization boundary.");
  }
}

const SECRET_KEY = /(secret|password|credential|token|api.?key|private.?key|authorization|cookie)/i;

export function redactEcosystemAuditContext(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : "[non-finite]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactEcosystemAuditContext(item, depth + 1));
  if (typeof value !== "object") return "[unsupported]";
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
    result[key] = SECRET_KEY.test(key) ? "[redacted]" : redactEcosystemAuditContext(nested, depth + 1);
  }
  return result;
}

export function isInstallableTrustStatus(status: ModuleTrustStatus): boolean {
  return status === "trusted";
}
