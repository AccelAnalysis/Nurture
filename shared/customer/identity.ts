/** Preserve the exact stable Release 1 Customer identifier convention. */
export function stableCustomerIdForIdentity(identityId: string): string {
  const normalized = identityId.trim();
  if (!normalized || normalized.length > 256 || normalized.includes("/")) {
    throw new Error("A valid Firebase identity ID is required.");
  }
  return `customer_${normalized}`;
}
