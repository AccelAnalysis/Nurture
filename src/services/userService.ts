import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { createUserProfile } from '../domain/defaults';
import type { AuthIdentity, UserProfile } from '../domain/identity';
import { DEMO_MODE } from '../config/runtime';
import { demoProfiles, makeDemoProfile } from '../demo/data';
import { database, decode, pathId } from './repository';
export type EditableProfile = Pick<
  UserProfile,
  'displayName' | 'firstName' | 'lastName' | 'phone' | 'preferences' | 'onboardingStatus'
>;
export const userService = {
  async get(uid: string): Promise<UserProfile | null> {
    if (DEMO_MODE) return structuredClone(demoProfiles.get(uid) ?? makeDemoProfile(uid));
    const snapshot = await getDoc(doc(database(), 'users', pathId(uid)));
    return snapshot.exists() ? decode<UserProfile>(snapshot.data()) : null;
  },
  async ensure(identity: AuthIdentity): Promise<void> {
    if (identity.isAnonymous || !identity.email) return;
    if (DEMO_MODE) {
      if (!demoProfiles.has(identity.uid))
        demoProfiles.set(
          identity.uid,
          makeDemoProfile(identity.uid, identity.displayName ?? 'Nurture Explorer', identity.email),
        );
      return;
    }
    const ref = doc(database(), 'users', pathId(identity.uid));
    if ((await getDoc(ref)).exists()) return;
    const profile = createUserProfile(identity);
    await setDoc(ref, { ...profile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  },
  async save(uid: string, fields: EditableProfile): Promise<void> {
    if (DEMO_MODE) {
      demoProfiles.set(uid, {
        ...(demoProfiles.get(uid) ?? makeDemoProfile(uid)),
        ...fields,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    await updateDoc(doc(database(), 'users', pathId(uid)), { ...fields, updatedAt: serverTimestamp() });
  },
};
