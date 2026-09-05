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
  const { currentUser, loading: authLoading } = useAuth();
  const {
    can,
    authorizationSource,
    loading: platformLoading,
    error,
  } = usePlatform();

  if (authLoading || platformLoading) return <LoadingState label="Resolving platform access…" />;
  if (!currentUser) {
    queueMicrotask(() => navigate(`/sign-in?returnTo=${encodeURIComponent(window.location.pathname)}`, true));
    return <LoadingState label="Preparing sign in…" />;
  }
  if (!can(capability)) {
    const description = error
      ? "Nurture could not validate this account's server-issued platform authorization. Sign in again or ask a platform administrator to review the account."
      : authorizationSource === "none"
        ? "This account has no server-issued Nurture platform role. Organization ownership or membership does not grant platform authority."
        : "Your Nurture platform role does not include the capability required for this destination.";

    return (
      <div className="content-width access-state">
        <EmptyState title="Platform access required" description={description} />
      </div>
    );
  }
  return <>{children}</>;
}
