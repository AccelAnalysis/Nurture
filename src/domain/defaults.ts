import type { AuthIdentity, UserProfile } from './identity';
/** Neutral account defaults: no organization, marketing opt-in, referral benefit, or entitlement. */
export function createUserProfile(identity: AuthIdentity, now = new Date()): UserProfile {
  return {
    uid: identity.uid,
    email: identity.email ?? '',
    displayName: identity.displayName ?? '',
    firstName: '',
    lastName: '',
    photoURL: null,
    phone: null,
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    onboardingStatus: 'notStarted',
    defaultOrganizationId: null,
    preferences: {
      theme: 'system',
      timeZone: 'UTC',
      emailMarketing: false,
      smsMarketing: false,
      inAppNotifications: true,
    },
  };
}
