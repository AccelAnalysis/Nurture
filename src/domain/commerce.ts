import type { AuditFields, Instant } from './identity';
export interface Offer extends AuditFields {
  id: string;
  organizationId: string | null;
  name: string;
  description: string;
  type: 'free' | 'trial' | 'oneTime' | 'subscription' | 'upgrade' | 'promotional';
  status: 'draft' | 'published' | 'archived';
  visibility: 'public' | 'organization';
  amountMinor: number | null;
  currency: string;
  interval: 'month' | 'year' | null;
  trialDays: number | null;
  entitlements: string[];
  stripePriceId: string | null;
}
export interface Subscription {
  id: string;
  ownerType: 'user' | 'organization';
  ownerId: string;
  offerId: string;
  status: 'trialing' | 'active' | 'pastDue' | 'cancelled';
  currentPeriodEnd: Instant;
  cancelAtPeriodEnd: boolean;
}
export interface Referral {
  id: string;
  referralCode: string;
  referringUserId: string | null;
  referringOrganizationId: string | null;
  referredUserId: string | null;
  source: string;
  campaign: string;
  status: 'visited' | 'registered' | 'converted' | 'rejected';
  createdAt: Instant;
  convertedAt: Instant | null;
}
export interface ReferralReward {
  id: string;
  referralId: string;
  recipientType: 'user' | 'organization';
  recipientId: string;
  rewardType: 'credit' | 'seats' | 'recognition';
  rewardValue: number;
  status: 'pending' | 'approved' | 'redeemed' | 'reversed';
}
