import { createHash } from "node:crypto";
import type { LifecycleEventEnvelope } from "../../../shared/analytics/contracts.js";
import { validateLifecycleEventEnvelope } from "../../../shared/analytics/core.js";
import type { EventIntegrationPort, IntegrationHealth, IntegrationRequestContext, IntegrationResult } from "../../../shared/platform/integrations.js";
import { integrationFailure, integrationSuccess } from "../../../shared/platform/integrations.js";
import type { OrganizationCustomerBindingPort, OrganizationCustomerBindingResult } from "../../../shared/platform/tenant-binding.js";
import {
  SecureLifecycleEventAppender,
  type DurableLifecycleEventStore,
  type LifecycleEventAdmissionDecision,
  type LifecycleEventAdmissionInput,
  type LifecycleEventAdmissionPort,
  type LifecycleEventAppendResult,
} from "../../../shared/platform/trusted-event-append.js";
import { db } from "../firebase.js";

function organizationRef(organizationId: string) {
  return db.collection("organizations").doc(organizationId);
}

function lifecycleEvents(organizationId: string) {
  return organizationRef(organizationId).collection("lifecycleEvents");
}

function receiptRef(event: Pick<LifecycleEventEnvelope, "organizationId" | "dataMode" | "idempotencyKey">) {
  const key = createHash("sha256").update(`${event.dataMode}:${event.idempotencyKey}`).digest("hex");
  return organizationRef(event.organizationId).collection("lifecycleEventReceipts").doc(key);
}

export async function hasCanonicalLifecycleReceipt(event: Pick<LifecycleEventEnvelope, "organizationId" | "dataMode" | "idempotencyKey">) {
  return (await receiptRef(event).get()).exists;
}

function admissionRef(input: LifecycleEventAdmissionInput, at: string) {
  const minute = at.slice(0, 16);
  const subject = input.customerId ?? input.identityId ?? input.subjectId ?? "unscoped";
  const key = createHash("sha256")
    .update(`${input.organizationId}:${input.dataMode}:${input.source}:${subject}:${minute}`)
    .digest("hex");
  return db.collection("_lifecycleAdmission").doc(key);
}

type UnavailableBindingReason = Extract<OrganizationCustomerBindingResult, { status: "unavailable" }>["reason"];
function unavailable(reason: UnavailableBindingReason): OrganizationCustomerBindingResult {
  return { status: "unavailable", reason };
}

export class FirestoreOrganizationCustomerBindingPort implements OrganizationCustomerBindingPort {
  async resolve(input: { organizationId: string; identityId: string; correlationId: string }): Promise<OrganizationCustomerBindingResult> {
    const org = await organizationRef(input.organizationId).get();
    if (!org.exists || org.data()?.status !== "active") return unavailable("organization-unresolved");
    const matches = await organizationRef(input.organizationId)
      .collection("customers")
      .where("identityId", "==", input.identityId)
      .where("status", "==", "active")
      .limit(2)
      .get();
    if (matches.empty) return unavailable("customer-not-linked");
    if (matches.size !== 1) return unavailable("ambiguous-customer-link");
    const data = matches.docs[0].data();
    if (data.identityId !== input.identityId) return unavailable("identity-mismatch");
    return {
      status: "ready",
      binding: {
        organizationId: input.organizationId,
        customerId: matches.docs[0].id,
        identityId: input.identityId,
        status: "active",
        verifiedAt: typeof data.verifiedAt === "string" ? data.verifiedAt : new Date().toISOString(),
      },
    };
  }

  async resolveCustomer(input: { organizationId: string; customerId: string; correlationId: string }): Promise<OrganizationCustomerBindingResult> {
    const [org, customer] = await Promise.all([
      organizationRef(input.organizationId).get(),
      organizationRef(input.organizationId).collection("customers").doc(input.customerId).get(),
    ]);
    if (!org.exists || org.data()?.status !== "active") return unavailable("organization-unresolved");
    if (!customer.exists) return unavailable("customer-not-linked");
    const data = customer.data() ?? {};
    if (data.status !== "active") return unavailable("customer-not-active");
    if (typeof data.identityId !== "string" || !data.identityId) return unavailable("identity-mismatch");
    return {
      status: "ready",
      binding: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        identityId: data.identityId,
        status: "active",
        verifiedAt: typeof data.verifiedAt === "string" ? data.verifiedAt : new Date().toISOString(),
      },
    };
  }
}

