import type { MessageDeliveryStatus } from "../../../shared/communications/contracts.js";

const providerTerminal = new Set<MessageDeliveryStatus>(["delivered", "bounced", "dropped", "complained", "unsubscribed"]);

/**
 * Provider callbacks are unordered. Preserve stronger terminal knowledge and
 * allow post-delivery human actions (complaint/unsubscribe) without letting a
 * late deferred/bounce/drop callback regress a known delivery.
 */
export function shouldApplyProviderTransition(current: MessageDeliveryStatus, next: MessageDeliveryStatus) {
  if (current === next) return false;
  if (current === "complained" || current === "unsubscribed") return false;
  if (current === "delivered") return next === "complained" || next === "unsubscribed";
  if ((current === "bounced" || current === "dropped") && next !== "complained" && next !== "unsubscribed") return false;
  if (next === "deferred" && providerTerminal.has(current)) return false;
  if (next === "accepted" && (current !== "planned" && current !== "submitting" && current !== "unknown")) return false;
  return true;
}
