import { describe, expect, it } from "vitest";
import {
  assertOrganizationMutationScope,
  assertTrustDecisionMatchesArtifact,
  authorizeEcosystemAction,
  createTrustDecision,
  isInstallableTrustStatus,
  redactEcosystemAuditContext,
  type EcosystemActor,
  type ModuleReviewArtifact,
} from "./governance.js";

const artifact: ModuleReviewArtifact = {
  reviewedArtifactId: "artifact-focus-1.0.0",
  moduleId: "nurture.focus-timer",
  moduleVersion: "1.0.0",
  manifestDigest: "sha256:abc123",
  submittedBy: "developer-1",
  submittedAt: "2026-09-05T00:00:00.000Z",
  source: "repository-build",
};

const platformReviewer: EcosystemActor = {
  actorId: "platform-reviewer",
  platformCapabilities: ["platform.view", "product.manage", "operations.manage", "audit.view"],
};

describe("Release 6 module trust and isolation governance", () => {
  it("requires the organization Experience capability and exact organization scope", () => {
    const actor: EcosystemActor = {
      actorId: "org-admin",
      organizationId: "org-a",
      organizationCapabilities: ["experience.view", "experience.manage", "experience.publish"],
    };
    expect(authorizeEcosystemAction({ actor, action: "installation.install", organizationId: "org-a" }).allowed).toBe(true);
    const wrongTenant = authorizeEcosystemAction({ actor, action: "installation.install", organizationId: "org-b" });
    expect(wrongTenant.allowed).toBe(false);
    expect(wrongTenant.reason).toBe("organization-scope-mismatch");
    expect(() => assertOrganizationMutationScope("org-a", "org-b")).toThrow(/organization boundary/);
  });

  it("keeps platform module trust separate from organization administration", () => {
    const organizationOnly: EcosystemActor = {
      actorId: "org-admin",
      organizationId: "org-a",
      organizationCapabilities: ["experience.manage", "experience.publish"],
    };
    expect(authorizeEcosystemAction({ actor: organizationOnly, action: "module.trust" }).allowed).toBe(false);
    expect(authorizeEcosystemAction({ actor: platformReviewer, action: "module.trust" }).allowed).toBe(true);
  });

  it("enforces reviewed-artifact trust transitions and independent approval", () => {
    const registered = createTrustDecision({
      actor: platformReviewer,
      artifact,
      nextStatus: "registered",
      decisionId: "decision-1",
      decidedAt: "2026-09-05T00:01:00.000Z",
    });
    const underReview = createTrustDecision({
      actor: platformReviewer,
      artifact,
      currentStatus: registered.status,
      nextStatus: "under-review",
      decisionId: "decision-2",
      decidedAt: "2026-09-05T00:02:00.000Z",
    });
    const trusted = createTrustDecision({
      actor: platformReviewer,
      artifact,
      currentStatus: underReview.status,
      nextStatus: "trusted",
      decisionId: "decision-3",
      decidedAt: "2026-09-05T00:03:00.000Z",
    });
    expect(trusted.status).toBe("trusted");
    expect(isInstallableTrustStatus(trusted.status)).toBe(true);
    expect(() => createTrustDecision({
      actor: { ...platformReviewer, actorId: artifact.submittedBy },
      artifact,
      currentStatus: "under-review",
      nextStatus: "trusted",
      decisionId: "decision-self",
    })).toThrow(/cannot approve their own/);
  });

  it("makes revocation terminal and non-installable", () => {
    const revoked = createTrustDecision({
      actor: platformReviewer,
      artifact,
      currentStatus: "trusted",
      nextStatus: "revoked",
      decisionId: "decision-revoked",
    });
    expect(isInstallableTrustStatus(revoked.status)).toBe(false);
    expect(() => createTrustDecision({
      actor: platformReviewer,
      artifact,
      currentStatus: "revoked",
      nextStatus: "trusted",
      decisionId: "decision-resurrect",
    })).toThrow(/Invalid module trust transition/);
  });

  it("rejects a trust decision that is replayed against another artifact", () => {
    const decision = createTrustDecision({
      actor: platformReviewer,
      artifact,
      currentStatus: "under-review",
      nextStatus: "trusted",
      decisionId: "decision-match",
    });
    expect(() => assertTrustDecisionMatchesArtifact(decision, { ...artifact, manifestDigest: "sha256:different" })).toThrow(/does not match/);
  });

  it("redacts credentials from audit context while retaining safe operational facts", () => {
    const redacted = redactEcosystemAuditContext({
      moduleId: artifact.moduleId,
      apiKey: "secret-value",
      nested: { authorization: "Bearer x", result: "blocked" },
    }) as Record<string, unknown>;
    expect(redacted.moduleId).toBe(artifact.moduleId);
    expect(redacted.apiKey).toBe("[redacted]");
    expect((redacted.nested as Record<string, unknown>).authorization).toBe("[redacted]");
    expect((redacted.nested as Record<string, unknown>).result).toBe("blocked");
  });
});
