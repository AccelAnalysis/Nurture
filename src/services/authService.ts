import {
  EmailAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  linkWithCredential,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "../firebase";

function requireAuth() {
  if (!auth) throw new Error("Firebase Authentication is not configured in this environment.");
  return auth;
}

export const authService = {
  async initializePersistence() {
    if (!auth) return;
    await setPersistence(auth, browserLocalPersistence);
  },
  observe(callback: (user: User | null) => void) {
    if (!auth) return () => undefined;
    return onAuthStateChanged(auth, callback);
  },
  getCurrentUser() {
    return auth?.currentUser ?? null;
  },
  async signIn(email: string, password: string) {
    return signInWithEmailAndPassword(requireAuth(), email, password);
  },
  async register(email: string, password: string) {
    const instance = requireAuth();
    if (instance.currentUser && !instance.currentUser.isAnonymous) {
      throw new Error("A registered account is already signed in. Sign out before creating another account.");
    }
    if (instance.currentUser?.isAnonymous) {
      const credential = EmailAuthProvider.credential(email, password);
      return linkWithCredential(instance.currentUser, credential);
    }
    return createUserWithEmailAndPassword(instance, email, password);
  },
  async ensureAnonymousSession(): Promise<User> {
    const instance = requireAuth();
    if (instance.currentUser) return instance.currentUser;
    return (await signInAnonymously(instance)).user;
  },
  async signInAnonymous() {
    return signInAnonymously(requireAuth());
  },
  async convertAnonymousUser(email: string, password: string) {
    const instance = requireAuth();
    if (!instance.currentUser?.isAnonymous) throw new Error("No anonymous user is available to convert.");
    const credential = EmailAuthProvider.credential(email, password);
    return linkWithCredential(instance.currentUser, credential);
  },
  async sendVerification() {
    const user = requireAuth().currentUser;
    if (!user) throw new Error("No authenticated user.");
    if (user.isAnonymous) throw new Error("Register the account before requesting email verification.");
    if (user.emailVerified) return;
    const continueUrl = typeof window !== "undefined" ? `${window.location.origin}/verify-email` : undefined;
    return sendEmailVerification(user, continueUrl ? { url: continueUrl, handleCodeInApp: false } : undefined);
  },
  async reloadCurrentUser() {
    const user = requireAuth().currentUser;
    if (!user) throw new Error("No authenticated user.");
    await reload(user);
    return user;
  },
  async resetPassword(email: string) {
    return sendPasswordResetEmail(requireAuth(), email);
  },
  async signOut() {
    if (!auth) return;
    return firebaseSignOut(auth);
  },
};
