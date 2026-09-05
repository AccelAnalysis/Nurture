import type { OrganizationMembership } from "../types/models";
import {
  organizationRoleHasCapability,
  type OrganizationCapability,
} from "../../shared/platform/authorization";

export * from "../../shared/platform/authorization";

/**
 * Browser-side membership adapter. This is a usability check only; trusted
 * backends and Firebase Security Rules must independently resolve membership
 * and enforce the same capability from the shared contract.
 */
export function organizationCan(
  membership: OrganizationMembership | null,
  capability: OrganizationCapability,
) {
  return Boolean(
    membership?.status === "active"
      && organizationRoleHasCapability(membership.role, capability),
  );
}
