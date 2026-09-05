export type OrganizationCustomerStatus = "active" | "suspended" | "archived";

/**
 * Trusted association between a Firebase/Nurture identity and the Customer
 * relationship inside one organization. A global account/customer profile is
 * not sufficient authority for an organization-scoped Experience or checkout.
 */
export interface OrganizationCustomerBinding {
  organizationId: string;
  customerId: string;
  identityId: string;
  status: OrganizationCustomerStatus;
  verifiedAt: string;
}

export type OrganizationCustomerBindingResult =
  | { status: "ready"; binding: OrganizationCustomerBinding }
  | {
      status: "unavailable";
      reason:
        | "organization-unresolved"
        | "customer-not-linked"
        | "customer-not-active"
        | "ambiguous-customer-link"
        | "identity-mismatch";
    };

/**
 * Trusted-backend port used by billing, entitlement presentation, protected
 * Experience operations, and lifecycle ingestion. Implementations must resolve
 * the organization independently of untrusted browser hints and must return
 * exactly one active Customer relationship for the verified identity.
 */
export interface OrganizationCustomerBindingPort {
  resolve(input: {
    organizationId: string;
    identityId: string;
    correlationId: string;
  }): Promise<OrganizationCustomerBindingResult>;

  /**
   * Optional direct customer lookup used only by trusted server/provider routes
   * that already possess a canonical customer identifier but no browser identity.
   * Callers must fail closed when this capability is unavailable. Implementations
   * must resolve the Customer underneath the supplied organization and never by
   * email, global profile ID, or an untrusted tenant hint.
   */
  resolveCustomer?(input: {
    organizationId: string;
    customerId: string;
    correlationId: string;
  }): Promise<OrganizationCustomerBindingResult>;
}

export function bindingMatchesScope(
  binding: OrganizationCustomerBinding,
  organizationId: string,
  identityId: string,
): boolean {
  return binding.status === "active"
    && binding.organizationId === organizationId
    && binding.identityId === identityId;
}
