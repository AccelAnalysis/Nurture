import { describe, expect, it } from "vitest";
import { organizationCan, organizationCapabilitiesForRole } from "./authorization";
import type { OrganizationMembership } from "../types/models";

function membership(
  role: OrganizationMembership["role"],
  status: OrganizationMembership["status"] = "active",
): OrganizationMembership {
  return {
    organizationId: "org-a",
    userId: "user-a",
    role,
    status,
  };
}

describe("organization authorization", () => {
  it("allows managers to configure release-one domains without publish or financial authority", () => {
    const capabilities = organizationCapabilitiesForRole("manager");

    expect(capabilities.has("brand.manage")).toBe(true);
    expect(capabilities.has("offers.manage")).toBe(true);
    expect(capabilities.has("experience.manage")).toBe(true);
    expect(capabilities.has("onboarding.manage")).toBe(true);
    expect(capabilities.has("brand.publish")).toBe(false);
    expect(capabilities.has("offers.publish")).toBe(false);
    expect(capabilities.has("billing.manage")).toBe(false);
    expect(capabilities.has("customers.export")).toBe(false);
    expect(capabilities.has("team.manage")).toBe(false);
  });

  it("allows administrators to perform restricted release-one administrative actions", () => {
    const capabilities = organizationCapabilitiesForRole("administrator");

    expect(capabilities.has("brand.publish")).toBe(true);
    expect(capabilities.has("offers.publish")).toBe(true);
    expect(capabilities.has("experience.publish")).toBe(true);
    expect(capabilities.has("onboarding.publish")).toBe(true);
    expect(capabilities.has("billing.manage")).toBe(true);
    expect(capabilities.has("customers.export")).toBe(true);
    expect(capabilities.has("team.manage")).toBe(true);
    expect(capabilities.has("audit.view")).toBe(true);
  });

  it("does not treat authenticated membership alone as organization administration", () => {
    expect(organizationCan(membership("member"), "workspace.view")).toBe(false);
    expect(organizationCan(membership("member"), "offers.manage")).toBe(false);
  });

  it("revokes capability access when membership is not active", () => {
    expect(organizationCan(membership("owner", "suspended"), "settings.manage")).toBe(false);
    expect(organizationCan(membership("administrator", "removed"), "billing.manage")).toBe(false);
  });
});
