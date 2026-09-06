import type { MailDestinationPolicy } from "../../../shared/mail/contracts.js";

export interface DestinationSignalWindow {
  recipientDomain: string;
  attempts: number;
  accepted: number;
  deferred: number;
  reputationDeferred: number;
  currentConcurrentConnections: number;
  currentMessagesPerMinute: number;
  updatedAt: string;
}

export function deriveDestinationPolicy(signal: DestinationSignalWindow, baseline: { maxConcurrentConnections: number; maxMessagesPerMinute: number }): MailDestinationPolicy {
  const attempts = Math.max(1, signal.attempts);
  const deferralRate = signal.deferred / attempts;
  const reputationRate = signal.reputationDeferred / attempts;
  let factor = 1;
  let reason: string | undefined;
  if (reputationRate >= 0.05 || deferralRate >= 0.20) {
    factor = 0.25;
    reason = "destination-high-deferral-rate";
  } else if (reputationRate >= 0.01 || deferralRate >= 0.05) {
    factor = 0.5;
    reason = "destination-elevated-deferral-rate";
  }
  return {
    recipientDomain: signal.recipientDomain,
    maxConcurrentConnections: Math.max(1, Math.floor(baseline.maxConcurrentConnections * factor)),
    maxMessagesPerMinute: Math.max(1, Math.floor(baseline.maxMessagesPerMinute * factor)),
    ...(reason ? { reason } : {}),
    updatedAt: signal.updatedAt,
  };
}
