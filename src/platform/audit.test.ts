import { describe, expect, it } from "vitest";
import { createAuditChange, sanitizeAuditValue } from "./audit";

describe("audit sanitization", () => {
  it("redacts credential, token, and payment-shaped fields at every object level", () => {
    const sanitized = sanitizeAuditValue({
      name: "Example Organization",
      apiKey: "do-not-log-me",
      nested: {
        authorization: "Bearer secret",
        password: "secret-password",
        cardNumber: "4242424242424242",
        safe: "retained",
      },
    });

    expect(sanitized).toEqual({
      name: "Example Organization",
      apiKey: "[redacted]",
      nested: {
        authorization: "[redacted]",
        password: "[redacted]",
        cardNumber: "[redacted]",
        safe: "retained",
      },
    });
  });

  it("bounds oversized strings and arrays rather than copying unlimited context", () => {
    const sanitized = sanitizeAuditValue({
      description: "x".repeat(1100),
      items: Array.from({ length: 25 }, (_, index) => index),
    }) as Record<string, unknown>;

    expect(String(sanitized.description)).toContain("[truncated]");
    expect(Array.isArray(sanitized.items)).toBe(true);
    expect((sanitized.items as unknown[]).length).toBe(21);
    expect((sanitized.items as unknown[]).at(-1)).toBe("[5 more items]");
  });

  it("sanitizes both sides of an administrative before/after change", () => {
    const change = createAuditChange(
      { price: 4900, providerSecret: "old-secret" },
      { price: 5900, providerSecret: "new-secret" },
      "offer-version-2",
    );

    expect(change).toEqual({
      before: { price: 4900, providerSecret: "[redacted]" },
      after: { price: 5900, providerSecret: "[redacted]" },
      versionRef: "offer-version-2",
    });
  });
});
