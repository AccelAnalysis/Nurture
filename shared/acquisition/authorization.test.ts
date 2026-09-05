import { describe, expect, it } from "vitest";
import {
  acquisitionPauseAuditRequest,
  authorizeAcquisitionOperation,
  type AcquisitionTrustedActor,
} from "./authorization";

const orgManager: AcquisitionTrustedActor = {
  scope: "organization",
  actorId: "identity-manager",
  organizationId: "org-a",
  role: "manager",
};

const orgMember: AcquisitionTrustedActor = {
  scope: "organization",
  actorId: "identity-member",
  organizationId: "org-a",
  role: "member",
};

describe("acquisition backend authorization", () => {
  it("allows lifecycle managers only inside their verified organization scope", () => {
    expect(() => authorizeAcquisitionOperation(orgManager, { kind: "manage-organization", organizationId: "org-a" })).not.toThrow();
    expect(() => authorizeAcquisitionOperation(orgManager, { kind: "manage-automation", organizationId: "org-a", automationId: "R2-LEAD" })).not.toThrow();
    expect(() => authorizeAcquisitionOperation(orgManager, { kind: "manage-organization", organizationId: "org-b" })).toThrow(/another tenant/i);
  });

  it("denies a read-only organization member even if the client crafts a management request", () => {
    expect(() => authorizeAcquisitionOperation(orgMember, { kind: "read-organization", organizationId: "org-a" })).toThrow(/lifecycle\.view/i);
    expect(() => authorizeAcquisitionOperation(orgMember, { kind: "manage-organization", organizationId: "org-a" })).toThrow(/lifecycle\.manage/i);
  });

  it("keeps platform emergency authority separate from organization ownership", () => {
    const owner: AcquisitionTrustedActor = { ...orgManager, role: "owner" };
    expect(() => authorizeAcquisitionOperation(owner, { kind: "pause-platform" })).toThrow(/never grants/i);
  });

  it("allows platform operations managers and denies platform read-only authority", () => {
    const administrator: AcquisitionTrustedActor = { scope: "platform", actorId: "platform-admin", role: "administrator" };
    const readOnly: AcquisitionTrustedActor = { scope: "platform", actorId: "platform-reader", role: "read-only" };
    expect(() => authorizeAcquisitionOperation(administrator, { kind: "pause-platform" })).not.toThrow();
    expect(() => authorizeAcquisitionOperation(administrator, { kind: "manage-organization", organizationId: "org-a" })).not.toThrow();
    expect(() => authorizeAcquisitionOperation(readOnly, { kind: "read-organization", organizationId: "org-a" })).not.toThrow();
    expect(() => authorizeAcquisitionOperation(readOnly, { kind: "pause-platform" })).toThrow(/operations\.manage/i);
  });

  it("builds scoped, bounded audit evidence for emergency pause changes", () => {
    const request = acquisitionPauseAuditRequest({
      actor: orgManager,
      organizationId: "org-a",
      automationId: "R2-CHECKOUT",
      paused: true,
      reason: `  incident\n${"x".repeat(600)}  `,
      correlationId: "pause-correlation",
    });
    expect(request).toMatchObject({
      action: "acquisition.automation.pause_changed",
      scope: { kind: "organization", organizationId: "org-a" },
      target: { type: "acquisition-automation", id: "R2-CHECKOUT", organizationId: "org-a" },
      correlationId: "pause-correlation",
    });
    expect(request.reason?.length).toBeLessThanOrEqual(500);
    expect(request.reason).not.toMatch(/[\r\n\t]/);
  });
});
