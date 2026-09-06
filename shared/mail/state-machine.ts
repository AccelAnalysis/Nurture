import type { MailDeliveryState } from "./contracts.js";

const transitions: Readonly<Record<MailDeliveryState, ReadonlySet<MailDeliveryState>>> = {
  created: new Set(["policy_approved", "suppressed", "cancelled"]),
  policy_approved: new Set(["queued", "suppressed", "cancelled"]),
  queued: new Set(["routing", "suppressed", "expired", "cancelled"]),
  routing: new Set(["connecting", "deferred", "permanent_failure", "expired", "cancelled"]),
  connecting: new Set(["negotiating", "deferred", "permanent_failure", "expired"]),
  negotiating: new Set(["transmitting", "deferred", "permanent_failure", "expired"]),
  transmitting: new Set(["accepted", "deferred", "permanent_failure", "acceptance_uncertain", "expired"]),
  accepted: new Set(["bounced", "complained", "unsubscribed"]),
  deferred: new Set(["queued", "routing", "suppressed", "expired", "cancelled"]),
  permanent_failure: new Set([]),
  acceptance_uncertain: new Set(["accepted", "bounced", "complained", "unsubscribed"]),
  bounced: new Set(["complained", "unsubscribed"]),
  complained: new Set([]),
  unsubscribed: new Set([]),
  suppressed: new Set([]),
  expired: new Set([]),
  cancelled: new Set([]),
};

export function canTransitionMailDelivery(current: MailDeliveryState, next: MailDeliveryState) {
  if (current === next) return false;
  return transitions[current].has(next);
}

export function assertMailDeliveryTransition(current: MailDeliveryState, next: MailDeliveryState) {
  if (!canTransitionMailDelivery(current, next)) {
    throw new Error(`Illegal Nurture Mail delivery transition: ${current} -> ${next}`);
  }
}

export function isMailDeliveryTerminal(state: MailDeliveryState) {
  return transitions[state].size === 0;
}

export function isMailDeliveryRetryable(state: MailDeliveryState) {
  return state === "deferred";
}

export function shouldBlindRetryMailDelivery(state: MailDeliveryState) {
  // An acceptance-uncertain state is intentionally never automatically retried:
  // the receiver may have committed the DATA transaction before the connection died.
  return state === "deferred";
}
