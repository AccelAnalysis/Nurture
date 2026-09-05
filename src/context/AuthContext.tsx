import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { authService } from "../services/authService";
import { demoUser } from "../data/demo";
import type { NurtureUser, OrganizationRole } from "../types/models";

interface AuthContextValue {
  firebaseUser: User | null;
  currentUser: NurtureUser | null;
  loading: boolean;
  error: string | null;
  demoRole: OrganizationRole | null;
  isDemo: boolean;
  signInDemo: (role?: OrganizationRole) => void;
  clearDemo: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const DEMO_KEY = "nurture-demo-role";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [demoRole, setDemoRole] = useState<OrganizationRole | null>(() => {
    const saved = sessionStorage.getItem(DEMO_KEY);
    return (saved as OrganizationRole | null) ?? null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: () => void = () => {};
    authService
      .initializePersistence()
      .then(() => {
        unsubscribe = authService.observe((user) => {
          setFirebaseUser(user);
          setLoading(false);
        });
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Unable to initialize authentication.");
        setLoading(false);
      });
    const fallback = window.setTimeout(() => setLoading(false), 250);
    return () => {
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, []);

  const currentUser = useMemo<NurtureUser | null>(() => {
    if (demoRole) return demoUser;
    if (!firebaseUser) return null;
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      phone: firebaseUser.phoneNumber,
      status: "active",
      createdAt: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      onboardingStatus: "in-progress",
      preferences: { theme: "system", emailNotifications: true, smsNotifications: false, pushNotifications: true },
      lastActiveAt: firebaseUser.metadata.lastSignInTime,
      isAnonymous: firebaseUser.isAnonymous,
    };
  }, [demoRole, firebaseUser]);

  const value: AuthContextValue = {
    firebaseUser,
    currentUser,
    loading,
    error,
    demoRole,
    isDemo: Boolean(demoRole),
    signInDemo(role = "member") {
      sessionStorage.setItem(DEMO_KEY, role);
      setDemoRole(role);
    },
    clearDemo() {
      sessionStorage.removeItem(DEMO_KEY);
      setDemoRole(null);
    },
    async signOut() {
      sessionStorage.removeItem(DEMO_KEY);
      setDemoRole(null);
      await authService.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
