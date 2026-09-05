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
 * Release 1 profile resolution for an unscoped Nurture customer. An
 * organization-scoped Customer is a different trusted mapping and must not be
 * synthesized from a browser-supplied organization ID.
 *
 * The shape is intentionally compatible with Track B's ExperienceCustomerSource.
 */
export const customerScopeSource: CustomerScopeSource = {
  async resolveCustomer(request) {
    if (request.organizationId) {
      return {
        status: "unavailable",
        reason: "A trusted organization-scoped Customer mapping is required for this organization.",
      };
    }
    const profile = await customerProfileRepository.get(request.identityId);
    return profile
      ? { status: "ready", customerId: profile.customerId }
      : { status: "unavailable", reason: "The Nurture customer profile is not available." };
  },
};
