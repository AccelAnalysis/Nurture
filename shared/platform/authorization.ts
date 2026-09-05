export type OrganizationRole = "owner" | "administrator" | "manager" | "member";

/**
 * Canonical Release 1 organization capabilities. Browser code may use these
 * names for UX gating, while trusted backends and Security Rules must enforce
 * the same capability independently.
 */
export type OrganizationCapability =
  | "workspace.view"
  | "brand.view"
  | "brand.manage"
  | "brand.publish"
  | "offers.view"
  | "offers.manage"
  | "offers.publish"
  | "experience.view"
  | "experience.manage"
  | "experience.publish"
  | "onboarding.view"
  | "onboarding.manage"
  | "onboarding.publish"
  | "customers.view"
  | "customers.manage"
  | "customers.export"
  | "lifecycle.view"
  | "lifecycle.manage"
  | "communications.view"
  | "communications.manage"
  | "surveys.view"
  | "surveys.manage"
  | "referrals.view"
  | "referrals.manage"
  | "analytics.view"
  | "billing.view"
  | "billing.manage"
  | "team.view"
  | "team.manage"
  | "audit.view"
  | "settings.view"
  | "settings.manage"
  // Compatibility names retained while the original skeleton routes migrate.
  | "profile.manage"
  | "members.view"
  | "members.manage"
  | "roles.manage"
  | "contacts.view"
  | "contacts.manage"
  | "sequences.manage"
  | "templates.manage"
  | "feedback.view";

const managerCapabilities: readonly OrganizationCapability[] = [
  "workspace.view",
  "brand.view",
  "brand.manage",
  "offers.view",
  "offers.manage",
  "experience.view",
  "experience.manage",
  "onboarding.view",
  "onboarding.manage",
  "customers.view",
  "customers.manage",
  "lifecycle.view",
  "lifecycle.manage",
  "communications.view",
  "communications.manage",
  "surveys.view",
  "surveys.manage",
  "referrals.view",
  "referrals.manage",
  "analytics.view",
  "team.view",
  // Legacy skeleton destinations map to the same Release 1 authority.
  "members.view",
  "contacts.view",
  "contacts.manage",
  "sequences.manage",
  "templates.manage",
  "feedback.view",
];

const administratorCapabilities: readonly OrganizationCapability[] = [
  ...managerCapabilities,
  "brand.publish",
  "offers.publish",
  "experience.publish",
  "onboarding.publish",
  "customers.export",
  "billing.view",
  "billing.manage",
  "team.manage",
  "audit.view",
  "settings.view",
  "settings.manage",
  // Compatibility names retained for the current organization shell.
  "profile.manage",
  "members.manage",
  "roles.manage",
];

export const organizationRoleCapabilityPresets: Readonly<Record<OrganizationRole, readonly OrganizationCapability[]>> = {
  owner: administratorCapabilities,
  administrator: administratorCapabilities,
  manager: managerCapabilities,
  member: [],
};

export function isOrganizationRole(value: unknown): value is OrganizationRole {
  return value === "owner" || value === "administrator" || value === "manager" || value === "member";
}

export function organizationCapabilitiesForRole(role: OrganizationRole): ReadonlySet<OrganizationCapability> {
  return new Set(organizationRoleCapabilityPresets[role]);
}

export function organizationRoleHasCapability(role: OrganizationRole, capability: OrganizationCapability): boolean {
  return organizationCapabilitiesForRole(role).has(capability);
}

export const organizationSectionCapability: Record<string, OrganizationCapability> = {
  overview: "workspace.view",
  dashboard: "workspace.view",
  brand: "brand.view",
  site: "brand.view",
  offers: "offers.view",
  experience: "experience.view",
  onboarding: "onboarding.view",
  customers: "customers.view",
  lifecycle: "lifecycle.view",
  communications: "communications.view",
  surveys: "surveys.view",
  referrals: "referrals.view",
  analytics: "analytics.view",
  billing: "billing.view",
  team: "team.view",
  audit: "audit.view",
  settings: "settings.view",
  // Legacy skeleton destinations.
  profile: "settings.view",
  members: "team.view",
  roles: "team.manage",
  invitations: "team.manage",
  contacts: "customers.view",
  sequences: "lifecycle.view",
  templates: "communications.view",
  feedback: "customers.view",
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

export const platformCapabilities: readonly PlatformCapability[] = [
  "platform.view",
  "organizations.view",
  "organizations.manage",
  "access.view",
  "access.manage",
  "product.view",
  "product.manage",
  "plans.view",
  "plans.manage",
  "communications.view",
  "communications.manage",
  "integrations.view",
  "integrations.manage",
  "operations.view",
  "operations.manage",
  "audit.view",
  "settings.view",
  "settings.manage",
];

const platformCapabilitySet = new Set<PlatformCapability>(platformCapabilities);
const platformReadCapabilities: readonly PlatformCapability[] = [
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

const platformManageCapabilities: readonly PlatformCapability[] = [
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

export const platformRoleCapabilityPresets = {
  "super-administrator": platformManageCapabilities,
  administrator: platformManageCapabilities,
  support: [
    "platform.view",
    "organizations.view",
    "access.view",
    "communications.view",
    "integrations.view",
    "operations.view",
    "audit.view",
  ],
  "read-only": platformReadCapabilities,
} as const satisfies Record<"super-administrator" | "administrator" | "support" | "read-only", readonly PlatformCapability[]>;

export function isPlatformRole(value: unknown): value is PlatformRole {
  if (typeof value !== "string") return false;
  return value === "super-administrator"
    || value === "administrator"
    || value === "support"
    || value === "read-only"
    || (value.startsWith("custom:") && value.length > 7 && value.length <= 80);
}

export function isPlatformCapability(value: unknown): value is PlatformCapability {
  return typeof value === "string" && platformCapabilitySet.has(value as PlatformCapability);
}

export function platformCapabilitiesForRole(role: PlatformRole | null): ReadonlySet<PlatformCapability> {
  if (role === "super-administrator" || role === "administrator" || role === "support" || role === "read-only") {
    return new Set(platformRoleCapabilityPresets[role]);
  }
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
