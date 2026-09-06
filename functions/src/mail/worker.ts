import { randomUUID } from "node:crypto";
import type { MailAttemptOutcome, MailDeliveryAttempt, MailSmtpObservation, MailWorkerJob, MailWorkerResult } from "../../../shared/mail/contracts.js";
import { NURTURE_MAIL_SCHEMA_VERSION } from "../../../shared/mail/contracts.js";
import type { MailObjectStore } from "./spool.js";
import type { SmtpConnectionFactory } from "./smtp-session.js";
import { executeSmtpDelivery } from "./smtp-session.js";

function outcome(observation: MailSmtpObservation): MailAttemptOutcome {
  if (observation.accepted) return "accepted";
  if (observation.reason === "acceptance-uncertain") return "acceptance_uncertain";
  return observation.retryable ? "deferred" : "permanent_failure";
}

function syntheticObservation(reason: MailSmtpObservation["reason"], rawResponse: string, retryable: boolean): MailSmtpObservation {
  return { code: 0, rawResponse, reason, retryable, accepted: false };
}

export class NurtureMailWorker {
  constructor(
    private readonly objects: MailObjectStore,
    private readonly connections: SmtpConnectionFactory,
    private readonly options: { heloName: string; sourceIp?: string; connectTimeoutMs?: number; requireTls?: boolean },
  ) {}

  async deliver(job: MailWorkerJob): Promise<MailWorkerResult> {
    const startedAt = new Date().toISOString();
    const attemptNumber = job.delivery.attempts.length + 1;
    const base: MailDeliveryAttempt = {
      schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
      attemptId: randomUUID(),
      attempt: attemptNumber,
      startedAt,
      ...(this.options.sourceIp ? { sourceIp: this.options.sourceIp } : {}),
      sourceHostname: this.options.heloName,
    };

    let phase: MailWorkerResult["phase"] = "routing";
    let observation: MailSmtpObservation;
    let mxHost: string | undefined;
    let mxPreference: number | undefined;
    let tls: MailDeliveryAttempt["tls"];

    if (job.route.nullMx) {
      observation = syntheticObservation("dns-permanent", "Recipient domain publishes a Null MX and does not accept email.", false);
    } else if (!job.route.targets.length) {
      observation = syntheticObservation("dns-temporary", "No usable MX or implicit-MX address is currently available.", true);
    } else {
      const target = job.route.targets[0]!;
      const address = target.addresses[0];
      mxHost = target.host;
      mxPreference = target.preference;
      if (!address) {
        observation = syntheticObservation("dns-temporary", "Selected MX has no routable address.", true);
      } else {
        phase = "connecting";
        const blob = await this.objects.get(job.messageBlob.storageKey);
        if (!blob || blob.sha256 !== job.messageBlob.sha256 || blob.byteLength !== job.messageBlob.byteLength) {
          observation = syntheticObservation("unknown-permanent", "Immutable message blob is missing or failed integrity validation.", false);
        } else {
          let connection;
          try {
            connection = await this.connections.connect({ host: target.host, address, port: 25, timeoutMs: this.options.connectTimeoutMs ?? 30_000, ...(this.options.sourceIp ? { sourceIp: this.options.sourceIp } : {}) });
          } catch (error) {
            observation = syntheticObservation("connection-temporary", error instanceof Error ? error.message : "SMTP connection failed.", true);
          }
          if (connection) {
            try {
              const result = await executeSmtpDelivery({
                connection,
                mxHost: target.host,
                heloName: this.options.heloName,
                envelope: job.delivery.envelope,
                rfc822: blob.rfc822,
                tlsMode: this.options.requireTls ? "required" : "opportunistic",
              });
              phase = result.phase;
              observation = result.observation;
              tls = result.tls;
            } catch (error) {
              phase = "negotiating";
              observation = syntheticObservation("connection-temporary", error instanceof Error ? error.message : "SMTP session failed before DATA.", true);
            } finally {
              await connection.close();
            }
          }
        }
      }
    }

    const completedAt = new Date().toISOString();
    const resolvedOutcome = outcome(observation!);
    const attempt: MailDeliveryAttempt = {
      ...base,
      completedAt,
      ...(mxHost ? { mxHost } : {}),
      ...(mxPreference !== undefined ? { mxPreference } : {}),
      smtpCode: observation!.code,
      ...(observation!.enhancedStatusCode ? { enhancedStatusCode: observation!.enhancedStatusCode } : {}),
      rawResponse: observation!.rawResponse.slice(0, 2_000),
      normalizedReason: observation!.reason,
      outcome: resolvedOutcome,
      ...(tls ? { tls } : {}),
    };
    return {
      schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
      jobId: job.jobId,
      deliveryId: job.delivery.deliveryId,
      organizationId: job.delivery.organizationId,
      leaseToken: job.lease.token,
      leaseOwner: job.lease.owner,
      phase,
      attempt,
      outcome: resolvedOutcome,
      completedAt,
    };
  }
}
