import { describe, expect, it } from "vitest";
import { createLifecycleEventSubmission } from "../analytics/core";
import type { LifecycleEventEnvelope } from "../analytics/contracts";
import type {
  OrganizationCustomerBindingPort,
  OrganizationCustomerBindingResult,
} from "./tenant-binding";
import {
  SecureLifecycleEventAppender,
  TrustedEventAppendError,
  lifecycleEventDedupeKey,
  type DurableLifecycleEventStore,
  type LifecycleEventAdmissionDecision,
  type LifecycleEventAdmissionInput,
  type LifecycleEventAdmissionPort,
  type LifecycleEventAppendResult,
} from "./trusted-event-append";

class BindingPort implements OrganizationCustomerBindingPort {
  async resolve(input: { organizationId: string; identityId: string }): Promise<OrganizationCustomerBindingResult> {
    if (input.organizationId !== "org-a" || input.identityId !== "identity-1") {
      return { status: "unavailable", reason: "customer-not-linked" };
    }
    return {
      status: "ready",
      binding: {
        organizationId: "org-a",
        customerId: "customer-1",
        identityId: "identity-1",
        status: "active",
        verifiedAt: "2026-09-05T13:00:00.000Z",
      },
    };
  }
}

class EventStore implements DurableLifecycleEventStore {
  events = new Map<string, LifecycleEventEnvelope>();

  async appendIfAbsent(event: LifecycleEventEnvelope): Promise<LifecycleEventAppendResult> {
    const key = lifecycleEventDedupeKey(event);
    const existing = this.events.get(key);
    if (existing) return { status: "duplicate", event: structuredClone(existing) };
    this.events.set(key, structuredClone(event));
    return { status: "appended", event: structuredClone(event) };
  }
}

class AdmissionPort implements LifecycleEventAdmissionPort {
  inputs: LifecycleEventAdmissionInput[] = [];
  decision: LifecycleEventAdmissionDecision = { status: "allowed" };

  async admit(input: LifecycleEventAdmissionInput): Promise<LifecycleEventAdmissionDecision> {
    this.inputs.push(structuredClone(input));
    return structuredClone(this.decision);
  }
}

function appender() {
  const store = new EventStore();
  const admission = new AdmissionPort();
  return {
    store,
    admission,
    append: new SecureLifecycleEventAppender(
      new BindingPort(),
      store,
      admission,
      () => "2026-09-05T13:00:01.000Z",
    ),
  };
}

