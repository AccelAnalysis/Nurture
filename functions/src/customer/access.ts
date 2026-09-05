export type CustomerAccessAction = "profile.read" | "profile.update";

export interface CustomerAccessAuthorizationRequest {
  organizationId: string;
  actorIdentityId: string;
  targetCustomerId: string;
  action: CustomerAccessAction;
}

export interface CustomerAccessAuthorizationPort {
  authorize(request: CustomerAccessAuthorizationRequest): Promise<boolean>;
}

const denyCrossCustomerAccess: CustomerAccessAuthorizationPort = {
  async authorize() {
    return false;
  },
};

let customerAccessAuthorizationPort: CustomerAccessAuthorizationPort = denyCrossCustomerAccess;

/** Release finisher composes Track E's organization-capability authorization here. */
export function configureCustomerAccessAuthorization(port: CustomerAccessAuthorizationPort) {
  customerAccessAuthorizationPort = port;
}

export function getCustomerAccessAuthorization() {
  return customerAccessAuthorizationPort;
}
