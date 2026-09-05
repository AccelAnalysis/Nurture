import { describe, expect, it } from "vitest";
import {
  TRACK_A_DEMO_ORGANIZATION_ID,
  TRACK_A_SECOND_DEMO_ORGANIZATION_ID,
} from "./fixtures";
import { DemoCustomerWorkspacePort } from "./port";

describe("Release 2 Track A customer workspace adapter", () => {
  const port = new DemoCustomerWorkspacePort();

  it("never mixes customers across organization scope", async () => {
    const first = await port.listCustomers({ organizationId: TRACK_A_DEMO_ORGANIZATION_ID });
    const second = await port.listCustomers({ organizationId: TRACK_A_SECOND_DEMO_ORGANIZATION_ID });

    expect(first.items.length).toBeGreaterThan(0);
    expect(first.items.every((item) => item.organizationId === TRACK_A_DEMO_ORGANIZATION_ID)).toBe(true);
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.customerId).toBe("cust-maya-chen-org-two");

    await expect(
      port.getCustomer(TRACK_A_DEMO_ORGANIZATION_ID, "cust-maya-chen-org-two"),
    ).resolves.toBeNull();
  });

  it("searches only supported customer identity fields and filters lifecycle dimensions", async () => {
    const searched = await port.listCustomers({
      organizationId: TRACK_A_DEMO_ORGANIZATION_ID,
      query: "noah",
    });
    expect(searched.items.map((item) => item.customerId)).toEqual(["cust-noah-williams"]);

    const suppressed = await port.listCustomers({
      organizationId: TRACK_A_DEMO_ORGANIZATION_ID,
      filters: { communication: "suppressed" },
    });
    expect(suppressed.items.map((item) => item.customerId)).toEqual(["cust-noah-williams"]);

    const unknownExperience = await port.listCustomers({
      organizationId: TRACK_A_DEMO_ORGANIZATION_ID,
      filters: { experience: "unknown" },
    });
    expect(unknownExperience.items.map((item) => item.customerId).sort()).toEqual(
      ["cust-liam-rivera", "cust-noah-williams"].sort(),
    );
  });

  it("bounds pagination and keeps timeline queries deterministic and tenant-scoped", async () => {
    const page = await port.listCustomers({
      organizationId: TRACK_A_DEMO_ORGANIZATION_ID,
      limit: 999,
    });
    expect(page.pageSize).toBe(50);

    const firstTimeline = await port.queryTimeline({
      organizationId: TRACK_A_DEMO_ORGANIZATION_ID,
      customerId: "cust-maya-chen",
      limit: 2,
    });
    expect(firstTimeline.items).toHaveLength(2);
    expect(firstTimeline.nextCursor).toBe("2");
    expect(firstTimeline.items[0]!.occurredAt >= firstTimeline.items[1]!.occurredAt).toBe(true);

    const filtered = await port.queryTimeline({
      organizationId: TRACK_A_DEMO_ORGANIZATION_ID,
      customerId: "cust-maya-chen",
      category: "experience",
    });
    expect(filtered.items.every((item) => item.category === "experience")).toBe(true);

    const crossTenant = await port.queryTimeline({
      organizationId: TRACK_A_SECOND_DEMO_ORGANIZATION_ID,
      customerId: "cust-maya-chen",
    });
    expect(crossTenant.items).toHaveLength(0);
  });
});
