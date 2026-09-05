import type { ReactNode } from "react";
import { ErrorState, LoadingState } from "../../components/ui";
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
  if (error) return <div className="content-width"><ErrorState message={error} /></div>;
  if (!currentUser) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    queueMicrotask(() => navigate(`${identityRoutes.signIn}?returnTo=${encodeURIComponent(returnTo)}`, true));
    return <LoadingState label="Preparing sign in…" />;
  }
  return <>{children}</>;
}

/**
 * Participant routes require completed onboarding, but organization/platform
 * administration and commercial routes keep their separate authorization and
 * lifecycle rules. Demo sessions intentionally bypass this production gate.
 */
export function OnboardingCompleteRoute({ children }: { children: ReactNode }) {
  const { currentUser, isDemo, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!isDemo && currentUser && currentUser.onboardingStatus !== "complete") {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    queueMicrotask(() => navigate(`/onboarding?returnTo=${encodeURIComponent(returnTo)}`, true));
    return <LoadingState label="Opening onboarding…" />;
  }
  return <>{children}</>;
}
