import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEMO_ORG_ID, demoMemberships, demoOrganization } from "../data/demo";
import { useAuth } from "./AuthContext";
import type { Organization, OrganizationMembership, OrganizationRole } from "../types/models";

interface OrganizationContextValue {
  organization: Organization | null;
  membership: OrganizationMembership | null;
  role: OrganizationRole | null;
  canManage: boolean;
  canAdminister: boolean;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { currentUser, demoRole } = useAuth();
  const value = useMemo<OrganizationContextValue>(() => {
    if (!currentUser) return { organization: null, membership: null, role: null, canManage: false, canAdminister: false };
    const role = demoRole ?? "member";
    const membership = demoMemberships.find((item) => item.role === role) ?? null;
    return {
      organization: demoOrganization,
      membership: membership ?? { organizationId: DEMO_ORG_ID, userId: currentUser.uid, role, status: "active" },
      role,
      canManage: ["owner", "administrator", "manager"].includes(role),
      canAdminister: ["owner", "administrator"].includes(role),
    };
  }, [currentUser, demoRole]);

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const value = useContext(OrganizationContext);
  if (!value) throw new Error("useOrganization must be used inside OrganizationProvider.");
  return value;
}
