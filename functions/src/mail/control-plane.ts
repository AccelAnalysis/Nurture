import { createHash } from "node:crypto";
import type { ImmutableMailMessage, MailDeliveryRecord, MailPurpose, MailSendingIdentity, MailTrafficClass, MailboxAddress } from "../../../shared/mail/contracts.js";
import { NURTURE_MAIL_SCHEMA_VERSION } from "../../../shared/mail/contracts.js";
import { normalizeMailbox } from "./address.js";
import { createBounceAddress } from "./bounce-token.js";
import type { DkimSigningPort } from "./dkim.js";
import { mailDeliveryIdForEffect } from "./idempotency.js";
import { compileInternetMessage, type MailAttachmentInput } from "./message-compiler.js";
import type { MailObjectStore, MailSpool } from "./spool.js";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1_000;

export interface MailSendingIdentityStore {
  get(identityId: string): Promise<MailSendingIdentity | null>;
}

export interface MailAdmissionPort {
  evaluate(input: {
    organizationId: string;
    purpose: MailPurpose;
    trafficClass: MailTrafficClass;
    recipient: string;
    sendingIdentity: MailSendingIdentity;
  }): Promise<{ admitted: true } | { admitted: false; reason: string }>;
}

export interface SubmitNurtureMailInput {
  organizationId: string;
  /** Stable logical effect identity from the trusted caller; required for crash-safe replay. */
  idempotencyKey: string;
  communicationMessageId?: string;
  purpose: MailPurpose;
  trafficClass: MailTrafficClass;
  sendingIdentityId: string;
  from: MailboxAddress;
  replyTo?: MailboxAddress;
  to: MailboxAddress;
  subject: string;
  text: string;
  html: string;
  listUnsubscribeUrl?: string;
  attachments?: readonly MailAttachmentInput[];
  expiresAt?: Date;
  now?: Date;
}

export type SubmitNurtureMailResult =
  | { submitted: true; message: ImmutableMailMessage; delivery: MailDeliveryRecord }
  | { submitted: false; reason: string };

export class NurtureMailControlPlane {
  constructor(
    private readonly identities: MailSendingIdentityStore,
    private readonly admission: MailAdmissionPort,
    private readonly signer: DkimSigningPort,
    private readonly objects: MailObjectStore,
    private readonly spool: MailSpool,
    private readonly bounceSecret: string,
  ) {}

