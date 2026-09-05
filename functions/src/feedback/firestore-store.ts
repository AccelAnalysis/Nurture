import { FieldPath, type Firestore, type Transaction, type Query } from "firebase-admin/firestore";
import type { AuditActor, AuditWriteRequest } from "../../../shared/platform/audit.js";
import type { FeedbackScope } from "../../../shared/feedback/contracts.js";
import { id, integer, invariant } from "../../../shared/feedback/validation.js";
import { assertScope, collections, type Collection, type FeedbackAction, type FeedbackEventIntent, type FeedbackStore, type FeedbackTransaction } from "./ports.js";

export interface FeedbackAtomicEffects {
  events: FeedbackEventIntent[];
  audits: { request: AuditWriteRequest; actor: AuditActor }[];
  /** Kept for the port contract while R4 is stacked; production composition never persists a parallel action queue. */
  actions: FeedbackAction[];
}
/** Prepare performs reads only; returned functions perform writes only, after ALL reads.
 * Canonical R3 event/audit adapters MUST join this transaction. No optional event/audit fallback. */
export interface FeedbackAtomicHooks {
  prepare(scope: FeedbackScope, tx: Transaction, effects: FeedbackAtomicEffects): Promise<(() => void)[]>;
}
const queryFields: Partial<Record<Collection, readonly string[]>> = {
  surveyVersions: ["entityId"], programVersions: ["entityId"], surveyResponses: ["versionId"],
  referralAttributions: ["referrerCustomerId"],
};
export class FirestoreFeedbackStore implements FeedbackStore {
  constructor(private readonly db: Firestore, private readonly hooks: FeedbackAtomicHooks) {}
  private collection(scope: FeedbackScope, collection: Collection) {
    assertScope(scope); invariant(collections.includes(collection), "invalid-input");
    return this.db.collection(`organizations/${scope.organizationId}/feedbackModes/${scope.dataMode}/${collection}`);
  }
  async transaction<T>(scope: FeedbackScope, work: (tx: FeedbackTransaction) => Promise<T>): Promise<T> {
    assertScope(scope);
    return this.db.runTransaction(async native => {
      const buffered = new Map<string, { collection: Collection; key: string; value: object; create: boolean }>();
      const effects: FeedbackAtomicEffects = { events: [], audits: [], actions: [] };
      const stagedWrites: (() => void)[] = [];
      const tx: FeedbackTransaction = {
        native,
        stage: write => stagedWrites.push(write),
        get: async <V>(collection: Collection, key: string): Promise<V | null> => {
          id(key); const ref = this.collection(scope, collection).doc(key);
          const staged = buffered.get(ref.path); if (staged) return structuredClone(staged.value) as V;
          const snap = await native.get(ref); return snap.exists ? snap.data() as V : null;
        },
        put: (collection, key, value) => {
          id(key); const ref = this.collection(scope, collection).doc(key); const prior = buffered.get(ref.path);
          buffered.set(ref.path, { collection, key, value: structuredClone(value), create: prior?.create ?? false });
        },
        create: (collection, key, value) => {
          id(key); const ref = this.collection(scope, collection).doc(key); invariant(!buffered.has(ref.path), "conflict");
          buffered.set(ref.path, { collection, key, value: structuredClone(value), create: true });
        },
        event: intent => effects.events.push(structuredClone(intent)),
        audit: (request, actor) => effects.audits.push(structuredClone({ request, actor })),
        // R3's run/effect worker is the only durable treatment dispatcher. Legacy
        // domain hints are intentionally not materialized as a second queue.
        enqueue: () => undefined,
      };
      const result = await work(tx);
      const effectWrites = await this.hooks.prepare(scope, native, effects);
      invariant(buffered.size + effects.events.length + effects.audits.length <= 400, "invalid-input");
      for (const item of buffered.values()) {
        const ref = this.collection(scope, item.collection).doc(item.key);
        if (item.create) native.create(ref, item.value); else native.set(ref, item.value);
      }
      for (const write of [...stagedWrites, ...effectWrites]) write();
      return result;
    });
  }
  async page<T>(scope: FeedbackScope, collection: Collection, options: { equal?: [string, string]; after?: string; limit: number }): Promise<{ rows: T[]; cursor: string | null }> {
    integer(options.limit, 1, 500); if (options.after) id(options.after);
    let query: Query = this.collection(scope, collection);
    if (options.equal) {
      invariant(queryFields[collection]?.includes(options.equal[0]), "invalid-input"); id(options.equal[1]);
      query = query.where(options.equal[0], "==", options.equal[1]);
    }
    query = query.orderBy(FieldPath.documentId()); if (options.after) query = query.startAfter(options.after);
    const snap = await query.limit(options.limit + 1).get(); const selected = snap.docs.slice(0, options.limit);
    return { rows: selected.map(row => row.data() as T), cursor: snap.docs.length > options.limit ? selected[selected.length - 1].id : null };
  }
}
