import { HttpsError } from "firebase-functions/v2/https";
import type { OrganizationCustomerBindingPort } from "../../../shared/platform/tenant-binding.js";
import { db } from "../firebase.js";

/** Existing Firestore adapter implements E's canonical port. Never links by email or global profile ID. */
export const organizationCustomerBinding: OrganizationCustomerBindingPort = {
  async resolve({ organizationId, identityId }) {
    const organization = db.collection("organizations").doc(organizationId);
    const parent = await organization.get();
    if (!parent.exists || parent.data()?.status !== "active") return { status: "unavailable", reason: "organization-unresolved" };
    const result = await organization.collection("customers")
      .where("identityId", "==", identityId).where("status", "==", "active").limit(2).get();
    if (result.size > 1) return { status: "unavailable", reason: "ambiguous-customer-link" };
    if (result.empty) return { status: "unavailable", reason: "customer-not-linked" };
    const customer = result.docs[0];
    const data = customer.data();
    if (data.identityId !== identityId || (data.organizationId !== undefined && data.organizationId !== organizationId)) return { status: "unavailable", reason: "identity-mismatch" };
    return { status: "ready", binding: { organizationId, customerId: customer.id, identityId, status: "active", verifiedAt: new Date().toISOString() } };
  },
};
export async function resolveCustomerId(organizationId: string, identityId: string) {
  const result = await organizationCustomerBinding.resolve({ organizationId, identityId, correlationId: "customer-resolution" });
  if (result.status !== "ready") throw new HttpsError("failed-precondition", `An active, unambiguous organization Customer is required (${result.reason}).`);
  return result.binding.customerId;
}
