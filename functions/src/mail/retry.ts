import type { MailSmtpReason } from "../../../shared/mail/contracts.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface RetryDecisionInput {
  attempt: number;
  reason: MailSmtpReason;
  now: Date;
  deliveryExpiresAt: Date;
  retryAfterMs?: number;
  destinationBackoffUntil?: Date;
}

export interface RetryDecision {
  retry: boolean;
  nextAttemptAt?: string;
  delayMs?: number;
  reason: string;
}

const terminalReasons = new Set<MailSmtpReason>([
  "accepted",
  "recipient-permanent",
  "mailbox-permanent",
  "policy-permanent",
  "authentication-permanent",
  "dns-permanent",
  "tls-permanent",
  "message-too-large",
  "unknown-permanent",
  "acceptance-uncertain",
]);

export function calculateRetryDecision(input: RetryDecisionInput): RetryDecision {
  if (terminalReasons.has(input.reason)) return { retry: false, reason: `terminal:${input.reason}` };
  if (input.now >= input.deliveryExpiresAt) return { retry: false, reason: "delivery-expired" };

  // RFC 5321 gives 30 minutes as a general-purpose retry interval. Nurture can
  // later tune by destination, while maintaining per-destination backoff.
  const exponent = Math.max(0, Math.min(input.attempt - 1, 5));
  const defaultDelay = Math.min(30 * MINUTE * (2 ** exponent), 8 * HOUR);
  const providerDelay = Math.max(0, input.retryAfterMs ?? 0);
  const destinationDelay = input.destinationBackoffUntil ? Math.max(0, input.destinationBackoffUntil.getTime() - input.now.getTime()) : 0;
  const delayMs = Math.max(defaultDelay, providerDelay, destinationDelay);
  const next = new Date(input.now.getTime() + delayMs);
  if (next >= input.deliveryExpiresAt || next.getTime() - input.now.getTime() > 5 * DAY) return { retry: false, reason: "next-attempt-beyond-expiry" };
  return { retry: true, nextAttemptAt: next.toISOString(), delayMs, reason: `retry:${input.reason}` };
}
