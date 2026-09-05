import { doc, getDoc, setDoc, type DocumentData } from "firebase/firestore";
import { db } from "../../../firebase";

export const identityCollections = {
  customers: "identityCustomers",
  leads: "identityLeadCandidates",
  onboarding: "identityOnboarding",
} as const;

export type IdentityCollection = (typeof identityCollections)[keyof typeof identityCollections];

function localKey(collection: IdentityCollection, identityId: string) {
  return `nurture:${collection}:${identityId}`;
}

function readLocal<T>(collection: IdentityCollection, identityId: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(localKey(collection, identityId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeLocal<T extends object>(collection: IdentityCollection, identityId: string, value: T, merge: boolean) {
  if (typeof window === "undefined") return;
  const next = merge ? { ...(readLocal<object>(collection, identityId) ?? {}), ...value } : value;
  window.localStorage.setItem(localKey(collection, identityId), JSON.stringify(next));
}

function firestoreValue<T extends object>(value: T): DocumentData {
  // Firestore rejects undefined values. Identity documents are plain JSON-domain
  // records, so this also guarantees optional properties are omitted cleanly.
  return JSON.parse(JSON.stringify(value)) as DocumentData;
}

export const identityDocumentStore = {
  async read<T>(collection: IdentityCollection, identityId: string): Promise<T | null> {
    if (!db) return readLocal<T>(collection, identityId);
    const snapshot = await getDoc(doc(db, collection, identityId));
    return snapshot.exists() ? (snapshot.data() as T) : null;
  },

  async write<T extends object>(collection: IdentityCollection, identityId: string, value: T, merge = true): Promise<void> {
    if (!db) {
      writeLocal(collection, identityId, value, merge);
      return;
    }
    await setDoc(doc(db, collection, identityId), firestoreValue(value), { merge });
  },
};
