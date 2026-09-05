import { describe, expect, it } from "vitest";
import { clearPendingLeadLink, loadPendingLeadLink, savePendingLeadLink, type PendingLeadLink } from "./leadLinkProofStore";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const link: PendingLeadLink = {
  organizationId: "org-a",
  leadId: "lead-1",
  linkProof: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
  dataMode: "test",
  capturedAt: "2026-09-05T12:00:00.000Z",
};

describe("pending lead link proof storage", () => {
  it("is scoped by organization and execution mode", () => {
    const storage = new MemoryStorage();
    savePendingLeadLink(link, storage);
    expect(loadPendingLeadLink("org-a", "test", storage)?.leadId).toBe("lead-1");
    expect(loadPendingLeadLink("org-b", "test", storage)).toBeNull();
    expect(loadPendingLeadLink("org-a", "live", storage)).toBeNull();
  });

  it("clears a linked proof without affecting another mode", () => {
    const storage = new MemoryStorage();
    savePendingLeadLink(link, storage);
    savePendingLeadLink({ ...link, dataMode: "development", leadId: "lead-dev" }, storage);
    clearPendingLeadLink("org-a", "test", storage);
    expect(loadPendingLeadLink("org-a", "test", storage)).toBeNull();
    expect(loadPendingLeadLink("org-a", "development", storage)?.leadId).toBe("lead-dev");
  });
});
