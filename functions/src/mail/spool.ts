import { randomUUID } from "node:crypto";
import type { ImmutableMailMessage, MailDeliveryRecord, MailWorkerResult } from "../../../shared/mail/contracts.js";
import { assertMailDeliveryTransition } from "../../../shared/mail/state-machine.js";

export interface StoredMailBlob {
  storageKey: string;
  rfc822: Uint8Array;
  sha256: string;
  byteLength: number;
}

export interface MailObjectStore {
  put(blob: StoredMailBlob): Promise<void>;
  get(storageKey: string): Promise<StoredMailBlob | null>;
}

export interface LeaseMailDeliveriesInput {
  owner: string;
  now: Date;
  leaseMs: number;
  limit: number;
}

export interface MailSpool {
  putMessage(message: ImmutableMailMessage): Promise<void>;
  getMessage(messageId: string): Promise<ImmutableMailMessage | null>;
  enqueue(delivery: MailDeliveryRecord): Promise<{ created: boolean; delivery: MailDeliveryRecord }>;
  getDelivery(deliveryId: string): Promise<MailDeliveryRecord | null>;
  leaseReady(input: LeaseMailDeliveriesInput): Promise<MailDeliveryRecord[]>;
  heartbeat(deliveryId: string, owner: string, now: Date, leaseMs: number): Promise<MailDeliveryRecord>;
  transition(deliveryId: string, expected: readonly MailDeliveryRecord["state"][], next: MailDeliveryRecord["state"], patch?: Partial<MailDeliveryRecord>): Promise<MailDeliveryRecord>;
  completeWorkerResult(result: MailWorkerResult, nextState: MailDeliveryRecord["state"], patch?: Partial<MailDeliveryRecord>): Promise<MailDeliveryRecord>;
}

function copyDelivery(value: MailDeliveryRecord): MailDeliveryRecord {
  return structuredClone(value);
}

/**
 * Reference implementation for tests and local development only. Production
 * delivery requires a durable multi-worker spool with transactional leasing.
 */
export class InMemoryMailSpool implements MailSpool, MailObjectStore {
  private readonly messages = new Map<string, ImmutableMailMessage>();
  private readonly deliveries = new Map<string, MailDeliveryRecord>();
  private readonly blobs = new Map<string, StoredMailBlob>();

  async put(blob: StoredMailBlob) {
    const existing = this.blobs.get(blob.storageKey);
    if (existing && existing.sha256 !== blob.sha256) throw new Error("Immutable mail blob key collision.");
    this.blobs.set(blob.storageKey, { ...blob, rfc822: Uint8Array.from(blob.rfc822) });
  }

  async get(storageKey: string) {
    const blob = this.blobs.get(storageKey);
    return blob ? { ...blob, rfc822: Uint8Array.from(blob.rfc822) } : null;
  }

  async putMessage(message: ImmutableMailMessage) {
    const existing = this.messages.get(message.messageId);
    if (existing && existing.blob.sha256 !== message.blob.sha256) throw new Error("Immutable mail message cannot be replaced with different bytes.");
    this.messages.set(message.messageId, structuredClone(message));
  }

  async getMessage(messageId: string) {
    const value = this.messages.get(messageId);
    return value ? structuredClone(value) : null;
  }

  async enqueue(delivery: MailDeliveryRecord) {
    const existing = this.deliveries.get(delivery.deliveryId);
    if (existing) {
      if (existing.organizationId !== delivery.organizationId) throw new Error("Mail delivery identity collided across tenants.");
      return { created: false, delivery: copyDelivery(existing) };
    }
    const stored = copyDelivery(delivery);
    this.deliveries.set(delivery.deliveryId, stored);
    return { created: true, delivery: copyDelivery(stored) };
  }

  async getDelivery(deliveryId: string) {
    const value = this.deliveries.get(deliveryId);
    return value ? copyDelivery(value) : null;
  }

