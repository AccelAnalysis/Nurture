import type { EventPayload } from "../../../shared/analytics/contracts.js";
import type { AuditActor, AuditWriteRequest } from "../../../shared/platform/audit.js";
import type { OrganizationCapability } from "../../../shared/platform/authorization.js";
import { FeedbackError, type FeedbackScope } from "../../../shared/feedback/contracts.js";
import type { FeedbackEventType } from "../../../shared/feedback/events.js";
import { id, invariant } from "../../../shared/feedback/validation.js";

export type Collection = "surveyConfigurations" | "surveyVersions" | "surveyInvitations" | "surveyTokens" | "surveyResponses" | "programConfigurations" | "programVersions" | "referralCodes" | "customerReferralCodes" | "referralAttributions" | "referralProofs" | "customerAttributions" | "referralRewards" | "referralLedger" | "feedbackTreatment" | "feedbackCooldowns" | "referralLimits" | "referralInvitations" | "testCreditEffects";
export const collections: readonly Collection[] = ["surveyConfigurations", "surveyVersions", "surveyInvitations", "surveyTokens", "surveyResponses", "programConfigurations", "programVersions", "referralCodes", "customerReferralCodes", "referralAttributions", "referralProofs", "customerAttributions", "referralRewards", "referralLedger", "feedbackTreatment", "feedbackCooldowns", "referralLimits", "referralInvitations", "testCreditEffects"];
/** Minimal action input for the existing lifecycle runtime, NOT a second job/scheduler model. */
export interface FeedbackAction {
  effectId: string; customerId: string; kind: "survey-invitation" | "service-recovery" | "referral-invitation" | "reward-status";
  referenceId: string;
}
export interface FeedbackEventIntent { id: string; type: FeedbackEventType; customerId?: string; payload: EventPayload }
export interface FeedbackTransaction {
  /** Passed through only for trusted adapters that join the same Firestore transaction. */
  readonly native?: unknown;
  /** Stage a write supplied by the accepted lifecycle/audit/action adapter after all transaction reads complete. */
  stage(write: () => void): void;
  get<T>(collection: Collection, key: string): Promise<T | null>;
  put<T extends object>(collection: Collection, key: string, value: T): void;
  create<T extends object>(collection: Collection, key: string, value: T): void;
  event(intent: FeedbackEventIntent): void;
  audit(request: AuditWriteRequest, actor: AuditActor): void;
  enqueue(action: FeedbackAction): void;
}
export interface FeedbackStore {
  transaction<T>(scope: FeedbackScope, work: (tx: FeedbackTransaction) => Promise<T>): Promise<T>;
  page<T>(scope: FeedbackScope, collection: Collection, query: { equal?: [string, string]; after?: string; limit: number }): Promise<{ rows: T[]; cursor: string | null }>;
}
export interface TrustedFeedbackActor { uid: string; customerId?: string; capabilities: ReadonlySet<OrganizationCapability> }
/** Feature-specific read projection of canonical customer facts, never a persisted shadow Customer. */
export interface CustomerFeedbackFacts { exists: boolean; identityId: string | null; feedbackAllowed: boolean; referralAllowed: boolean }
export interface FeedbackPolicy {
  release3AcceptedSha: string | null; enabled: boolean; paused: boolean; outboundEnabled: boolean; rewardsEnabled: boolean;
  anonymousPolicyId: string | null; minimumAnonymousResponses: number;
}
export interface QualificationFacts {
  evidenceId: string; customerId: string; status: "paid" | "pending" | "refunded";
  paidAt: number; current: boolean;
}
export interface FeedbackDependencies {
  store: FeedbackStore;
  now(): number;
  randomId(): string;
  digest(value: string): string;
  tokenKeyId: string;
  /** HMAC with a server-only key. Key IDs stay pinned for old invitations after rotation. */
  token(keyId: string, purpose: string): string;
  policy(tx: FeedbackTransaction, scope: FeedbackScope): Promise<FeedbackPolicy>;
  customer(tx: FeedbackTransaction, scope: FeedbackScope, customerId: string): Promise<CustomerFeedbackFacts>;
  /** Must reserve/check the accepted R3 cross-cycle cap in THIS transaction; no success fallback. */
  admit(tx: FeedbackTransaction, scope: FeedbackScope, customerId: string, treatment: "survey" | "referral" | "service-recovery"): Promise<{ allowed: boolean; reason: string }>;
  referralSignal(tx: FeedbackTransaction, scope: FeedbackScope, customerId: string, eventId: string): Promise<boolean>;
  qualification(tx: FeedbackTransaction, scope: FeedbackScope, evidenceId: string): Promise<QualificationFacts | null>;
}
export function assertScope(scope: FeedbackScope): void {
  id(scope.organizationId);
  invariant(["live", "test", "preview", "demo", "development"].includes(scope.dataMode), "invalid-input");
}
export function key(deps: FeedbackDependencies, scope: FeedbackScope, ...parts: string[]): string {
  return deps.digest(JSON.stringify([scope.organizationId, scope.dataMode, ...parts]));
}
export function staff(actor: TrustedFeedbackActor, capability: OrganizationCapability): void {
  invariant(actor.uid && actor.capabilities.has(capability), "permission-denied");
}
export function customerActor(actor: TrustedFeedbackActor): string {
  invariant(actor.uid && actor.customerId, "permission-denied"); return id(actor.customerId);
}
export async function mutationPolicy(deps: FeedbackDependencies, tx: FeedbackTransaction, scope: FeedbackScope, active = false): Promise<FeedbackPolicy> {
  assertScope(scope);
  invariant(scope.dataMode !== "preview" && scope.dataMode !== "demo", "ineligible", "Preview is read-only.");
  const policy = await deps.policy(tx, scope);
  if (scope.dataMode === "live") invariant(policy.release3AcceptedSha && /^[a-f0-9]{40}$/.test(policy.release3AcceptedSha), "release-blocked", "Accepted Release 3 baseline is required.");
  if (active) { invariant(policy.enabled, "ineligible"); invariant(!policy.paused, "paused"); }
  return policy;
}
export function audit(tx: FeedbackTransaction, scope: FeedbackScope, action: string, targetId: string, actor: TrustedFeedbackActor | null, effectId: string, metadata: Record<string, string | number | boolean | null> = {}): void {
  tx.audit({ schemaVersion: 1, action, scope: { kind: "organization", organizationId: scope.organizationId },
    target: { type: "feedback", id: targetId, organizationId: scope.organizationId },
    metadata: { ...metadata, dataMode: scope.dataMode }, correlationId: effectId, idempotencyKey: effectId },
  actor ? { kind: "user", id: actor.uid } : { kind: "service", id: "nurture-feedback" });
}
export function event(tx: FeedbackTransaction, type: FeedbackEventType, effectId: string, payload: EventPayload, customerId?: string): void {
  tx.event({ id: effectId, type, payload, ...(customerId ? { customerId } : {}) });
}
export async function requireCustomer(deps: FeedbackDependencies, tx: FeedbackTransaction, scope: FeedbackScope, customerId: string): Promise<CustomerFeedbackFacts> {
  const facts = await deps.customer(tx, scope, id(customerId)); invariant(facts.exists, "ineligible"); return facts;
}
export async function admit(deps: FeedbackDependencies, tx: FeedbackTransaction, scope: FeedbackScope, customerId: string, treatment: "survey" | "referral" | "service-recovery"): Promise<void> {
  const decision = await deps.admit(tx, scope, customerId, treatment);
  if (!decision.allowed) throw new FeedbackError("ineligible", decision.reason);
}
