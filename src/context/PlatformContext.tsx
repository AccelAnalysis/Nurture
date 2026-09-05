import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getIdTokenResult } from "firebase/auth";
import { useAuth } from "../features/identity/auth";
import {
  platformCapabilitiesForRole,
  type PlatformCapability,
  type PlatformRole,
} from "../security/authorization";
import { resolvePlatformClaims } from "../security/platformClaims";

export type PlatformAuthorizationSource = "demo" | "custom-claims" | "signed-out" | "resolving" | "none";

interface PlatformContextValue {
  role: PlatformRole | null;
  can: (capability: PlatformCapability) => boolean;
  authorizationSource: PlatformAuthorizationSource;
  loading: boolean;
  error: string | null;
  enableDemo: (role?: PlatformRole) => void;
  clearDemo: () => void;
}

interface ClaimState {
  userId: string | null;
  role: PlatformRole | null;
  capabilities: readonly PlatformCapability[];
  error: string | null;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);
const DEMO_PLATFORM_ROLE_KEY = "nurture-demo-platform-role";
const DEMO_IDENTITY_ROLE_KEY = "nurture-demo-role";

const emptyClaimState: ClaimState = {
  userId: null,
  role: null,
  capabilities: [],
  error: null,
};

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { currentUser, firebaseUser, isDemo, loading: authLoading } = useAuth();
  const [demoPlatformRole, setDemoPlatformRole] = useState<PlatformRole | null>(() => {
    return sessionStorage.getItem(DEMO_PLATFORM_ROLE_KEY) as PlatformRole | null;
  });
  const [claimState, setClaimState] = useState<ClaimState>(emptyClaimState);
  const [claimLoading, setClaimLoading] = useState(false);

  const demoAllowed = Boolean(currentUser && isDemo && !firebaseUser);
  const needsClaimResolution = Boolean(
    currentUser
      && !isDemo
      && firebaseUser
      && claimState.userId !== firebaseUser.uid,
  );

  useEffect(() => {
    let cancelled = false;

    if (authLoading) return () => { cancelled = true; };

    if (!currentUser || isDemo || !firebaseUser) {
      setClaimState(emptyClaimState);
      setClaimLoading(false);
      return () => { cancelled = true; };
    }

    setClaimLoading(true);
    getIdTokenResult(firebaseUser)
      .then((tokenResult) => {
        if (cancelled) return;
        const resolved = resolvePlatformClaims(tokenResult.claims);
        setClaimState({
          userId: firebaseUser.uid,
          role: resolved.valid ? resolved.role : null,
          capabilities: resolved.valid ? resolved.capabilities : [],
          error: resolved.valid ? null : `Invalid Nurture platform claims (${resolved.reason ?? "unknown"}).`,
        });
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setClaimState({
          userId: firebaseUser.uid,
          role: null,
          capabilities: [],
          error: reason instanceof Error ? reason.message : "Unable to resolve platform authorization.",
        });
      })
      .finally(() => {
        if (!cancelled) setClaimLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, currentUser, firebaseUser, isDemo]);

  useEffect(() => {
    if (!currentUser) {
      sessionStorage.removeItem(DEMO_PLATFORM_ROLE_KEY);
      setDemoPlatformRole(null);
    }
  }, [currentUser]);

  const demoCapabilities = useMemo(
    () => platformCapabilitiesForRole(demoAllowed ? demoPlatformRole : null),
    [demoAllowed, demoPlatformRole],
  );
  const claimCapabilities = useMemo(() => new Set(claimState.capabilities), [claimState.capabilities]);

  const role = demoAllowed ? demoPlatformRole : claimState.role;
  const capabilities = demoAllowed ? demoCapabilities : claimCapabilities;
  const loading = authLoading || needsClaimResolution || claimLoading;
  const authorizationSource: PlatformAuthorizationSource = !currentUser
    ? "signed-out"
    : demoAllowed && demoPlatformRole
      ? "demo"
      : loading
        ? "resolving"
        : claimState.role
          ? "custom-claims"
          : "none";

  const value = useMemo<PlatformContextValue>(() => ({
    role,
    can: (capability) => Boolean(currentUser && !loading && capabilities.has(capability)),
    authorizationSource,
    loading,
    error: claimState.error,
    enableDemo(nextRole = "administrator") {
      // Demo platform authority is available only with the explicit demo
      // identity and never overlays a real Firebase-authenticated session.
      const demoIdentityRequested = Boolean(sessionStorage.getItem(DEMO_IDENTITY_ROLE_KEY));
      if (firebaseUser || !demoIdentityRequested) {
        sessionStorage.removeItem(DEMO_PLATFORM_ROLE_KEY);
        setDemoPlatformRole(null);
        return;
      }
      sessionStorage.setItem(DEMO_PLATFORM_ROLE_KEY, nextRole);
      setDemoPlatformRole(nextRole);
    },
    clearDemo() {
      sessionStorage.removeItem(DEMO_PLATFORM_ROLE_KEY);
      setDemoPlatformRole(null);
    },
  }), [authorizationSource, capabilities, claimState.error, currentUser, firebaseUser, loading, role]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) throw new Error("usePlatform must be used inside PlatformProvider.");
  return value;
}
