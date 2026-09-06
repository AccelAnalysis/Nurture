import type { MailDeliveryRecord } from "../../../shared/mail/contracts.js";
import { parseBounceToken } from "./bounce-token.js";
import { parseDeliveryStatusNotification } from "./dsn.js";
import type { MailSpool } from "./spool.js";

function localPart(addressOrLocalPart: string) {
  return addressOrLocalPart.split("@", 1)[0] ?? addressOrLocalPart;
}

export class NurtureMailIngress {
  constructor(private readonly spool: MailSpool, private readonly bounceSecret: string) {}

  async ingestDsn(input: { bounceRecipient: string; rawDeliveryStatus: string; occurredAt?: Date }): Promise<MailDeliveryRecord> {
    const { deliveryId } = parseBounceToken(localPart(input.bounceRecipient), this.bounceSecret);
    const current = await this.spool.getDelivery(deliveryId);
    if (!current) throw new Error("DSN references an unknown Nurture Mail delivery.");
    const dsn = parseDeliveryStatusNotification(input.rawDeliveryStatus);
    const occurredAt = (input.occurredAt ?? new Date()).toISOString();

    if (dsn.action === "delayed" || dsn.status?.startsWith("4.")) {
      // An asynchronous delayed DSN after remote acceptance is diagnostic only;
      // it must not blindly reopen an accepted DATA transaction for retry.
      return current;
    }
    if (dsn.action === "failed" || dsn.status?.startsWith("5.")) {
      if (current.state !== "accepted" && current.state !== "acceptance_uncertain") return current;
      return this.spool.transition(deliveryId, [current.state], "bounced", {
        bouncedAt: occurredAt,
        stateReason: `${dsn.reason}${dsn.status ? `:${dsn.status}` : ""}`,
      });
    }
    return current;
  }

  async recordComplaint(input: { deliveryId: string; occurredAt?: Date; reason?: string }) {
    const current = await this.spool.getDelivery(input.deliveryId);
    if (!current) throw new Error("Complaint references an unknown Nurture Mail delivery.");
    if (!(["accepted", "acceptance_uncertain", "bounced"] as const).includes(current.state as "accepted" | "acceptance_uncertain" | "bounced")) return current;
    return this.spool.transition(input.deliveryId, [current.state], "complained", {
      complainedAt: (input.occurredAt ?? new Date()).toISOString(),
      stateReason: input.reason?.slice(0, 500) || "recipient-complaint",
    });
  }

  async recordUnsubscribe(input: { deliveryId: string; occurredAt?: Date }) {
    const current = await this.spool.getDelivery(input.deliveryId);
    if (!current) throw new Error("Unsubscribe references an unknown Nurture Mail delivery.");
    if (!(["accepted", "acceptance_uncertain", "bounced"] as const).includes(current.state as "accepted" | "acceptance_uncertain" | "bounced")) return current;
    return this.spool.transition(input.deliveryId, [current.state], "unsubscribed", {
      unsubscribedAt: (input.occurredAt ?? new Date()).toISOString(),
      stateReason: "recipient-unsubscribed",
    });
  }
}
