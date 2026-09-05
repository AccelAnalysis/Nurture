import type { User } from "firebase/auth";
import type { UserPreferences } from "../../../types/models";
import { stableCustomerIdForIdentity } from "../../../../shared/customer/identity.js";
import type { CustomerProfile, CustomerProfileChanges } from "../model/contracts";
import { identityCollections, identityDocumentStore } from "./identityDocumentStore";

export const defaultCustomerPreferences: UserPreferences = {
  theme: "system",
  emailNotifications: true,
  smsNotifications: false,
  pushNotifications: true,
};

export function customerIdForIdentity(identityId: string) {
  return stableCustomerIdForIdentity(identityId);
}

function buildProfile(user: User): CustomerProfile {
  const now = new Date().toISOString();
  return {
    customerId: customerIdForIdentity(user.uid),
    identityId: user.uid,
    email: user.email,
    displayName: user.displayName,
    firstName: null,
    lastName: null,
    phone: user.phoneNumber,
    status: "active",
    onboardingStatus: "not-started",
    preferences: defaultCustomerPreferences,
    createdAt: user.metadata.creationTime ?? now,
    updatedAt: now,
  };
}

export const customerProfileRepository = {
  get(identityId: string) {
    return identityDocumentStore.read<CustomerProfile>(identityCollections.customers, identityId);
  },

  async getOrCreate(user: User): Promise<CustomerProfile> {
    if (user.isAnonymous) throw new Error("Anonymous identities do not receive a customer profile until registration.");
    const existing = await this.get(user.uid);
    if (existing) {
      if (existing.identityId !== user.uid) throw new Error("Customer profile identity mismatch.");
      if (existing.email !== user.email) {
        const synced = { ...existing, email: user.email, updatedAt: new Date().toISOString() };
        await identityDocumentStore.write(identityCollections.customers, user.uid, synced, false);
        return synced;
      }
      return existing;
    }
    const profile = buildProfile(user);
    await identityDocumentStore.write(identityCollections.customers, user.uid, profile, false);
    return profile;
  },

  async update(identityId: string, changes: CustomerProfileChanges): Promise<CustomerProfile> {
    const current = await this.get(identityId);
    if (!current) throw new Error("Customer profile is not available.");
    const next: CustomerProfile = {
      ...current,
      ...changes,
      customerId: current.customerId,
      identityId: current.identityId,
      preferences: changes.preferences ? { ...current.preferences, ...changes.preferences } : current.preferences,
      updatedAt: new Date().toISOString(),
    };
    await identityDocumentStore.write(identityCollections.customers, identityId, next, false);
    return next;
  },
};
