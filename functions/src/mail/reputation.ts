import type { MailReputationSnapshot } from "../../../shared/mail/contracts.js";

export interface MailReputationPolicy {
  minimumVolume: number;
  complaintWatchRate: number;
  complaintBlockRate: number;
  permanentFailureWatchRate: number;
  permanentFailureBlockRate: number;
  deferralWatchRate: number;
  deferralBlockRate: number;
}

export const conservativeMailReputationPolicy: MailReputationPolicy = {
  minimumVolume: 100,
  complaintWatchRate: 0.001,
  complaintBlockRate: 0.003,
  permanentFailureWatchRate: 0.03,
  permanentFailureBlockRate: 0.08,
  deferralWatchRate: 0.05,
  deferralBlockRate: 0.25,
};

function rate(value: number, denominator: number) {
  return denominator > 0 ? value / denominator : 0;
}

export function evaluateMailReputation(snapshot: Omit<MailReputationSnapshot, "health">, policy: MailReputationPolicy = conservativeMailReputationPolicy): MailReputationSnapshot {
  if (snapshot.attempted < policy.minimumVolume) return { ...snapshot, health: "healthy" };
  const complaintRate = rate(snapshot.complaints, snapshot.accepted);
  const permanentFailureRate = rate(snapshot.permanentFailures, snapshot.attempted);
  const deferralRate = rate(snapshot.deferred, snapshot.attempted);
  if (complaintRate >= policy.complaintBlockRate || permanentFailureRate >= policy.permanentFailureBlockRate || deferralRate >= policy.deferralBlockRate) {
    return { ...snapshot, health: "blocked" };
  }
  if (complaintRate >= policy.complaintWatchRate || permanentFailureRate >= policy.permanentFailureWatchRate || deferralRate >= policy.deferralWatchRate) {
    return { ...snapshot, health: "degraded" };
  }
  return { ...snapshot, health: "healthy" };
}

export function shouldAdmitMailForReputation(snapshots: readonly MailReputationSnapshot[]) {
  if (snapshots.some((entry) => entry.health === "blocked")) return { admitted: false as const, reason: "mail-reputation-blocked" };
  if (snapshots.some((entry) => entry.health === "degraded")) return { admitted: true as const, reason: "mail-reputation-degraded-throttle" };
  return { admitted: true as const, reason: "mail-reputation-healthy" };
}