  async submit(input: SubmitNurtureMailInput): Promise<SubmitNurtureMailResult> {
    const now = input.now ?? new Date();
    const deliveryId = mailDeliveryIdForEffect(input.organizationId, input.idempotencyKey);
    const existingDelivery = await this.spool.getDelivery(deliveryId);
    if (existingDelivery) {
      const existingMessage = await this.spool.getMessage(existingDelivery.messageId);
      if (!existingMessage) throw new Error("Idempotent mail delivery exists without its immutable message record.");
      const recovered = await this.ensureQueued(deliveryId);
      return { submitted: true, message: existingMessage, delivery: recovered };
    }

    const identity = await this.identities.get(input.sendingIdentityId);
    if (!identity) return { submitted: false, reason: "sending-identity-not-found" };
    if (identity.organizationId !== input.organizationId) return { submitted: false, reason: "sending-identity-tenant-mismatch" };
    if (identity.status !== "ready") return { submitted: false, reason: `sending-identity-${identity.status}` };
    if (!identity.allowedTrafficClasses.includes(input.trafficClass)) return { submitted: false, reason: "traffic-class-not-permitted" };

    const from = normalizeMailbox(input.from.address);
    const recipient = normalizeMailbox(input.to.address);
    if (from.domain !== identity.fromDomain) return { submitted: false, reason: "from-domain-does-not-match-sending-identity" };

    const admission = await this.admission.evaluate({
      organizationId: input.organizationId,
      purpose: input.purpose,
      trafficClass: input.trafficClass,
      recipient: recipient.address,
      sendingIdentity: identity,
    });
    if (!admission.admitted) return { submitted: false, reason: admission.reason };

    const compiled = compileInternetMessage({
      organizationId: input.organizationId,
      ...(input.communicationMessageId ? { communicationMessageId: input.communicationMessageId } : {}),
      purpose: input.purpose,
      from: { ...input.from, address: from.address },
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      to: { ...input.to, address: recipient.address },
      subject: input.subject,
      text: input.text,
      html: input.html,
      date: now,
      messageIdDomain: identity.fromDomain,
      ...(input.listUnsubscribeUrl ? { listUnsubscribeUrl: input.listUnsubscribeUrl } : {}),
      ...(input.attachments ? { attachments: input.attachments } : {}),
    });
    const signed = await this.signer.sign({
      rfc822: compiled.rfc822,
      organizationId: input.organizationId,
      keyReference: identity.dkimKeyReference,
      domain: identity.dkimDomain,
      selector: identity.dkimSelector,
    });
    const sha256 = createHash("sha256").update(signed).digest("hex");
    const storageKey = `mail/${encodeURIComponent(input.organizationId)}/${compiled.messageId}/${sha256}.eml`;
    await this.objects.put({ storageKey, rfc822: signed, sha256, byteLength: signed.byteLength });

    const message: ImmutableMailMessage = {
      schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
      messageId: compiled.messageId,
      organizationId: input.organizationId,
      ...(input.communicationMessageId ? { communicationMessageId: input.communicationMessageId } : {}),
      purpose: input.purpose,
      from: compiled.from,
      ...(compiled.replyTo ? { replyTo: compiled.replyTo } : {}),
      to: compiled.to,
      subject: compiled.subject,
      messageIdHeader: compiled.messageIdHeader,
      blob: { contentType: "message/rfc822", sha256, byteLength: signed.byteLength, storageKey },
      createdAt: compiled.createdAt,
    };
    await this.spool.putMessage(message);

    const mailFrom = createBounceAddress(deliveryId, identity.mailFromDomain, this.bounceSecret);
    const expiresAt = input.expiresAt ?? new Date(now.getTime() + FIVE_DAYS_MS);
    const delivery: MailDeliveryRecord = {
      schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
      deliveryId,
      organizationId: input.organizationId,
      messageId: message.messageId,
      envelope: {
        schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
        deliveryId,
        organizationId: input.organizationId,
        messageId: message.messageId,
        mailFrom,
        rcptTo: recipient.address,
        recipientDomain: recipient.domain,
        sendingIdentityId: identity.id,
        egressPoolId: identity.egressPoolId,
        trafficClass: input.trafficClass,
        createdAt: now.toISOString(),
      },
      state: "created",
      attempts: [],
      nextAttemptAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      updatedAt: now.toISOString(),
    };
    const admissionResult = await this.spool.enqueue(delivery);
    if (!admissionResult.created) {
      const winningMessage = await this.spool.getMessage(admissionResult.delivery.messageId);
      if (!winningMessage) throw new Error("Idempotent mail delivery exists without its immutable message record.");
      const recovered = await this.ensureQueued(deliveryId);
      return { submitted: true, message: winningMessage, delivery: recovered };
    }
    const queued = await this.ensureQueued(deliveryId);
    return { submitted: true, message, delivery: queued };
  }

  private async ensureQueued(deliveryId: string) {
    // A concurrent replay may observe the deterministic delivery after enqueue but
    // before the first caller advances admission. Reconcile those pre-send states
    // instead of creating another delivery or leaving a crash-stranded record.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await this.spool.getDelivery(deliveryId);
      if (!current) throw new Error("Reserved mail delivery disappeared during admission.");
      if (current.state === "queued" || current.state === "routing" || current.state === "connecting" || current.state === "negotiating" || current.state === "transmitting" || current.state === "accepted" || current.state === "deferred" || current.state === "acceptance_uncertain" || current.state === "bounced" || current.state === "complained" || current.state === "unsubscribed") return current;
      try {
        if (current.state === "created") {
          await this.spool.transition(deliveryId, ["created"], "policy_approved", { stateReason: "control-plane-admission-approved" });
          continue;
        }
        if (current.state === "policy_approved") {
          return await this.spool.transition(deliveryId, ["policy_approved"], "queued", { stateReason: "queued-for-direct-smtp" });
        }
        return current;
      } catch {
        // Another idempotent caller may have advanced the same record. Re-read
        // and reconcile rather than treating that compare-and-set miss as failure.
      }
    }
    const current = await this.spool.getDelivery(deliveryId);
    if (!current) throw new Error("Mail delivery disappeared while reconciling admission.");
    return current;
  }
}
