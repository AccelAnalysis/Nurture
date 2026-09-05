import {
  applyActionCode,
  confirmPasswordReset,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  OAuthProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, initializationError } from '../firebase';
import { DEMO_MODE, providerFlags } from '../config/runtime';
import type { AuthIdentity, Role } from '../domain/identity';
import { readSession, writeSession } from '../lib/storage';
import { userService } from './userService';
function validIdentity(value: unknown): value is AuthIdentity {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.uid === 'string' &&
    record.uid.startsWith('demo-') &&
    typeof record.isAnonymous === 'boolean' &&
    typeof record.emailVerified === 'boolean' &&
    (record.email === null || typeof record.email === 'string') &&
    (record.displayName === null || typeof record.displayName === 'string')
  );
}
let demoIdentity = DEMO_MODE ? readSession('nurture:demo:identity', validIdentity) : null;
const listeners = new Set<(user: AuthIdentity | null) => void>();
function emitDemo(user: AuthIdentity | null) {
  demoIdentity = user;
  writeSession('nurture:demo:identity', user);
  listeners.forEach((listener) => listener(user));
}
function identity(user: User): AuthIdentity {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    isAnonymous: user.isAnonymous,
  };
}
function client() {
  if (!auth) throw new Error(initializationError ?? 'Authentication is unavailable.');
  return auth;
}
let ready: Promise<void> | undefined;
async function initialized() {
  const instance = client();
  ready ??= setPersistence(instance, browserLocalPersistence);
  await ready;
  return instance;
}
export const authService = {
  observe(next: (user: AuthIdentity | null) => void, error: (reason: unknown) => void): () => void {
    if (DEMO_MODE) {
      listeners.add(next);
      next(demoIdentity);
      return () => {
        listeners.delete(next);
      };
    }
    let active = true;
    let unsubscribe = () => {};
    initialized()
      .then((instance) => {
        if (active)
          unsubscribe = onAuthStateChanged(instance, (user) => next(user ? identity(user) : null), error);
      })
      .catch(error);
    return () => {
      active = false;
      unsubscribe();
    };
  },
  async signIn(email: string, password: string) {
    if (DEMO_MODE) throw new Error('Use a labeled demo role below; no password is needed.');
    const result = await signInWithEmailAndPassword(await initialized(), email, password);
    await userService.ensure(identity(result.user));
  },
  async register(email: string, password: string, displayName: string) {
    if (DEMO_MODE) {
      const user = {
        uid: demoIdentity?.isAnonymous ? demoIdentity.uid : 'demo-new',
        email,
        displayName,
        emailVerified: true,
        isAnonymous: false,
      };
      await userService.ensure(user);
      emitDemo(user);
      return;
    }
    const instance = await initialized();
    const result = instance.currentUser?.isAnonymous
      ? await linkWithCredential(instance.currentUser, EmailAuthProvider.credential(email, password))
      : await createUserWithEmailAndPassword(instance, email, password);
    await updateProfile(result.user, { displayName });
    await userService.ensure(identity(result.user));
  },
  async signOut() {
    if (DEMO_MODE) emitDemo(null);
    else await signOut(client());
  },
  async resetPassword(email: string) {
    if (DEMO_MODE) return;
    await sendPasswordResetEmail(await initialized(), email);
  },
  async completePasswordReset(code: string, password: string) {
    if (DEMO_MODE) return;
    await confirmPasswordReset(await initialized(), code, password);
  },
  async verifyEmail(code?: string) {
    if (DEMO_MODE) return;
    const instance = await initialized();
    if (code) {
      await applyActionCode(instance, code);
      if (instance.currentUser) await reload(instance.currentUser);
    } else {
      if (!instance.currentUser) throw new Error('Sign in before requesting verification.');
      await sendEmailVerification(instance.currentUser);
    }
  },
  async refreshIdentity(): Promise<AuthIdentity | null> {
    if (DEMO_MODE) return demoIdentity;
    const user = client().currentUser;
    if (!user) return null;
    await reload(user);
    await user.getIdToken(true);
    return identity(user);
  },
  async startTrial() {
    if (DEMO_MODE) {
      if (!demoIdentity)
        emitDemo({
          uid: 'demo-anonymous',
          email: null,
          displayName: 'Guest explorer',
          emailVerified: false,
          isAnonymous: true,
        });
      return;
    }
    if (!providerFlags.anonymous)
      throw new Error('Anonymous sign-in is not enabled. You can still browse the public experience.');
    const instance = await initialized();
    if (!instance.currentUser) await signInAnonymously(instance);
  },
  async provider(name: 'google' | 'apple') {
    if (!providerFlags[name] || DEMO_MODE) throw new Error('This provider is not configured.');
    const instance = await initialized();
    const provider = name === 'google' ? new GoogleAuthProvider() : new OAuthProvider('apple.com');
    const result = instance.currentUser?.isAnonymous
      ? await linkWithPopup(instance.currentUser, provider)
      : await signInWithPopup(instance, provider);
    await userService.ensure(identity(result.user));
  },
  async demoSignIn(role: Role) {
    if (!DEMO_MODE) throw new Error('Demo sessions are unavailable in production.');
    const names = {
      owner: 'Alex Morgan',
      administrator: 'Sam Rivera',
      manager: 'Taylor Chen',
      member: 'Jordan Ellis',
    };
    const user = {
      uid: `demo-${role}`,
      email: `${role}@example.test`,
      displayName: names[role],
      emailVerified: true,
      isAnonymous: false,
    };
    await userService.ensure(user);
    emitDemo(user);
  },
};
