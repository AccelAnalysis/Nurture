import { httpsCallable, type Functions } from "firebase/functions";
import type {
  CustomerListPage,
  CustomerListRequest,
  CustomerTimelineEntry,
  CustomerTimelinePage,
  CustomerTimelineRequest,
  CustomerWorkspaceDetail,
  CustomerWorkspacePort,
} from "./contracts";

type RemoteTimelineCategory = "identity" | "onboarding" | "commerce" | "experience" | "communication" | "automation" | "configuration" | "public" | "other";
interface RemoteTimelineEntry {
  id: string;
  organizationId: string;
  customerId: string;
  category: RemoteTimelineCategory;
  label: string;
  occurredAt: string;
  source: string;
  details?: Record<string, unknown>;
  automation?: { status?: string; reasonCode?: string; nextScheduledAt?: string };
  communication?: { status?: string; reasonCode?: string };
}
interface RemoteTimelinePage { items: RemoteTimelineEntry[]; nextCursor?: string }

function timelineCategory(category: RemoteTimelineCategory): CustomerTimelineEntry["category"] {
  if (category === "commerce") return "commercial";
  if (category === "identity" || category === "onboarding" || category === "experience" || category === "communication" || category === "automation") return category;
  return "automation";
}
function timelineDetail(entry: RemoteTimelineEntry) {
  const values = Object.entries(entry.details ?? {})
    .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return values.join(" · ") || entry.automation?.reasonCode || entry.communication?.reasonCode || "Lifecycle event recorded.";
}
function linkedStatus(entry: RemoteTimelineEntry): CustomerTimelineEntry["linkedStatus"] | undefined {
  const value = entry.automation?.status ?? entry.communication?.status;
  if (!value) return undefined;
  if (value === "provider-accepted" || value === "completed" || value === "accepted" || value === "delivered") return "succeeded";
  if (value === "unknown-outcome" || value === "unknown") return "unknown";
  if (value === "leased" || value === "retrying" || value === "planned") return "scheduled";
  if (value === "scheduled" || value === "held" || value === "suppressed" || value === "cancelled" || value === "failed") return value;
  return undefined;
}

export class FirebaseCustomerWorkspacePort implements CustomerWorkspacePort {
  constructor(private readonly functions: Functions) {}

  async listCustomers(request: CustomerListRequest): Promise<CustomerListPage> {
    const callable = httpsCallable<CustomerListRequest, CustomerListPage>(this.functions, "listCustomerWorkspace");
    return (await callable(request)).data;
  }

  async getCustomer(organizationId: string, customerId: string): Promise<CustomerWorkspaceDetail | null> {
    const callable = httpsCallable<{ organizationId: string; customerId: string }, CustomerWorkspaceDetail | null>(this.functions, "getCustomerWorkspaceDetail");
    return (await callable({ organizationId, customerId })).data;
  }

  async queryTimeline(request: CustomerTimelineRequest): Promise<CustomerTimelinePage> {
    const categories = request.category && request.category !== "all"
      ? [request.category === "commercial" ? "commerce" : request.category]
      : undefined;
    const callable = httpsCallable<{
      organizationId: string;
      customerId: string;
      limit?: number;
      cursor?: string;
      categories?: string[];
    }, RemoteTimelinePage>(this.functions, "getLifecycleCustomerTimeline");
    const result = (await callable({
      organizationId: request.organizationId,
      customerId: request.customerId,
      limit: request.limit,
      cursor: request.cursor,
      categories,
    })).data;
    return {
      items: result.items.map((entry) => ({
        id: entry.id,
        organizationId: entry.organizationId,
        customerId: entry.customerId,
        category: timelineCategory(entry.category),
        label: entry.label,
        detail: timelineDetail(entry),
        occurredAt: entry.occurredAt,
        source: entry.source,
        ...(linkedStatus(entry) ? { linkedStatus: linkedStatus(entry) } : {}),
      })),
      pageSize: request.limit ?? 25,
      ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
    };
  }
}
