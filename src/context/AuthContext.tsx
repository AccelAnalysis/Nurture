import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { authService } from "../services/authService";
import { firebaseConfigured } from "../firebase";
import { demoUser } from "../data/demo";
import type { NurtureUser, OrganizationRole } from "../types/models";
import type { CustomerProfile, CustomerProfileChanges, IdentitySession } from "../features/identity/model/contracts";
import { customerProfileRepository } from "../features/identity/services/customerProfileRepository";

export interface AuthContextValue {
  firebaseUser: User | null;
  identity: IdentitySession | null;
  customerProfile: CustomerProfile | null;
  currentUser: NurtureUser | null;
  loading: boolean;
  error: string | null;
  demoRole: OrganizationRole | null;
  isDemo: boolean;
  signInDemo: (role?: OrganizationRole) => void;
  clearDemo: () => void;
  refreshCustomerProfile: () => Promise<CustomerProfile | null>;
  updateCustomerProfile: (changes: CustomerProfileChanges) => Promise<CustomerProfile>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const DEMO_KEY = "nurture-demo-role";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [demoRole, setDemoRole] = useState<OrganizationRole | null>(() => {
    const saved = sessionStorage.getItem(DEMO_KEY);
    return (saved as OrganizationRole | null) ?? null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => {};
    authService
      .initializePersistence()
      .then(() => {
        unsubscribe = authService.observe((user) => {
          if (!active) return;
          setFirebaseUser(user);
          setError(null);
          if (!user || user.isAnonymous) {
            setCustomerProfile(null);
            setLoading(false);
            return;
          }
          setLoading(true);
          customerProfileRepository
            .getOrCreate(user)
            .then((profile) => {
              if (!active) return;
              setCustomerProfile(profile);
              setLoading(false);
            })
            .catch((reason: unknown) => {
              if (!active) return;
              setCustomerProfile(null);
              setError(reason instanceof Error ? reason.message : "Unable to load the Nurture customer profile.");
              setLoading(false);
            });
        });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Unable to initialize authentication.");
        setLoading(false);
      });

    // Firebase may be intentionally unconfigured in static/local skeleton views.
    if (!firebaseConfigured) setLoading(false);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const identity: IdentitySession | null = firebaseUser
    ? {
        identityId: firebaseUser.uid,
        kind: firebaseUser.isAnonymous ? "anonymous" : "registered",
        email: firebaseUser.email,
        emailVerified: firebaseUser.emailVerified,
        providerIds: firebaseUser.providerData.map((provider) => provider.providerId),
        ...(firebaseUser.metadata.lastSignInTime ? { authenticatedAt: firebaseUser.metadata.lastSignInTime } : {}),
      }
    : null;

  const currentUser = useMemo<NurtureUser | null>(() => {
    if (demoRole) return demoUser;
    if (!firebaseUser || firebaseUser.isAnonymous || !customerProfile) return null;
    return {
      uid: firebaseUser.uid,
      email: customerProfile.email,
      displayName: customerProfile.displayName,
      ...(customerProfile.firstName ? { firstName: customerProfile.firstName } : {}),
      ...(customerProfile.lastName ? { lastName: customerProfile.lastName } : {}),
      photoURL: firebaseUser.photoURL,
      phone: customerProfile.phone,
      status: customerProfile.status,
      createdAt: customerProfile.createdAt,
      updatedAt: customerProfile.updatedAt,
      onboardingStatus: customerProfile.onboardingStatus,
      preferences: customerProfile.preferences,
      lastActiveAt: firebaseUser.metadata.lastSignInTime,
      isAnonymous: false,
    };
  }, [customerProfile, demoRole, firebaseUser]);

  async function refreshCustomerProfile() {
    const user = authService.getCurrentUser();
    if (!user || user.isAnonymous) {
      setCustomerProfile(null);
      return null;
    }
    const profile = await customerProfileRepository.getOrCreate(user);
    setCustomerProfile(profile);
    setFirebaseUser(user);
    return profile;
  }

  async function updateCustomerProfile(changes: CustomerProfileChanges) {
    const user = authService.getCurrentUser();
    if (!user || user.isAnonymous) throw new Error("A registered identity is required to update the customer profile.");
    const profile = await customerProfileRepository.update(user.uid, changes);
    setCustomerProfile(profile);
    return profile;
  }

  const value: AuthContextValue = {
    firebaseUser,
    identity,
    customerProfile,
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
    refreshCustomerProfile,
    updateCustomerProfile,
    async signOut() {
      sessionStorage.removeItem(DEMO_KEY);
      setDemoRole(null);
      setCustomerProfile(null);
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
