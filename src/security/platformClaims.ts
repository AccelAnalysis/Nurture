import {
  isPlatformCapability,
  isPlatformRole,
  platformCapabilitiesForRole,
  type PlatformCapability,
  type PlatformRole,
} from "./authorization";

export const PLATFORM_ROLE_CLAIM = "nurturePlatformRole";
export const PLATFORM_CAPABILITIES_CLAIM = "nurturePlatformCapabilities";

export interface ResolvedPlatformClaims {
  role: PlatformRole | null;
  capabilities: readonly PlatformCapability[];
  valid: boolean;
  reason?: "missing-role" | "invalid-role" | "invalid-custom-capabilities";
}

/**
 * Parse only the custom claims Track E owns. The browser may use the result to
 * render platform UI, but Cloud Functions / Security Rules must verify the same
 * claims independently for every privileged operation.
 */
export function resolvePlatformClaims(claims: Readonly<Record<string, unknown>>): ResolvedPlatformClaims {
  const rawRole = claims[PLATFORM_ROLE_CLAIM];
  if (rawRole === undefined || rawRole === null || rawRole === "") {
    return { role: null, capabilities: [], valid: true, reason: "missing-role" };
  }
  if (!isPlatformRole(rawRole)) {
    return { role: null, capabilities: [], valid: false, reason: "invalid-role" };
  }

  if (!rawRole.startsWith("custom:")) {
    return {
      role: rawRole,
      capabilities: [...platformCapabilitiesForRole(rawRole)],
      valid: true,
    };
  }

  const rawCapabilities = claims[PLATFORM_CAPABILITIES_CLAIM];
  if (!Array.isArray(rawCapabilities) || rawCapabilities.some((capability) => !isPlatformCapability(capability))) {
    return {
      role: rawRole,
      capabilities: [],
      valid: false,
      reason: "invalid-custom-capabilities",
    };
  }

  return {
    role: rawRole,
    capabilities: [...new Set(rawCapabilities as PlatformCapability[])],
    valid: true,
  };
}
