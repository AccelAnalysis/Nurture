import { customerProfileRepository } from "../services/customerProfileRepository";

export interface CustomerScopeRequest {
  identityId: string;
  organizationId?: string;
}

export type CustomerScopeResult =
  | { status: "ready"; customerId: string }
  | { status: "unavailable"; reason: string };

export interface CustomerScopeSource {
  resolveCustomer(request: CustomerScopeRequest): Promise<CustomerScopeResult>;
}

/**
 * Resolve the stable Nurture Customer identifier attached to a registered
 * Firebase identity. `organizationId` is contextual scope for downstream
 * Experience/billing/entitlement records; it does not alter or authorize the
 * Customer identifier and must still be verified independently by the trusted
 * organization/capability boundary.
 *
 * The shape is intentionally compatible with Track B's ExperienceCustomerSource
 * and Track D consumes the same stored customerId from identityCustomers/{uid}.
 */
export const customerScopeSource: CustomerScopeSource = {
  async resolveCustomer(request) {
    const profile = await customerProfileRepository.get(request.identityId);
    if (!profile || profile.status !== "active") {
      return { status: "unavailable", reason: "The Nurture customer profile is not available." };
    }
    return { status: "ready", customerId: profile.customerId };
  },
};
