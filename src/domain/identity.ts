export type Role = 'owner' | 'administrator' | 'manager' | 'member';
/** UTC ISO strings in the UI. Repository boundaries decode Firestore Timestamps. */
export type Instant = string;
export interface AuditFields {
  createdAt: Instant;
  updatedAt: Instant;
}
export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  timeZone: string;
  emailMarketing: boolean;
  smsMarketing: boolean;
  inAppNotifications: boolean;
}
export interface Attribution {
  referralCode: string;
  source: string;
  campaign: string;
  capturedAt: Instant;
  expiresAt: Instant;
  verification: 'pending' | 'verified';
}
export interface UserProfile extends AuditFields {
  uid: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  photoURL: string | null;
  phone: string | null;
  status: 'active' | 'suspended' | 'deletionRequested';
  onboardingStatus: 'notStarted' | 'inProgress' | 'complete';
  defaultOrganizationId: string | null;
  preferences: Preferences;
  referralCode?: string;
  referredBy?: Attribution;
  lastActiveAt?: Instant;
}
export interface AuthIdentity {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
}
export interface Organization extends AuditFields {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  description: string;
  website: string;
  status: 'active' | 'suspended' | 'archived';
  ownerId: string;
  settings: { timeZone: string; quietHoursStart: string; quietHoursEnd: string; dailyContactLimit: number };
  referralConfiguration: {
    enabled: boolean;
    qualifyingEvent: 'registration' | 'subscription';
    rewardType: 'credit' | 'seats' | 'recognition';
    rewardValue: number;
  };
}
export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  displayName: string;
  role: Role;
  status: 'active' | 'invited' | 'suspended';
  invitedBy: string | null;
  invitedAt: Instant | null;
  joinedAt: Instant | null;
}
export interface OrganizationInvitation extends AuditFields {
  id: string;
  organizationId: string;
  email: string;
  role: Exclude<Role, 'owner'>;
  invitedBy: string;
  expiresAt: Instant;
  status: 'draft' | 'pending' | 'accepted' | 'expired' | 'revoked';
  acceptedBy?: string;
  acceptedAt?: Instant;
  /** Never expose the token hash through a public Firestore document. */
  tokenHash?: string;
}
