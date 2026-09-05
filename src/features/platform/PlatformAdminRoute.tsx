import type { ReactNode } from "react";
import { EmptyState, LoadingState } from "../../components/ui";
import { useAuth } from "../identity/auth";
import { usePlatform } from "../../context/PlatformContext";
import { navigate } from "../../router";
import type { PlatformCapability } from "../../security/authorization";

export function PlatformAdminRoute({
  capability = "platform.view",
  children,
}: {
  capability?: PlatformCapability;
  children: ReactNode;
}) {
  const { currentUser, loading } = useAuth();
  const { can, authorizationSource } = usePlatform();

  if (loading) return <LoadingState />;
  if (!currentUser) {
    queueMicrotask(() => navigate(`/sign-in?returnTo=${encodeURIComponent(window.location.pathname)}`, true));
    return <LoadingState label="Preparing sign in…" />;
  }
  if (!can(capability)) {
    return (
      <div className="content-width access-state">
        <EmptyState
          title="Platform access required"
          description={authorizationSource === "server-claims-pending"
            ? "This account has no resolved server-authoritative Nurture platform role. Platform access must ultimately come from Firebase custom claims or an equivalent trusted backend source."
            : "Your Nurture platform role does not include the capability required for this destination."}
        />
      </div>
    );
  }
  return <>{children}</>;
}