  async leaseReady(input: LeaseMailDeliveriesInput) {
    const ready = [...this.deliveries.values()]
      .filter((delivery) => {
        if (delivery.state !== "queued" && delivery.state !== "deferred") return false;
        if (delivery.nextAttemptAt && new Date(delivery.nextAttemptAt) > input.now) return false;
        if (new Date(delivery.expiresAt) <= input.now) return false;
        if (delivery.lease && new Date(delivery.lease.expiresAt) > input.now) return false;
        return true;
      })
      .sort((a, b) => (a.nextAttemptAt ?? a.envelope.createdAt).localeCompare(b.nextAttemptAt ?? b.envelope.createdAt))
      .slice(0, Math.max(0, input.limit));

    const leased: MailDeliveryRecord[] = [];
    for (const delivery of ready) {
      const current = this.deliveries.get(delivery.deliveryId);
      if (!current) continue;
      const acquiredAt = input.now.toISOString();
      const next = {
        ...current,
        lease: {
          token: randomUUID(),
          owner: input.owner,
          acquiredAt,
          expiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString(),
        },
        updatedAt: acquiredAt,
      } satisfies MailDeliveryRecord;
      this.deliveries.set(next.deliveryId, next);
      leased.push(copyDelivery(next));
    }
    return leased;
  }

  async heartbeat(deliveryId: string, owner: string, now: Date, leaseMs: number) {
    const current = this.deliveries.get(deliveryId);
    if (!current?.lease || current.lease.owner !== owner || new Date(current.lease.expiresAt) <= now) throw new Error("Mail delivery lease is unavailable or expired.");
    const next = {
      ...current,
      lease: { ...current.lease, heartbeatAt: now.toISOString(), expiresAt: new Date(now.getTime() + leaseMs).toISOString() },
      updatedAt: now.toISOString(),
    } satisfies MailDeliveryRecord;
    this.deliveries.set(deliveryId, next);
    return copyDelivery(next);
  }

  async transition(deliveryId: string, expected: readonly MailDeliveryRecord["state"][], nextState: MailDeliveryRecord["state"], patch: Partial<MailDeliveryRecord> = {}) {
    const current = this.deliveries.get(deliveryId);
    if (!current) throw new Error("Mail delivery not found.");
    if (!expected.includes(current.state)) throw new Error(`Mail delivery state ${current.state} did not match expected state.`);
    assertMailDeliveryTransition(current.state, nextState);
    const next = {
      ...current,
      ...patch,
      deliveryId: current.deliveryId,
      organizationId: current.organizationId,
      messageId: current.messageId,
      envelope: current.envelope,
      state: nextState,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    } satisfies MailDeliveryRecord;
    this.deliveries.set(deliveryId, next);
    return copyDelivery(next);
  }

  async completeWorkerResult(result: MailWorkerResult, nextState: MailDeliveryRecord["state"], patch: Partial<MailDeliveryRecord> = {}) {
    const current = this.deliveries.get(result.deliveryId);
    if (!current) throw new Error("Mail delivery not found.");
    if (current.organizationId !== result.organizationId) throw new Error("Worker result organization does not match delivery tenant.");
    if (!current.lease) throw new Error("Worker result cannot complete an unleased delivery.");
    if (current.lease.token !== result.leaseToken || current.lease.owner !== result.leaseOwner) throw new Error("Worker result lease fencing token is stale.");
    const expectedAttempt = current.attempts.length + 1;
    if (result.attempt.attempt !== expectedAttempt) throw new Error("Worker result attempt number is stale or out of order.");
    assertMailDeliveryTransition(current.state, nextState);
    const next = {
      ...current,
      ...patch,
      deliveryId: current.deliveryId,
      organizationId: current.organizationId,
      messageId: current.messageId,
      envelope: current.envelope,
      state: nextState,
      attempts: [...current.attempts, structuredClone(result.attempt)],
      lease: undefined,
      updatedAt: result.completedAt,
    } satisfies MailDeliveryRecord;
    this.deliveries.set(result.deliveryId, next);
    return copyDelivery(next);
  }
}
