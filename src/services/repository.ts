import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { db, initializationError } from '../firebase';
import { DEMO_MODE } from '../config/runtime';
import { FeatureUnavailableError } from '../lib/errors';
export interface Repository<T> {
  list(scope: string): Promise<T[]>;
  get(scope: string, id: string): Promise<T | null>;
  save(scope: string, record: T): Promise<T>;
}
export function pathId(value: string): string {
  if (!value || value.length > 128 || /[\/\\]/.test(value) || value === '.' || value === '..')
    throw new Error('Invalid resource identifier.');
  return value;
}
export function database() {
  if (!db) throw new Error(initializationError ?? 'Firebase is unavailable.');
  return db;
}
/** One decoding boundary. Production domain writes must add runtime schema validation on the server. */
export function decode<T>(value: unknown): T {
  function visit(item: unknown): unknown {
    if (item instanceof Timestamp) return item.toDate().toISOString();
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === 'object')
      return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child)]));
    return item;
  }
  return visit(value) as T;
}
export async function readOne<T>(path: string): Promise<T | null> {
  const snapshot = await getDoc(doc(database(), path));
  return snapshot.exists() ? decode<T>({ ...snapshot.data(), id: snapshot.id }) : null;
}
export async function readMany<T>(path: string, constraints: QueryConstraint[] = []): Promise<T[]> {
  const snapshot = await getDocs(query(collection(database(), path), ...constraints, limit(100)));
  return snapshot.docs.map((item) => decode<T>({ ...item.data(), id: item.id }));
}
export function scopedRepository<T extends { id: string }>(
  name: string,
  seed: T[],
  scopePath: (scope: string) => string,
  initialScope: string,
): Repository<T> {
  const demoRecords = new Map<string, T[]>(DEMO_MODE ? [[initialScope, structuredClone(seed)]] : []);
  return {
    async list(scope) {
      return DEMO_MODE
        ? structuredClone(demoRecords.get(scope) ?? [])
        : readMany<T>(scopePath(pathId(scope)));
    },
    async get(scope, id) {
      return DEMO_MODE
        ? structuredClone((demoRecords.get(scope) ?? []).find((item) => item.id === id) ?? null)
        : readOne<T>(`${scopePath(pathId(scope))}/${pathId(id)}`);
    },
    async save(scope, record) {
      if (!DEMO_MODE) throw new FeatureUnavailableError(`${name} editing`);
      const records = demoRecords.get(scope) ?? [];
      demoRecords.set(scope, [...records.filter((item) => item.id !== record.id), structuredClone(record)]);
      return structuredClone(record);
    },
  };
}
