import type { MailDeliveryRecord, MailDeliveryState } from "../../../shared/mail/contracts.js";

export type NurtureMailLifecycleEventType =
  | "mail.message.queued"
  | "mail.delivery.deferred"
  | "mail.delivery.accepted"
  | "mail.delivery.acceptance_uncertain"
  | "mail.delivery.failed"
  | "mail.delivery.expired"
  | "mail.bounce.received"
  | "mail.complaint.received"
  | "mail.recipient.unsubscribed";

export interface NurtureMailLifecycleEvent {
  schemaVersion: 1;
  eventType: NurtureMailLifecycleEventType;
  organizationId: string;
  deliveryId: string;
  messageId: string;
  recipientDomain: string;
  trafficClass: MailDeliveryRecord["envelope"]["trafficClass"];
  occurredAt: string;
  reason?: string;
}

function typeForState(state: MailDeliveryState): NurtureMailLifecycleEventType | null {
  switch (state) {
    case "queued": return "mail.message.queued";
    case "deferred": return "mail.delivery.deferred";
    case "accepted": return "mail.delivery.accepted";
    case "acceptance_uncertain": return "mail.delivery.acceptance_uncertain";
    case "permanent_failure": return "mail.delivery.failed";
    case "expired": return "mail.delivery.expired";
    case "bounced": return "mail.bounce.received";
    case "complained": return "mail.complaint.received";
    case "unsubscribed": return "mail.recipient.unsubscribed";
    default: return null;
  }
}

export function createNurtureMailLifecycleEvent(delivery: MailDeliveryRecord, occurredAt = delivery.updatedAt): NurtureMailLifecycleEvent | null {
  const eventType = typeForState(delivery.state);
  if (!eventType) return null;
  return {
    schemaVersion: 1,
    eventType,
    organizationId: delivery.organizationId,
    deliveryId: delivery.deliveryId,
    messageId: delivery.messageId,
    recipientDomain: delivery.envelope.recipientDomain,
    trafficClass: delivery.envelope.trafficClass,
    occurredAt,
    ...(delivery.stateReason ? { reason: delivery.stateReason.slice(0, 500) } : {}),
  };
}
