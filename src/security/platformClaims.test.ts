import { describe, expect, it } from "vitest";
import {
  PLATFORM_CAPABILITIES_CLAIM,
  PLATFORM_ROLE_CLAIM,
  resolvePlatformClaims,
} from "./platformClaims";

describe("platform claim resolution", () => {
  it("resolves known server-issued roles to their preset capabilities", () => {
    const resolved = resolvePlatformClaims({ [PLATFORM_ROLE_CLAIM]: "administrator" });

    expect(resolved.valid).toBe(true);
    expect(resolved.role).toBe("administrator");
    expect(resolved.capabilities).toContain("platform.view");
    expect(resolved.capabilities).toContain("access.manage");
    expect(resolved.capabilities).toContain("integrations.manage");
  });

  it("treats an account without a platform role as unprivileged rather than malformed", () => {
    const resolved = resolvePlatformClaims({});

    expect(resolved.valid).toBe(true);
    expect(resolved.role).toBeNull();
    expect(resolved.capabilities).toEqual([]);
    expect(resolved.reason).toBe("missing-role");
  });

  it("fails closed for unrecognized role values", () => {
    const resolved = resolvePlatformClaims({ [PLATFORM_ROLE_CLAIM]: "organization-owner" });

    expect(resolved.valid).toBe(false);
    expect(resolved.role).toBeNull();
    expect(resolved.capabilities).toEqual([]);
    expect(resolved.reason).toBe("invalid-role");
  });

  it("accepts custom roles only when every capability is known", () => {
    const resolved = resolvePlatformClaims({
      [PLATFORM_ROLE_CLAIM]: "custom:operations-auditor",
      [PLATFORM_CAPABILITIES_CLAIM]: ["platform.view", "operations.view", "audit.view", "audit.view"],
    });

    expect(resolved.valid).toBe(true);
    expect(resolved.role).toBe("custom:operations-auditor");
    expect(resolved.capabilities).toEqual(["platform.view", "operations.view", "audit.view"]);
  });

  it("rejects custom roles that carry an unknown capability", () => {
    const resolved = resolvePlatformClaims({
      [PLATFORM_ROLE_CLAIM]: "custom:unsafe",
      [PLATFORM_CAPABILITIES_CLAIM]: ["platform.view", "organizations.delete-all"],
    });

    expect(resolved.valid).toBe(false);
    expect(resolved.capabilities).toEqual([]);
    expect(resolved.reason).toBe("invalid-custom-capabilities");
  });
});
