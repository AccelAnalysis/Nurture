import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  browserLocalPersistence,
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
  async signIn(email: string, password: string) {
    return signInWithEmailAndPassword(requireAuth(), email, password);
  },
  async register(email: string, password: string) {
    return createUserWithEmailAndPassword(requireAuth(), email, password);
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
    return sendEmailVerification(user);
  },
  async resetPassword(email: string) {
    return sendPasswordResetEmail(requireAuth(), email);
  },
  async signOut() {
    if (!auth) return;
    return firebaseSignOut(auth);
  },
};
