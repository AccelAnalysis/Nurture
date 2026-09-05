import { localDemoEnabled } from "../../app/release/readiness";
import {
  CUSTOMER_WORKSPACE_MAX_PAGE_SIZE,
  CUSTOMER_WORKSPACE_PAGE_SIZE,
  CustomerWorkspaceUnavailableError,
  defaultCustomerWorkspaceFilters,
  type CustomerDimensionFilter,
  type CustomerLifecycleSummary,
  type CustomerListPage,
  type CustomerListRequest,
  type CustomerTimelinePage,
  type CustomerTimelineRequest,
  type CustomerWorkspaceDetail,
  type CustomerWorkspaceFilters,
  type CustomerWorkspacePort,
  type LifecycleKnowledge,
} from "./contracts";
import {
  customerTimelineFixture,
  customerWorkspaceDetailsFixture,
  customerWorkspaceSummariesFixture,
} from "./fixtures";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeLimit(limit?: number) {
  const candidate = Number.isFinite(limit) ? Math.floor(limit as number) : CUSTOMER_WORKSPACE_PAGE_SIZE;
  return Math.max(1, Math.min(CUSTOMER_WORKSPACE_MAX_PAGE_SIZE, candidate));
}

function decodeCursor(cursor?: string) {
  if (!cursor) return 0;
  const value = Number.parseInt(cursor, 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function matchesFact<T extends string>(fact: LifecycleKnowledge<T>, filter: CustomerDimensionFilter<T>) {
  if (filter === "all") return true;
  if (filter === "unknown" || filter === "unavailable") return fact.status === filter;
  return fact.status === "known" && fact.value === filter;
}

function matchesFilters(customer: CustomerLifecycleSummary, filters: CustomerWorkspaceFilters) {
  return matchesFact(customer.dimensions.identity, filters.identity)
    && matchesFact(customer.dimensions.onboarding, filters.onboarding)
    && matchesFact(customer.dimensions.commercial, filters.commercial)
    && matchesFact(customer.dimensions.experience, filters.experience)
    && matchesFact(customer.dimensions.communication, filters.communication);
}

function mergeFilters(filters?: Partial<CustomerWorkspaceFilters>): CustomerWorkspaceFilters {
  return { ...defaultCustomerWorkspaceFilters, ...(filters ?? {}) };
}

export class DemoCustomerWorkspacePort implements CustomerWorkspacePort {
  constructor(
    private readonly summaries = customerWorkspaceSummariesFixture,
    private readonly details = customerWorkspaceDetailsFixture,
    private readonly timeline = customerTimelineFixture,
  ) {}

  async listCustomers(request: CustomerListRequest): Promise<CustomerListPage> {
    const limit = normalizeLimit(request.limit);
    const offset = decodeCursor(request.cursor);
    const normalizedQuery = request.query?.trim().toLocaleLowerCase() ?? "";
    const filters = mergeFilters(request.filters);

    const candidates = this.summaries
      .filter((item) => item.organizationId === request.organizationId)
      .filter((item) => {
        if (!normalizedQuery) return true;
        return [item.customerId, item.displayName, item.primaryEmail ?? ""]
          .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      })
      .filter((item) => matchesFilters(item, filters))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.customerId.localeCompare(right.customerId));

    const items = candidates.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    return {
      items: clone(items),
      pageSize: limit,
      ...(nextOffset < candidates.length ? { nextCursor: String(nextOffset) } : {}),
    };
  }

  async getCustomer(organizationId: string, customerId: string): Promise<CustomerWorkspaceDetail | null> {
    const detail = this.details.find(
      (item) => item.organizationId === organizationId && item.customerId === customerId,
    );
    return detail ? clone(detail) : null;
  }

  async queryTimeline(request: CustomerTimelineRequest): Promise<CustomerTimelinePage> {
    const limit = normalizeLimit(request.limit);
    const offset = decodeCursor(request.cursor);
    const category = request.category ?? "all";
    const candidates = this.timeline
      .filter((item) => item.organizationId === request.organizationId && item.customerId === request.customerId)
      .filter((item) => category === "all" || item.category === category)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id));

    const items = candidates.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    return {
      items: clone(items),
      pageSize: limit,
      ...(nextOffset < candidates.length ? { nextCursor: String(nextOffset) } : {}),
    };
  }
}

export class UnavailableCustomerWorkspacePort implements CustomerWorkspacePort {
  private unavailable(): never {
    throw new CustomerWorkspaceUnavailableError(
      "Authoritative customer lifecycle queries are not connected. Track A will not substitute demo contacts or browser storage.",
    );
  }

  async listCustomers(): Promise<CustomerListPage> {
    return this.unavailable();
  }

  async getCustomer(): Promise<CustomerWorkspaceDetail | null> {
    return this.unavailable();
  }

  async queryTimeline(): Promise<CustomerTimelinePage> {
    return this.unavailable();
  }
}

export const customerWorkspacePort: CustomerWorkspacePort = localDemoEnabled
  ? new DemoCustomerWorkspacePort()
  : new UnavailableCustomerWorkspacePort();
