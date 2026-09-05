import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../features/identity/auth";
import { platformCapabilitiesForRole, type PlatformCapability, type PlatformRole } from "../security/authorization";

interface PlatformContextValue {
  role: PlatformRole | null;
  can: (capability: PlatformCapability) => boolean;
  authorizationSource: "demo" | "server-claims-pending" | "signed-out";
  enableDemo: (role?: PlatformRole) => void;
  clearDemo: () => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);
const DEMO_PLATFORM_ROLE_KEY = "nurture-demo-platform-role";

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { currentUser, loading } = useAuth();
  const [demoPlatformRole, setDemoPlatformRole] = useState<PlatformRole | null>(() => {
    return sessionStorage.getItem(DEMO_PLATFORM_ROLE_KEY) as PlatformRole | null;
  });

  useEffect(() => {
    if (!loading && !currentUser && demoPlatformRole) {
      sessionStorage.removeItem(DEMO_PLATFORM_ROLE_KEY);
      setDemoPlatformRole(null);
    }
  }, [currentUser, demoPlatformRole, loading]);

  const capabilities = useMemo(() => platformCapabilitiesForRole(demoPlatformRole), [demoPlatformRole]);
  const value = useMemo<PlatformContextValue>(() => ({
    role: currentUser ? demoPlatformRole : null,
    can: (capability) => Boolean(currentUser && capabilities.has(capability)),
    authorizationSource: !currentUser ? "signed-out" : demoPlatformRole ? "demo" : "server-claims-pending",
    enableDemo(role = "administrator") {
      sessionStorage.setItem(DEMO_PLATFORM_ROLE_KEY, role);
      setDemoPlatformRole(role);
    },
    clearDemo() {
      sessionStorage.removeItem(DEMO_PLATFORM_ROLE_KEY);
      setDemoPlatformRole(null);
    },
  }), [capabilities, currentUser, demoPlatformRole]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) throw new Error("usePlatform must be used inside PlatformProvider.");
  return value;
}
