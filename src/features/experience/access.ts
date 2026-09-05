import type {
  Entitlement,
  EntitlementPresentationSnapshot,
  Experience,
  ExperienceAccessMode,
  ExperienceCapabilityDecision,
  ExperienceModuleManifest,
} from "./contracts";

interface CapabilityResolutionInput {
  manifest: ExperienceModuleManifest;
  experience: Experience;
  capabilityKey: string;
  accessMode: ExperienceAccessMode;
  authenticated: boolean;
  organizationId?: string;
  customerId?: string;
  snapshot?: EntitlementPresentationSnapshot;
  now?: Date;
}

function denied(capabilityKey: string, reason: ExperienceCapabilityDecision["reason"], explanation: string): ExperienceCapabilityDecision {
  return { allowed: false, capabilityKey, reason, explanation };
}

function activeEntitlement(entitlement: Entitlement, now: Date): boolean {
  if (entitlement.status !== "active") return false;
  if (!entitlement.expiresAt) return true;
  return new Date(entitlement.expiresAt).getTime() > now.getTime();
}

/**
 * Resolves presentation access only. Protected operations must repeat the same
 * decision against trusted backend state; this resolver never upgrades access
 * from a URL, checkout success screen, local storage value, or staff role.
 */
export function resolveExperienceCapability({
  manifest,
  experience,
  capabilityKey,
  accessMode,
  authenticated,
  organizationId,
  customerId,
  snapshot,
  now = new Date(),
}: CapabilityResolutionInput): ExperienceCapabilityDecision {
  const capability = manifest.capabilities.find((item) => item.key === capabilityKey);
  if (!capability) {
    return denied(capabilityKey, "capability-undeclared", "This Experience module does not declare that capability.");
  }

  if (!capability.availability.includes(accessMode)) {
    const authenticationRequired = capability.availability.includes("authenticated") && accessMode !== "authenticated";
    return denied(
      capabilityKey,
      authenticationRequired ? "authentication-required" : "mode-not-supported",
      authenticationRequired
        ? "Create or sign in to an account to use this capability."
        : "This capability is not available in the current Experience access mode.",
    );
  }

  if (accessMode === "authenticated" && !authenticated) {
    return denied(capabilityKey, "authentication-required", "An authenticated account is required for this capability.");
  }

  if (!capability.requiresEntitlement) {
    return {
      allowed: true,
      capabilityKey,
      reason: "mode-grant",
      explanation: "The module explicitly exposes this capability in the current access mode.",
    };
  }

  if (!snapshot || snapshot.trust !== "server-derived") {
    return denied(
      capabilityKey,
      "trusted-entitlement-unavailable",
      "Nurture has not received a trusted entitlement snapshot for this capability.",
    );
  }

  if (!organizationId || !customerId || snapshot.organizationId !== organizationId || snapshot.customerId !== customerId) {
    return denied(capabilityKey, "scope-mismatch", "The entitlement snapshot does not match the current organization and customer scope.");
  }

  const matching = snapshot.entitlements.filter((entitlement) =>
    entitlement.organizationId === organizationId
    && entitlement.customerId === customerId
    && entitlement.experienceId === experience.id
    && entitlement.capabilityKey === capabilityKey,
  );

  const entitlement = matching.find((item) => activeEntitlement(item, now));
  if (!entitlement) {
    const expired = matching.some((item) => item.status === "expired" || (item.expiresAt && new Date(item.expiresAt).getTime() <= now.getTime()));
    return denied(
      capabilityKey,
      expired ? "entitlement-expired" : "entitlement-not-granted",
      expired ? "The entitlement for this capability is no longer active." : "The current customer does not have this capability.",
    );
  }

  if (entitlement.kind === "allowance" && (entitlement.remaining ?? 0) <= 0) {
    return denied(capabilityKey, "quota-exhausted", "The current allowance for this capability has been used.");
  }

  return {
    allowed: true,
    capabilityKey,
    reason: "entitlement-grant",
    explanation: "A trusted, active entitlement grants this capability for the current scope.",
    entitlement,
  };
}
