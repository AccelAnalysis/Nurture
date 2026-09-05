import {
  bindLifecycleEvent,
  validateLifecycleEventEnvelope,
} from "../analytics/core.js";
import type {
  AnalyticsDataMode,
  LifecycleEventEnvelope,
  LifecycleEventSubmission,
  LifecycleSubject,
} from "../analytics/contracts.js";
import {
  bindingMatchesScope,
  type OrganizationCustomerBindingPort,
} from "./tenant-binding.js";

export type LifecycleEventAppendStatus = "appended" | "duplicate";

export interface LifecycleEventAppendResult {
  status: LifecycleEventAppendStatus;
  event: LifecycleEventEnvelope;
}

/**
 * Concrete persistence must atomically enforce uniqueness for
 * organizationId + dataMode + idempotencyKey. A check-then-write in application
 * memory is not sufficient for multi-worker execution.
 */
export interface DurableLifecycleEventStore {
  appendIfAbsent(event: LifecycleEventEnvelope): Promise<LifecycleEventAppendResult>;
}

export interface LifecycleOutboxRecord {
  outboxId: string;
  organizationId: string;
  dataMode: AnalyticsDataMode;
  event: LifecycleEventEnvelope;
  status: "pending" | "published" | "failed";
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

/**
 * Domain repositories that can transact with the canonical event store may
 * stage this outbox record in the same transaction as their mutation. The
 * outbox drainer then invokes DurableLifecycleEventStore. This avoids a domain
 * mutation succeeding while its lifecycle fact is silently lost.
 */
export interface LifecycleEventOutboxPort<TTransaction> {
  stage(transaction: TTransaction, record: LifecycleOutboxRecord): Promise<void>;
}

export type TrustedEventAppendErrorCode =
  | "binding-unavailable"
  | "scope-mismatch"
  | "identity-required"
  | "source-mismatch";

export class TrustedEventAppendError extends Error {
  constructor(
    public readonly code: TrustedEventAppendErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TrustedEventAppendError";
  }
}

export function lifecycleEventDedupeKey(event: Pick<LifecycleEventEnvelope, "organizationId" | "dataMode" | "idempotencyKey">): string {
  return [event.organizationId, event.dataMode, event.idempotencyKey]
    .map((value) => encodeURIComponent(value))
    .join(":");
}

function assertHintDoesNotContradictScope(submission: LifecycleEventSubmission, organizationId: string): void {
  if (submission.organizationIdHint && submission.organizationIdHint !== organizationId) {
    throw new TrustedEventAppendError("scope-mismatch", "Untrusted organization hint contradicts the verified organization scope.");
  }
}

export class SecureLifecycleEventAppender {
  constructor(
    private readonly bindingPort: OrganizationCustomerBindingPort,
    private readonly store: DurableLifecycleEventStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /**
   * Authenticated browser signals are always bound as source=browser. A client
   * cannot promote its own request to domain_action, provider_webhook, or a
   * commercial fact merely by changing JSON fields.
   */
  async appendAuthenticatedBrowserSubmission(input: {
    submission: LifecycleEventSubmission;
    organizationId: string;
    identityId: string;
    dataMode?: AnalyticsDataMode;
  }): Promise<LifecycleEventAppendResult> {
    assertHintDoesNotContradictScope(input.submission, input.organizationId);
    const binding = await this.bindingPort.resolve({
      organizationId: input.organizationId,
      identityId: input.identityId,
      correlationId: input.submission.correlationId,
    });
    if (binding.status !== "ready") {
      throw new TrustedEventAppendError("binding-unavailable", `Organization/customer binding is unavailable: ${binding.reason}.`);
    }
    if (!bindingMatchesScope(binding.binding, input.organizationId, input.identityId)) {
      throw new TrustedEventAppendError("scope-mismatch", "Resolved customer binding does not match the verified request scope.");
    }

    const event = bindLifecycleEvent(input.submission, {
      organizationId: input.organizationId,
      source: "browser",
      receivedAt: this.now(),
      subject: { kind: "customer", id: binding.binding.customerId },
      identityId: input.identityId,
      customerId: binding.binding.customerId,
      dataMode: input.dataMode,
    });
    return this.store.appendIfAbsent(event);
  }

  /**
   * Trusted domain handlers use this after their own command authorization. A
   * customer-scoped domain fact with an identity must still resolve the same
   * canonical tenant/customer binding before append. Lead-only facts may exist
   * before an authentication identity and therefore use a lead subject without
   * a customerId.
   */
  async appendDomainSubmission(input: {
    submission: LifecycleEventSubmission;
    organizationId: string;
    subject: LifecycleSubject;
    identityId?: string;
    customerId?: string;
    dataMode?: AnalyticsDataMode;
  }): Promise<LifecycleEventAppendResult> {
    assertHintDoesNotContradictScope(input.submission, input.organizationId);

    let customerId = input.customerId;
    if (customerId && !input.identityId) {
      throw new TrustedEventAppendError("identity-required", "Customer-scoped domain events require a verified identity/customer binding.");
    }
    if (input.identityId) {
      const binding = await this.bindingPort.resolve({
        organizationId: input.organizationId,
        identityId: input.identityId,
        correlationId: input.submission.correlationId,
      });
      if (binding.status !== "ready" || !bindingMatchesScope(binding.binding, input.organizationId, input.identityId)) {
        throw new TrustedEventAppendError("binding-unavailable", "Verified identity does not have one active customer binding in this organization.");
      }
      if (customerId && customerId !== binding.binding.customerId) {
        throw new TrustedEventAppendError("scope-mismatch", "Requested customer does not match the canonical organization/customer binding.");
      }
      customerId = binding.binding.customerId;
      if (input.subject.kind === "customer" && input.subject.id !== customerId) {
        throw new TrustedEventAppendError("scope-mismatch", "Customer subject does not match the canonical organization/customer binding.");
      }
    }

    const event = bindLifecycleEvent(input.submission, {
      organizationId: input.organizationId,
      source: "domain_action",
      receivedAt: this.now(),
      subject: input.subject,
      identityId: input.identityId,
      customerId,
      dataMode: input.dataMode,
    });
    return this.store.appendIfAbsent(event);
  }

  /**
   * Provider, scheduler, administrator, and trusted-server producers arrive as
   * already materialized envelopes. The caller supplies the expected scope and
   * source from trusted routing, and F remains authoritative for catalog/source
   * validation before the durable store sees the event.
   */
  async appendTrustedEnvelope(input: {
    event: LifecycleEventEnvelope;
    expectedOrganizationId: string;
    expectedSource: LifecycleEventEnvelope["source"];
  }): Promise<LifecycleEventAppendResult> {
    const event = validateLifecycleEventEnvelope(input.event);
    if (event.organizationId !== input.expectedOrganizationId) {
      throw new TrustedEventAppendError("scope-mismatch", "Event organization does not match the trusted producer scope.");
    }
    if (event.source !== input.expectedSource) {
      throw new TrustedEventAppendError("source-mismatch", "Event source does not match the trusted producer route.");
    }
    return this.store.appendIfAbsent(event);
  }
}
