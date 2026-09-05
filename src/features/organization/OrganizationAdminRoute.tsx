import type { ReactNode } from "react";
import { EmptyState, LoadingState } from "../../components/ui";
import { useAuth } from "../identity/auth";
import { useOrganization } from "../../context/OrganizationContext";
import { navigate } from "../../router";
import type { OrganizationCapability } from "../../security/authorization";

export function OrganizationAdminRoute({
  organizationId,
  capability = "workspace.view",
  children,
}: {
  organizationId: string;
  capability?: OrganizationCapability;
  children: ReactNode;
}) {
  const { currentUser, loading } = useAuth();
  const { getAccess } = useOrganization();

  if (loading) return <LoadingState />;
  if (!currentUser) {
    queueMicrotask(() => navigate(`/sign-in?returnTo=${encodeURIComponent(window.location.pathname)}`, true));
    return <LoadingState label="Preparing sign in…" />;
  }

  const access = getAccess(organizationId);
  if (access.status === "unavailable") {
    return <div className="content-width access-state"><EmptyState title="Organization unavailable" description="Organization membership data is not available in this environment, or this organization is currently unavailable." /></div>;
  }
  if (access.status === "not-found") {
    return <div className="content-width access-state"><EmptyState title="Organization not found" description="The organization in this link could not be found." /></div>;
  }
  if (access.status === "no-membership") {
    return <div className="content-width access-state"><EmptyState title="No organization membership" description="This signed-in account is not an active member of this organization." /></div>;
  }
  if (!access.can(capability)) {
    return <div className="content-width access-state"><EmptyState title="Insufficient permission" description="Your organization membership does not include the capability required for this destination." /></div>;
  }

  return <>{children}</>;
}
