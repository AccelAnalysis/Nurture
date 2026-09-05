import type { ReactNode } from "react";
import { LoadingState } from "../../components/ui";
import { AuthPage, InvitationPage } from "../../pages/AuthPages";
import { navigate, type RouteState } from "../../router";
import { useAuth } from "./auth";

export const identityRoutes = {
  signIn: "/sign-in",
  legacyLogin: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  verifyEmail: "/verify-email",
  invitePrefix: "/invite",
} as const;

const identityPaths = new Set<string>([
  identityRoutes.signIn,
  identityRoutes.legacyLogin,
  identityRoutes.register,
  identityRoutes.forgotPassword,
  identityRoutes.verifyEmail,
]);

export function isIdentityRoute(route: RouteState) {
  return identityPaths.has(route.path) || route.segments[0] === "invite";
}

export function IdentityRouteBoundary({ route }: { route: RouteState }) {
  const [first, second] = route.segments;
  if (route.path === identityRoutes.legacyLogin) {
    queueMicrotask(() => navigate(`${identityRoutes.signIn}${window.location.search}`, true));
    return <LoadingState label="Opening sign in…" />;
  }
  if (route.path === identityRoutes.signIn) return <AuthPage mode="login" />;
  if (route.path === identityRoutes.register) return <AuthPage mode="register" />;
  if (route.path === identityRoutes.forgotPassword) return <AuthPage mode="forgot" />;
  if (route.path === identityRoutes.verifyEmail) return <AuthPage mode="verify" />;
  if (first === "invite" && second) return <InvitationPage invitationId={second} />;
  return null;
}

export function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const { currentUser, loading, error } = useAuth();
  if (loading) return <LoadingState />;
  if (error) return <div className="content-width"><div className="state-panel error-state">{error}</div></div>;
  if (!currentUser) {
    queueMicrotask(() => navigate(`${identityRoutes.signIn}?returnTo=${encodeURIComponent(window.location.pathname)}`, true));
    return <LoadingState label="Preparing sign in…" />;
  }
  return <>{children}</>;
}
