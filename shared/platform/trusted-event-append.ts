import {
  bindLifecycleEvent,
  validateLifecycleEventEnvelope,
} from "../analytics/core.js";
import type {
  AnalyticsDataMode,
  AnalyticsEventType,
  LifecycleEventEnvelope,
  LifecycleEventSource,
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

export interface LifecycleEventAdmissionInput {
  organizationId: string;
  eventType: AnalyticsEventType;
  source: LifecycleEventSource;
  dataMode: AnalyticsDataMode;
  subjectKind: LifecycleEventEnvelope["subjectKind"];
  subjectId?: string;
  identityId?: string;
  customerId?: string;
}

export type LifecycleEventAdmissionDecision =
  | { status: "allowed" }
  | { status: "denied"; reason: string; retryAfterSeconds?: number };

/**
 * E-owned rate/abuse boundary. The concrete backend implementation may use
 * tenant/source/subject buckets, App Check signals, or other trusted context,
 * but it must fail closed when it cannot make an admission decision. It must
 * never rely on browser-supplied role, tenant, or commercial claims.
 */
export interface LifecycleEventAdmissionPort {
  admit(input: LifecycleEventAdmissionInput): Promise<LifecycleEventAdmissionDecision>;
}

export type TrustedEventAppendErrorCode =
  | "binding-unavailable"
  | "scope-mismatch"
  | "identity-required"
  | "source-mismatch"
  | "rate-limited";

export class TrustedEventAppendError extends Error {
  constructor(
    public readonly code: TrustedEventAppendErrorCode,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "TrustedEventAppendError";
  }
}

export function lifecycleEventDedupeKey(
  event: Pick<LifecycleEventEnvelope, "organizationId" | "dataMode" | "idempotencyKey">,
): string {
  return [event.organizationId, event.dataMode, event.idempotencyKey]
    .map((value) => encodeURIComponent(value))
    .join(":");
}

function assertHintDoesNotContradictScope(
  submission: LifecycleEventSubmission,
  organizationId: string,
): void {
  if (submission.organizationIdHint && submission.organizationIdHint !== organizationId) {
    throw new TrustedEventAppendError(
      "scope-mismatch",
      "Untrusted organization hint contradicts the verified organization scope.",
    );
  }
}

function admissionInput(event: LifecycleEventEnvelope): LifecycleEventAdmissionInput {
  return {
    organizationId: event.organizationId,
    eventType: event.eventType,
    source: event.source,
    dataMode: event.dataMode,
    subjectKind: event.subjectKind,
    subjectId: event.subjectId,
    identityId: event.identityId,
    customerId: event.customerId,
  };
}

export class SecureLifecycleEventAppender {
  constructor(
    private readonly bindingPort: OrganizationCustomerBindingPort,
    private readonly store: DurableLifecycleEventStore,
    private readonly admissionPort: LifecycleEventAdmissionPort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private async admit(event: LifecycleEventEnvelope): Promise<void> {
    let decision: LifecycleEventAdmissionDecision;
    try {
      decision = await this.admissionPort.admit(admissionInput(event));
    } catch (error) {
      throw new TrustedEventAppendError(
        "rate-limited",
        error instanceof Error
          ? `Event admission unavailable: ${error.message}`
          : "Event admission unavailable.",
      );
    }
    if (decision.status === "denied") {
      throw new TrustedEventAppendError(
        "rate-limited",
        decision.reason || "Lifecycle event admission denied.",
        decision.retryAfterSeconds,
      );
    }
  }

  private async assertTrustedCustomerScope(event: LifecycleEventEnvelope): Promise<void> {
    const customerId = event.customerId ?? (event.subjectKind === "customer" ? event.subjectId : undefined);
    if (!customerId) return;
    if (event.subjectKind === "customer" && event.subjectId !== customerId) {
      throw new TrustedEventAppendError(
        "scope-mismatch",
        "Trusted event customer subject contradicts its customer identifier.",
      );
    }
    if (!this.bindingPort.resolveCustomer) {
      throw new TrustedEventAppendError(
        "binding-unavailable",
        "Trusted customer scope cannot be verified by the configured binding adapter.",
      );
    }
    const binding = await this.bindingPort.resolveCustomer({
      organizationId: event.organizationId,
      customerId,
      correlationId: event.correlationId,
    });
    if (binding.status !== "ready") {
      throw new TrustedEventAppendError(
        "binding-unavailable",
        `Trusted event customer binding is unavailable: ${binding.reason}.`,
      );
    }
    if (
      binding.binding.status !== "active"
      || binding.binding.organizationId !== event.organizationId
      || binding.binding.customerId !== customerId
      || (event.identityId !== undefined && binding.binding.identityId !== event.identityId)
    ) {
      throw new TrustedEventAppendError(
        "scope-mismatch",
        "Trusted event customer does not belong to the trusted organization scope.",
      );
    }
  }

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
      throw new TrustedEventAppendError(
        "binding-unavailable",
        `Organization/customer binding is unavailable: ${binding.reason}.`,
      );
    }
    if (!bindingMatchesScope(binding.binding, input.organizationId, input.identityId)) {
      throw new TrustedEventAppendError(
        "scope-mismatch",
        "Resolved customer binding does not match the verified request scope.",
      );
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
    await this.admit(event);
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
      throw new TrustedEventAppendError(
        "identity-required",
        "Customer-scoped domain events require a verified identity/customer binding.",
      );
    }
    if (input.identityId) {
      const binding = await this.bindingPort.resolve({
        organizationId: input.organizationId,
        identityId: input.identityId,
        correlationId: input.submission.correlationId,
      });
      if (
        binding.status !== "ready"
        || !bindingMatchesScope(binding.binding, input.organizationId, input.identityId)
      ) {
        throw new TrustedEventAppendError(
          "binding-unavailable",
          "Verified identity does not have one active customer binding in this organization.",
        );
      }
      if (customerId && customerId !== binding.binding.customerId) {
        throw new TrustedEventAppendError(
          "scope-mismatch",
          "Requested customer does not match the canonical organization/customer binding.",
        );
      }
      customerId = binding.binding.customerId;
      if (input.subject.kind === "customer" && input.subject.id !== customerId) {
        throw new TrustedEventAppendError(
          "scope-mismatch",
          "Customer subject does not match the canonical organization/customer binding.",
        );
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
    await this.admit(event);
    return this.store.appendIfAbsent(event);
  }

  /**
   * Provider, scheduler, administrator, and trusted-server producers arrive as
   * already materialized envelopes. The caller supplies the expected scope and
   * source from trusted routing, and F remains authoritative for catalog/source
   * validation before the durable store sees the event. Customer-bearing events
   * are additionally verified against the canonical organization/customer store.
   */
  async appendTrustedEnvelope(input: {
    event: LifecycleEventEnvelope;
    expectedOrganizationId: string;
    expectedSource: LifecycleEventEnvelope["source"];
  }): Promise<LifecycleEventAppendResult> {
    const event = validateLifecycleEventEnvelope(input.event);
    if (event.organizationId !== input.expectedOrganizationId) {
      throw new TrustedEventAppendError(
        "scope-mismatch",
        "Event organization does not match the trusted producer scope.",
      );
    }
    if (event.source !== input.expectedSource) {
      throw new TrustedEventAppendError(
        "source-mismatch",
        "Event source does not match the trusted producer route.",
      );
    }
    await this.assertTrustedCustomerScope(event);
    await this.admit(event);
    return this.store.appendIfAbsent(event);
  }
}
