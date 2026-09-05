import { HttpsError } from "firebase-functions/v2/https";
import type { OrganizationCustomerRelationship, UpdateOrganizationCustomerProfileCommand } from "../../../shared/customer/contracts.js";
import { db } from "../firebase.js";
import { getCustomerAccessAuthorization } from "./access.js";
import type { VerifiedCustomerPrincipal } from "./store.js";

function customerRef(organizationId: string, customerId: string) {
  return db.collection("organizations").doc(organizationId).collection("customers").doc(customerId);
}

async function authorizeIfNeeded(
  relationship: OrganizationCustomerRelationship,
  principal: VerifiedCustomerPrincipal,
  action: "profile.read" | "profile.update",
) {
  if (relationship.identityId === principal.identityId) return;
  const allowed = await getCustomerAccessAuthorization().authorize({
    organizationId: relationship.organizationId,
    actorIdentityId: principal.identityId,
    targetCustomerId: relationship.customerId,
    action,
  });
  if (!allowed) throw new HttpsError("permission-denied", "Customer profile access is unavailable.");
}

export async function updateOrganizationCustomerProfile(
  command: UpdateOrganizationCustomerProfileCommand,
  principal: VerifiedCustomerPrincipal,
): Promise<OrganizationCustomerRelationship> {
  if (!principal.identityId) throw new HttpsError("unauthenticated", "Authentication is required.");
  const reference = customerRef(command.organizationId, command.customerId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new HttpsError("permission-denied", "Customer profile access is unavailable.");
  const current = snapshot.data() as OrganizationCustomerRelationship;
  if (current.organizationId !== command.organizationId || current.customerId !== command.customerId) {
    throw new HttpsError("permission-denied", "Customer profile access is unavailable.");
  }
  if (current.dataMode !== command.dataMode) throw new HttpsError("failed-precondition", "Customer profile belongs to a different execution mode.");
  if (current.status !== "active") throw new HttpsError("failed-precondition", "Customer relationship is not active.");
  await authorizeIfNeeded(current, principal, "profile.update");

  const next: OrganizationCustomerRelationship = {
    ...current,
    profile: {
      ...current.profile,
      ...command.changes,
      customFields: command.changes.customFields
        ? { ...current.profile.customFields, ...command.changes.customFields }
        : current.profile.customFields,
      // Authentication-owned facts are never editable through the profile command.
      email: current.profile.email,
      emailVerified: current.profile.emailVerified,
    },
    updatedAt: new Date().toISOString(),
  };
  await reference.set(next, { merge: false });
  return next;
}
