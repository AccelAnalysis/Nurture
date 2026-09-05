import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../firebase.js";

/**
 * Track D's temporary Firestore adapter for Track E's
 * OrganizationCustomerBindingPort. Replace this implementation with the shared
 * Track E port after branch convergence; checkout callers should not change.
 */
export async function resolveCustomerId(organizationId: string, identityId: string) {
  const result = await db.collection("organizations")
    .doc(organizationId)
    .collection("customers")
    .where("identityId", "==", identityId)
    .limit(10)
    .get();

  const active = result.docs.filter((item) => {
    const data = item.data();
    return data.identityId === identityId
      && data.status === "active"
      && (data.organizationId === undefined || data.organizationId === organizationId);
  });

  if (active.length !== 1) {
    const reason = active.length > 1
      ? "Multiple active organization Customers are linked to this identity; checkout is blocked until the scope is repaired."
      : result.empty
        ? "A trusted organization Customer must be linked to this identity before checkout."
        : "The organization Customer linked to this identity is not active or does not match the requested organization.";
    throw new HttpsError("failed-precondition", reason);
  }

  return active[0].id;
}
