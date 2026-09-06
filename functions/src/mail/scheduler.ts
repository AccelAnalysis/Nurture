import { randomUUID } from "node:crypto";
import type { MailDeliveryRecord, MailDestinationPolicy, MailRoute, MailWorkerJob, MailWorkerResult } from "../../../shared/mail/contracts.js";
import { NURTURE_MAIL_SCHEMA_VERSION } from "../../../shared/mail/contracts.js";
import { calculateRetryDecision } from "./retry.js";
import type { MailSpool } from "./spool.js";

export interface MailRouteResolverPort {
  resolve(domain: string): Promise<MailRoute>;
}

export interface MailDestinationPolicyPort {
  get(domain: string): Promise<MailDestinationPolicy>;
}

const phasePath = ["routing", "connecting", "negotiating", "transmitting"] as const;

export class NurtureMailScheduler {
  constructor(
    private readonly spool: MailSpool,
    private readonly routes: MailRouteResolverPort,
    private readonly policies: MailDestinationPolicyPort,
  ) {}

  async leaseJobs(input: { owner: string; now: Date; leaseMs: number; limit: number }): Promise<MailWorkerJob[]> {
    const deliveries = await this.spool.leaseReady(input);
    const jobs: MailWorkerJob[] = [];
    for (const delivery of deliveries) {
      const message = await this.spool.getMessage(delivery.messageId);
      if (!message) {
        await this.advanceToPhase(delivery.deliveryId, delivery.state, "routing");
        await this.spool.transition(delivery.deliveryId, ["routing"], "permanent_failure", { stateReason: "immutable-message-record-missing", lease: undefined });
        continue;
      }
      const [route, destinationPolicy] = await Promise.all([
        this.routes.resolve(delivery.envelope.recipientDomain),
        this.policies.get(delivery.envelope.recipientDomain),
      ]);
      if (!delivery.lease) throw new Error("Leased mail delivery did not retain its lease.");
      jobs.push({
        schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
        jobId: randomUUID(),
        delivery,
        messageBlob: message.blob,
        route,
        destinationPolicy,
        lease: delivery.lease,
        issuedAt: input.now.toISOString(),
      });
    }
    return jobs;
  }

  async applyWorkerResult(result: MailWorkerResult): Promise<MailDeliveryRecord> {
    const current = await this.spool.getDelivery(result.deliveryId);
    if (!current) throw new Error("Worker result references an unknown delivery.");
    if (current.organizationId !== result.organizationId) throw new Error("Worker result tenant does not match delivery tenant.");
    await this.advanceToPhase(result.deliveryId, current.state, result.phase);

    if (result.outcome === "accepted") {
      return this.spool.completeWorkerResult(result, "accepted", { acceptedAt: result.completedAt, stateReason: "remote-mta-accepted", nextAttemptAt: undefined });
    }
    if (result.outcome === "acceptance_uncertain") {
      return this.spool.completeWorkerResult(result, "acceptance_uncertain", { stateReason: "remote-acceptance-uncertain-no-blind-retry", nextAttemptAt: undefined });
    }
    if (result.outcome === "permanent_failure") {
      return this.spool.completeWorkerResult(result, "permanent_failure", { stateReason: result.attempt.normalizedReason ?? "permanent-failure", nextAttemptAt: undefined });
    }

    const refreshed = await this.spool.getDelivery(result.deliveryId);
    if (!refreshed) throw new Error("Delivery disappeared while applying worker result.");
    const decision = calculateRetryDecision({
      attempt: result.attempt.attempt,
      reason: result.attempt.normalizedReason ?? "unknown-temporary",
      now: new Date(result.completedAt),
      deliveryExpiresAt: new Date(refreshed.expiresAt),
      ...(result.attempt.retryAfterMs ? { retryAfterMs: result.attempt.retryAfterMs } : {}),
    });
    if (!decision.retry) {
      return this.spool.completeWorkerResult(result, "expired", { stateReason: decision.reason, nextAttemptAt: undefined });
    }
    return this.spool.completeWorkerResult(result, "deferred", { stateReason: decision.reason, nextAttemptAt: decision.nextAttemptAt });
  }

  private async advanceToPhase(deliveryId: string, startingState: MailDeliveryRecord["state"], phase: MailWorkerResult["phase"]) {
    let state = startingState;
    const targetIndex = phasePath.indexOf(phase);
    for (let index = 0; index <= targetIndex; index += 1) {
      const next = phasePath[index]!;
      if (state === next) continue;
      if (index === 0 && state !== "queued" && state !== "deferred") {
        // A worker result must complete exactly the delivery it leased, not replay a prior attempt.
        throw new Error(`Mail delivery cannot enter worker phase from ${state}.`);
      }
      const updated = await this.spool.transition(deliveryId, [state], next, { stateReason: `worker-${next}` });
      state = updated.state;
    }
  }
}
