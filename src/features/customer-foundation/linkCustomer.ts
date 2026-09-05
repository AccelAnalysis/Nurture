import type { AuthoritativeCustomerDataMode, EnsureOrganizationCustomerResult } from "../../../shared/customer/contracts.js";
import { customerFoundationClient, createCommandId } from "./client";
import { clearPendingLeadLink, loadPendingLeadLink } from "./leadLinkProofStore";

export async function ensureScopedCustomer(input: {
  organizationId: string;
  dataMode: AuthoritativeCustomerDataMode;
}): Promise<EnsureOrganizationCustomerResult> {
  const pending = loadPendingLeadLink(input.organizationId, input.dataMode);
  const result = await customerFoundationClient.ensureOrganizationCustomer({
    organizationId: input.organizationId,
    dataMode: input.dataMode,
    idempotencyKey: createCommandId("customer-bootstrap"),
    ...(pending ? { lead: { organizationId: pending.organizationId, leadId: pending.leadId, linkProof: pending.linkProof } } : {}),
  });
  if (pending && result.leadLinked) clearPendingLeadLink(input.organizationId, input.dataMode);
  return result;
}
