import type { OrganizationMembership, OrganizationRole } from "../types/models";

export type OrganizationCapability =
  | "workspace.view"
  | "profile.manage"
  | "members.view"
  | "members.manage"
  | "roles.manage"
  | "contacts.view"
  | "contacts.manage"
  | "sequences.manage"
  | "templates.manage"
  | "surveys.manage"
  | "offers.manage"
  | "referrals.manage"
  | "feedback.view"
  | "analytics.view"
  | "billing.manage"
  | "settings.manage";

const managerCapabilities: OrganizationCapability[] = [
  "workspace.view",
  "members.view",
  "contacts.view",
  "contacts.manage",
  "sequences.manage",
  "templates.manage",
  "surveys.manage",
  "offers.manage",
  "referrals.manage",
  "feedback.view",
  "analytics.view",
];

const administratorCapabilities: OrganizationCapability[] = [
  ...managerCapabilities,
  "profile.manage",
  "members.manage",
  "roles.manage",
  "billing.manage",
  "settings.manage",
];

export function organizationCapabilitiesForRole(role: OrganizationRole): ReadonlySet<OrganizationCapability> {
  if (role === "owner" || role === "administrator") return new Set(administratorCapabilities);
  if (role === "manager") return new Set(managerCapabilities);
  return new Set();
}

export function organizationCan(membership: OrganizationMembership | null, capability: OrganizationCapability) {
  return Boolean(
    membership?.status === "active" && organizationCapabilitiesForRole(membership.role).has(capability),
  );
}

export const organizationSectionCapability: Record<string, OrganizationCapability> = {
  overview: "workspace.view",
  dashboard: "workspace.view",
  profile: "profile.manage",
  members: "members.view",
  roles: "roles.manage",
  invitations: "members.manage",
  contacts: "contacts.view",
  lifecycle: "contacts.view",
  sequences: "sequences.manage",
  templates: "templates.manage",
  surveys: "surveys.manage",
  offers: "offers.manage",
  referrals: "referrals.manage",
  feedback: "feedback.view",
  analytics: "analytics.view",
  billing: "billing.manage",
  settings: "settings.manage",
};

export type PlatformRole =
  | "super-administrator"
  | "administrator"
  | "support"
  | "read-only"
  | `custom:${string}`;

export type PlatformCapability =
  | "platform.view"
  | "organizations.view"
  | "organizations.manage"
  | "access.view"
  | "access.manage"
  | "product.view"
  | "product.manage"
  | "plans.view"
  | "plans.manage"
  | "communications.view"
  | "communications.manage"
  | "integrations.view"
  | "integrations.manage"
  | "operations.view"
  | "operations.manage"
  | "audit.view"
  | "settings.view"
  | "settings.manage";

const platformReadCapabilities: PlatformCapability[] = [
  "platform.view",
  "organizations.view",
  "access.view",
  "product.view",
  "plans.view",
  "communications.view",
  "integrations.view",
  "operations.view",
  "audit.view",
  "settings.view",
];

const platformManageCapabilities: PlatformCapability[] = [
  ...platformReadCapabilities,
  "organizations.manage",
  "access.manage",
  "product.manage",
  "plans.manage",
  "communications.manage",
  "integrations.manage",
  "operations.manage",
  "settings.manage",
];

export function platformCapabilitiesForRole(role: PlatformRole | null): ReadonlySet<PlatformCapability> {
  if (!role) return new Set();
  if (role === "super-administrator" || role === "administrator") return new Set(platformManageCapabilities);
  if (role === "support") return new Set([
    "platform.view",
    "organizations.view",
    "access.view",
    "communications.view",
    "integrations.view",
    "operations.view",
    "audit.view",
  ]);
  if (role === "read-only") return new Set(platformReadCapabilities);
  return new Set();
}

export const platformSectionCapability: Record<string, PlatformCapability> = {
  overview: "platform.view",
  organizations: "organizations.view",
  access: "access.view",
  product: "product.view",
  billing: "plans.view",
  communications: "communications.view",
  integrations: "integrations.view",
  operations: "operations.view",
  audit: "audit.view",
  settings: "settings.view",
};
