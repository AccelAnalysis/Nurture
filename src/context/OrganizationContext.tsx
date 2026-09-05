import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DEMO_ORG_ID, demoMemberships, demoOrganization } from "../data/demo";
import { useAuth } from "../features/identity/auth";
import { organizationCan, type OrganizationCapability } from "../security/authorization";
import type { Organization, OrganizationMembership, OrganizationRole } from "../types/models";

export type OrganizationAccessStatus = "ready" | "no-membership" | "unavailable" | "not-found";

export interface OrganizationAccess {
  organization: Organization | null;
  membership: OrganizationMembership | null;
  status: OrganizationAccessStatus;
  can: (capability: OrganizationCapability) => boolean;
}

interface OrganizationContextValue {
  organizations: Organization[];
  memberships: OrganizationMembership[];
  currentOrganizationId: string | null;
  organization: Organization | null;
  membership: OrganizationMembership | null;
  role: OrganizationRole | null;
  selectOrganization: (organizationId: string) => void;
  getAccess: (organizationId: string) => OrganizationAccess;
  can: (capability: OrganizationCapability, organizationId?: string) => boolean;
  canManage: boolean;
  canAdminister: boolean;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { currentUser, demoRole } = useAuth();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(DEMO_ORG_ID);

  const organizations = useMemo<Organization[]>(() => (currentUser && demoRole ? [demoOrganization] : []), [currentUser, demoRole]);
  const memberships = useMemo<OrganizationMembership[]>(() => {
    if (!currentUser || !demoRole) return [];
    const demoMembership = demoMemberships.find((item) => item.role === demoRole);
    return demoMembership
      ? [{ ...demoMembership, userId: currentUser.uid }]
      : [{ organizationId: DEMO_ORG_ID, userId: currentUser.uid, role: demoRole, status: "active" }];
  }, [currentUser, demoRole]);

  const getAccess = useCallback((organizationId: string): OrganizationAccess => {
    if (currentUser && !demoRole) {
      return {
        organization: null,
        membership: null,
        status: "unavailable",
        can: () => false,
      };
    }

    const organization = organizations.find((item) => item.id === organizationId) ?? null;
    if (!organization) {
      return { organization: null, membership: null, status: "not-found", can: () => false };
    }
    if (["suspended", "archived"].includes(organization.status)) {
      return { organization, membership: null, status: "unavailable", can: () => false };
    }

    const membership = memberships.find((item) => item.organizationId === organizationId && item.status === "active") ?? null;
    if (!membership) {
      return { organization, membership: null, status: "no-membership", can: () => false };
    }

    return {
      organization,
      membership,
      status: "ready",
      can: (capability) => organizationCan(membership, capability),
    };
  }, [currentUser, demoRole, memberships, organizations]);

  const currentOrganizationId = selectedOrganizationId ?? currentUser?.defaultOrganizationId ?? organizations[0]?.id ?? null;
  const currentAccess = currentOrganizationId ? getAccess(currentOrganizationId) : null;

  const value = useMemo<OrganizationContextValue>(() => ({
    organizations,
    memberships,
    currentOrganizationId,
    organization: currentAccess?.organization ?? null,
    membership: currentAccess?.membership ?? null,
    role: currentAccess?.membership?.role ?? null,
    selectOrganization: setSelectedOrganizationId,
    getAccess,
    can(capability, organizationId = currentOrganizationId ?? undefined) {
      return organizationId ? getAccess(organizationId).can(capability) : false;
    },
    canManage: currentAccess?.can("workspace.view") ?? false,
    canAdminister: currentAccess?.can("settings.manage") ?? false,
  }), [currentAccess, currentOrganizationId, getAccess, memberships, organizations]);

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const value = useContext(OrganizationContext);
  if (!value) throw new Error("useOrganization must be used inside OrganizationProvider.");
  return value;
}