export class FirestoreDurableLifecycleEventStore implements DurableLifecycleEventStore {
  async appendIfAbsent(value: LifecycleEventEnvelope): Promise<LifecycleEventAppendResult> {
    const event = validateLifecycleEventEnvelope(value);
    const receipt = receiptRef(event);
    const eventRef = lifecycleEvents(event.organizationId).doc(event.eventId);
    return db.runTransaction(async (transaction) => {
      const existingReceipt = await transaction.get(receipt);
      if (existingReceipt.exists) {
        const existingEventId = existingReceipt.data()?.eventId;
        if (typeof existingEventId !== "string" || !existingEventId) throw new Error("Lifecycle idempotency receipt is corrupt.");
        const existingEvent = await transaction.get(lifecycleEvents(event.organizationId).doc(existingEventId));
        if (!existingEvent.exists) throw new Error("Lifecycle idempotency receipt references a missing event.");
        return { status: "duplicate", event: validateLifecycleEventEnvelope(existingEvent.data()) };
      }

      const existingById = await transaction.get(eventRef);
      if (existingById.exists) {
        const existing = validateLifecycleEventEnvelope(existingById.data());
        if (existing.organizationId !== event.organizationId || existing.dataMode !== event.dataMode || existing.idempotencyKey !== event.idempotencyKey) {
          throw new Error("Lifecycle event ID collision detected.");
        }
        transaction.create(receipt, {
          organizationId: event.organizationId,
          dataMode: event.dataMode,
          idempotencyKey: event.idempotencyKey,
          eventId: event.eventId,
          createdAt: event.receivedAt,
        });
        return { status: "duplicate", event: existing };
      }

      transaction.create(eventRef, JSON.parse(JSON.stringify(event)));
      transaction.create(receipt, {
        organizationId: event.organizationId,
        dataMode: event.dataMode,
        idempotencyKey: event.idempotencyKey,
        eventId: event.eventId,
        createdAt: event.receivedAt,
      });
      return { status: "appended", event };
    });
  }
}

export class FirestoreLifecycleEventAdmissionPort implements LifecycleEventAdmissionPort {
  async admit(input: LifecycleEventAdmissionInput): Promise<LifecycleEventAdmissionDecision> {
    const at = new Date().toISOString();
    const ref = admissionRef(input, at);
    const limit = input.source === "browser" ? 120 : input.source === "provider_webhook" ? 2_000 : 1_000;
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const count = Number(snapshot.data()?.count ?? 0);
      if (!Number.isFinite(count) || count < 0) return { status: "denied", reason: "Lifecycle admission state is invalid." };
      if (count >= limit) return { status: "denied", reason: "Lifecycle event rate limit reached.", retryAfterSeconds: 60 };
      transaction.set(ref, {
        organizationId: input.organizationId,
        dataMode: input.dataMode,
        source: input.source,
        count: count + 1,
        window: at.slice(0, 16),
        expiresAt: new Date(Date.parse(at) + 15 * 60_000).toISOString(),
        updatedAt: at,
      }, { merge: false });
      return { status: "allowed" };
    });
  }
}

export const organizationCustomerBindingPort = new FirestoreOrganizationCustomerBindingPort();
export const durableLifecycleEventStore = new FirestoreDurableLifecycleEventStore();
export const lifecycleEventAdmissionPort = new FirestoreLifecycleEventAdmissionPort();
export const secureLifecycleEventAppender = new SecureLifecycleEventAppender(
  organizationCustomerBindingPort,
  durableLifecycleEventStore,
  lifecycleEventAdmissionPort,
);

export const firestoreLifecycleEventIntegrationPort: EventIntegrationPort<LifecycleEventEnvelope> = {
  async publish(event: LifecycleEventEnvelope, context: IntegrationRequestContext): Promise<IntegrationResult<void>> {
    try {
      const validated = validateLifecycleEventEnvelope(event);
      if (context.organizationId && context.organizationId !== validated.organizationId) {
        return integrationFailure({ code: "forbidden", message: "Lifecycle event organization scope mismatch.", retryable: false }, { integration: "events", provider: "firestore", correlationId: context.correlationId });
      }
      await secureLifecycleEventAppender.appendTrustedEnvelope({
        event: validated,
        expectedOrganizationId: validated.organizationId,
        expectedSource: validated.source,
      });
      return integrationSuccess(undefined, { integration: "events", provider: "firestore", correlationId: context.correlationId });
    } catch (error) {
      return integrationFailure({
        code: "unavailable",
        message: error instanceof Error ? error.message : "Lifecycle event persistence failed.",
        retryable: true,
      }, { integration: "events", provider: "firestore", correlationId: context.correlationId });
    }
  },

  async publishBatch(events: readonly LifecycleEventEnvelope[], context: IntegrationRequestContext): Promise<IntegrationResult<void>> {
    for (const event of events) {
      const result = await this.publish(event, context);
      if (!result.ok) return result;
    }
    return integrationSuccess(undefined, { integration: "events", provider: "firestore", correlationId: context.correlationId });
  },

  async health(): Promise<IntegrationHealth> {
    try {
      await db.collection("_runtimeHealth").doc("firestore").get();
      return { integration: "events", provider: "firestore", status: "ready", checkedAt: new Date().toISOString() };
    } catch (error) {
      return { integration: "events", provider: "firestore", status: "unavailable", checkedAt: new Date().toISOString(), message: error instanceof Error ? error.message : "Firestore unavailable." };
    }
  },
};