describe("canonical trusted lifecycle append", () => {
  it("binds authenticated browser signals to the verified organization/customer and deduplicates durably", async () => {
    const fx = appender();
    const submission = createLifecycleEventSubmission("experience.started", {}, {
      eventId: "event-1",
      occurredAt: "2026-09-05T13:00:00.000Z",
      correlationId: "corr-1",
      idempotencyKey: "idempotency-1",
      dataMode: "test",
      organizationIdHint: "org-a",
      customerIdHint: "forged-customer-does-not-authorize",
    });
    const first = await fx.append.appendAuthenticatedBrowserSubmission({
      submission,
      organizationId: "org-a",
      identityId: "identity-1",
    });
    const second = await fx.append.appendAuthenticatedBrowserSubmission({
      submission,
      organizationId: "org-a",
      identityId: "identity-1",
    });
    expect(first.status).toBe("appended");
    expect(second.status).toBe("duplicate");
    expect(first.event).toMatchObject({
      organizationId: "org-a",
      customerId: "customer-1",
      identityId: "identity-1",
      subjectKind: "customer",
      subjectId: "customer-1",
      source: "browser",
    });
    expect(fx.admission.inputs[0]).toMatchObject({
      organizationId: "org-a",
      customerId: "customer-1",
      identityId: "identity-1",
      source: "browser",
      eventType: "experience.started",
      dataMode: "test",
    });
    expect(fx.store.events.size).toBe(1);
  });

  it("fails closed when the abuse admission boundary rejects the event", async () => {
    const fx = appender();
    fx.admission.decision = {
      status: "denied",
      reason: "subject event rate exceeded",
      retryAfterSeconds: 60,
    };
    const submission = createLifecycleEventSubmission("experience.started", {}, {
      eventId: "event-rate-limited",
      occurredAt: "2026-09-05T13:00:00.000Z",
      correlationId: "corr-rate-limited",
      idempotencyKey: "idempotency-rate-limited",
      dataMode: "test",
    });
    await expect(fx.append.appendAuthenticatedBrowserSubmission({
      submission,
      organizationId: "org-a",
      identityId: "identity-1",
    })).rejects.toMatchObject({
      code: "rate-limited",
      retryAfterSeconds: 60,
    } satisfies Partial<TrustedEventAppendError>);
    expect(fx.store.events.size).toBe(0);
  });

  it("rejects a browser attempt to manufacture a subscription fact", async () => {
    const fx = appender();
    const submission = createLifecycleEventSubmission("subscription.started", {}, {
      eventId: "forged-subscription",
      occurredAt: "2026-09-05T13:00:00.000Z",
      correlationId: "corr-subscription",
      idempotencyKey: "idempotency-subscription",
      dataMode: "live",
    });
    await expect(fx.append.appendAuthenticatedBrowserSubmission({
      submission,
      organizationId: "org-a",
      identityId: "identity-1",
    })).rejects.toThrow(/browser is not an allowed source/i);
    expect(fx.store.events.size).toBe(0);
  });

  it("rejects a contradictory organization hint instead of using it as authority", async () => {
    const fx = appender();
    const submission = createLifecycleEventSubmission("experience.started", {}, {
      eventId: "event-wrong-org",
      occurredAt: "2026-09-05T13:00:00.000Z",
      correlationId: "corr-wrong-org",
      idempotencyKey: "idempotency-wrong-org",
      dataMode: "test",
      organizationIdHint: "org-b",
    });
    await expect(fx.append.appendAuthenticatedBrowserSubmission({
      submission,
      organizationId: "org-a",
      identityId: "identity-1",
    })).rejects.toMatchObject({ code: "scope-mismatch" } satisfies Partial<TrustedEventAppendError>);
  });

  it("denies cross-tenant or forged customer domain binding", async () => {
    const fx = appender();
    const submission = createLifecycleEventSubmission("experience.milestone_reached", { milestone: "complete" }, {
      eventId: "domain-milestone",
      occurredAt: "2026-09-05T13:00:00.000Z",
      correlationId: "corr-domain",
      idempotencyKey: "idempotency-domain",
      dataMode: "test",
    });
    await expect(fx.append.appendDomainSubmission({
      submission,
      organizationId: "org-a",
      subject: { kind: "customer", id: "customer-2" },
      identityId: "identity-1",
      customerId: "customer-2",
    })).rejects.toMatchObject({ code: "scope-mismatch" } satisfies Partial<TrustedEventAppendError>);
    await expect(fx.append.appendDomainSubmission({
      submission,
      organizationId: "org-b",
      subject: { kind: "customer", id: "customer-1" },
      identityId: "identity-1",
      customerId: "customer-1",
    })).rejects.toMatchObject({ code: "binding-unavailable" } satisfies Partial<TrustedEventAppendError>);
  });

  it("accepts a trusted pre-registration lead domain fact without inventing an identity", async () => {
    const fx = appender();
    const submission = createLifecycleEventSubmission("lead.created", {}, {
      eventId: "lead-created-1",
      occurredAt: "2026-09-05T13:00:00.000Z",
      correlationId: "lead-corr-1",
      idempotencyKey: "lead-idem-1",
      dataMode: "test",
      organizationIdHint: "org-a",
    });
    const result = await fx.append.appendDomainSubmission({
      submission,
      organizationId: "org-a",
      subject: { kind: "lead", id: "lead-1" },
    });
    expect(result.status).toBe("appended");
    expect(result.event).toMatchObject({
      organizationId: "org-a",
      subjectKind: "lead",
      subjectId: "lead-1",
      source: "domain_action",
      dataMode: "test",
    });
    expect(result.event.identityId).toBeUndefined();
    expect(result.event.customerId).toBeUndefined();
  });

  it("requires trusted provider routing to match both source and tenant", async () => {
    const fx = appender();
    const event: LifecycleEventEnvelope = {
      eventId: "provider-subscription-1",
      eventType: "subscription.started",
      schemaVersion: 1,
      organizationId: "org-a",
      subjectId: "subscription-1",
      subjectKind: "subscription",
      customerId: "customer-1",
      occurredAt: "2026-09-05T13:00:00.000Z",
      receivedAt: "2026-09-05T13:00:01.000Z",
      source: "provider_webhook",
      correlationId: "provider-corr-1",
      idempotencyKey: "provider-idem-1",
      dataMode: "test",
      payload: {},
    };
    await expect(fx.append.appendTrustedEnvelope({
      event,
      expectedOrganizationId: "org-b",
      expectedSource: "provider_webhook",
    })).rejects.toMatchObject({ code: "scope-mismatch" } satisfies Partial<TrustedEventAppendError>);
    await expect(fx.append.appendTrustedEnvelope({
      event,
      expectedOrganizationId: "org-a",
      expectedSource: "trusted_server",
    })).rejects.toMatchObject({ code: "source-mismatch" } satisfies Partial<TrustedEventAppendError>);
    const accepted = await fx.append.appendTrustedEnvelope({
      event,
      expectedOrganizationId: "org-a",
      expectedSource: "provider_webhook",
    });
    expect(accepted.status).toBe("appended");
  });

  it("keeps idempotency scope isolated by tenant and execution mode", () => {
    const common = { idempotencyKey: "same", organizationId: "org-a", dataMode: "test" as const };
    expect(lifecycleEventDedupeKey(common)).not.toBe(
      lifecycleEventDedupeKey({ ...common, organizationId: "org-b" }),
    );
    expect(lifecycleEventDedupeKey(common)).not.toBe(
      lifecycleEventDedupeKey({ ...common, dataMode: "live" }),
    );
  });
});
