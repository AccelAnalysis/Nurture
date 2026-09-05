import { describe, expect, it } from "vitest";
import { bindingMatchesScope, type OrganizationCustomerBinding } from "./tenant-binding";

const binding: OrganizationCustomerBinding = {
  organizationId: "org-a",
  customerId: "customer-1",
  identityId: "identity-1",
  status: "active",
  verifiedAt: "2026-09-05T12:00:00.000Z",
};

describe("organization customer tenant binding", () => {
  it("accepts only the exact active organization + identity scope", () => {
    expect(bindingMatchesScope(binding, "org-a", "identity-1")).toBe(true);
    expect(bindingMatchesScope(binding, "org-b", "identity-1")).toBe(false);
    expect(bindingMatchesScope(binding, "org-a", "identity-2")).toBe(false);
  });

  it("fails closed when the binding is not active", () => {
    expect(bindingMatchesScope({ ...binding, status: "suspended" }, "org-a", "identity-1")).toBe(false);
    expect(bindingMatchesScope({ ...binding, status: "archived" }, "org-a", "identity-1")).toBe(false);
  });
});
