import type { FeedbackScope, FeedbackConfiguration, PublishedFeedbackVersion, SurveyDraft, ReferralProgramDraft } from "../../../shared/feedback/contracts.js";
import { id, integer, invariant, validateSurvey, validateProgram } from "../../../shared/feedback/validation.js";
import { FEEDBACK_DEFAULT_VERSION } from "../../../shared/feedback/defaults.js";
import { audit, key, mutationPolicy, staff, type FeedbackDependencies, type TrustedFeedbackActor } from "./ports.js";

type Kind = "survey" | "program";
type Draft = SurveyDraft | ReferralProgramDraft;
const names = { survey: { config: "surveyConfigurations", versions: "surveyVersions", manage: "surveys.manage", view: "surveys.view" }, program: { config: "programConfigurations", versions: "programVersions", manage: "referrals.manage", view: "referrals.view" } } as const;
export class FeedbackConfigurationService {
  constructor(private readonly deps: FeedbackDependencies) {}
  async save(scope: FeedbackScope, actor: TrustedFeedbackActor, kind: Kind, entityId: string, expectedRevision: number, rawDraft: unknown, defaultVersion: string | null = null): Promise<FeedbackConfiguration<Draft>> {
    invariant(kind === "survey" || kind === "program", "invalid-input"); id(entityId); integer(expectedRevision, 0, 1_000_000);
    staff(actor, names[kind].manage);
    invariant(defaultVersion === null || defaultVersion === FEEDBACK_DEFAULT_VERSION, "invalid-input");
    const draft = kind === "survey" ? validateSurvey(rawDraft) : validateProgram(rawDraft);
    return this.deps.store.transaction(scope, async tx => {
      await mutationPolicy(this.deps, tx, scope);
      const old = await tx.get<FeedbackConfiguration<Draft>>(names[kind].config, entityId);
      invariant((old?.revision ?? 0) === expectedRevision, "conflict", "The draft changed. Reload before saving.");
      const value = { id: entityId, revision: expectedRevision + 1, draft, publishedVersionId: old?.publishedVersionId ?? null,
        archived: old?.archived ?? false, defaultVersion: old?.defaultVersion ?? defaultVersion, updatedAt: this.deps.now() };
      tx.put(names[kind].config, entityId, value);
      audit(tx, scope, `feedback.${kind}.draft_saved`, entityId, actor, key(this.deps, scope, kind, entityId, String(value.revision), "draft"));
      return value;
    });
  }
  async publish(scope: FeedbackScope, actor: TrustedFeedbackActor, kind: Kind, entityId: string, expectedRevision: number): Promise<PublishedFeedbackVersion<Draft>> {
    invariant(kind === "survey" || kind === "program", "invalid-input"); id(entityId); integer(expectedRevision, 1, 1_000_000); staff(actor, names[kind].manage);
    const version = await this.deps.store.transaction(scope, async tx => {
      const policy = await mutationPolicy(this.deps, tx, scope);
      const config = await tx.get<FeedbackConfiguration<Draft>>(names[kind].config, entityId);
      invariant(config && config.revision === expectedRevision && !config.archived, "conflict");
      if (kind === "survey" && (config.draft as SurveyDraft).privacy === "anonymous") invariant(policy.anonymousPolicyId, "policy-required", "Anonymous feedback requires an approved privacy policy.");
      // The only implemented incentive adapter is test-credit. Publishing it never approves live liability.
      if (kind === "program" && scope.dataMode === "live") invariant((config.draft as ReferralProgramDraft).benefits.length === 0, "policy-required", "Live incentive fulfillment is not approved.");
      const versionId = key(this.deps, scope, kind, entityId, String(expectedRevision));
      const existing = await tx.get<PublishedFeedbackVersion<Draft>>(names[kind].versions, versionId);
      if (existing) return existing;
      const published = { id: versionId, entityId, revision: config.revision, value: structuredClone(config.draft), publishedAt: this.deps.now() };
      tx.create(names[kind].versions, versionId, published); tx.put(names[kind].config, entityId, { ...config, publishedVersionId: versionId });
      audit(tx, scope, `feedback.${kind}.published`, entityId, actor, key(this.deps, scope, versionId, "publish"), { versionId });
      return published;
    });
    // Synchronization creates/refreshes a disabled Release 3 draft only. It does
    // not activate customer treatment and is safe to retry after a partial UI failure.
    await this.deps.syncAutomation(scope, kind, entityId, version.id, version.value, actor.uid);
    return version;
  }
  async archive(scope: FeedbackScope, actor: TrustedFeedbackActor, kind: Kind, entityId: string, expectedRevision: number): Promise<void> {
    invariant(kind === "survey" || kind === "program", "invalid-input"); id(entityId); integer(expectedRevision, 1, 1_000_000); staff(actor, names[kind].manage);
    await this.deps.store.transaction(scope, async tx => {
      await mutationPolicy(this.deps, tx, scope);
      const config = await tx.get<FeedbackConfiguration<Draft>>(names[kind].config, entityId);
      invariant(config && config.revision === expectedRevision, "conflict");
      tx.put(names[kind].config, entityId, { ...config, revision: config.revision + 1, archived: true, updatedAt: this.deps.now() });
      audit(tx, scope, `feedback.${kind}.archived`, entityId, actor, key(this.deps, scope, kind, entityId, String(config.revision + 1), "archive"));
    });
  }
  async list(scope: FeedbackScope, actor: TrustedFeedbackActor, kind: Kind, after?: string) {
    invariant(kind === "survey" || kind === "program", "invalid-input"); staff(actor, names[kind].view);
    return this.deps.store.page<FeedbackConfiguration<Draft>>(scope, names[kind].config, { limit: 50, after });
  }
  async history(scope: FeedbackScope, actor: TrustedFeedbackActor, kind: Kind, entityId: string, after?: string) {
    invariant(kind === "survey" || kind === "program", "invalid-input"); id(entityId); staff(actor, names[kind].view);
    return this.deps.store.page<PublishedFeedbackVersion<Draft>>(scope, names[kind].versions, { equal: ["entityId", entityId], limit: 50, after });
  }
}
