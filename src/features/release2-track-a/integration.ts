export { installAuthoritativeCustomerWorkspacePort } from "../customer-workspace/port";
export type { CustomerWorkspacePort } from "../customer-workspace/contracts";
export { CustomerWorkspaceDetailPage, CustomerWorkspaceListPage } from "../customer-workspace/CustomerWorkspacePages";
export { installAuthoritativeLifecycleAutomationPort } from "../lifecycle-admin/port";
export type { LifecycleAutomationPort } from "../lifecycle-admin/contracts";
export { LifecycleConfigurationPage } from "../lifecycle-admin/LifecycleConfigurationPage";

/**
 * Shared router/sidebar files are Release 2 finisher-owned. This metadata is the
 * additive Track A handoff that the finisher can consume during composition.
 */
export const release2TrackAOrganizationDestinations = [
  {
    label: "Customers",
    suffix: "/customers",
    viewCapability: "customers.view",
    manageCapability: "customers.manage",
    routeKinds: ["list", "detail"] as const,
  },
  {
    label: "Lifecycle",
    suffix: "/lifecycle",
    viewCapability: "lifecycle.view",
    manageCapability: "lifecycle.manage",
    routeKinds: ["configuration", "run-history"] as const,
  },
] as const;

export const release2TrackACompatibilityRedirects = [
  { fromSuffix: "/contacts", toSuffix: "/customers" },
  { fromSuffix: "/sequences", toSuffix: "/lifecycle" },
] as const;
