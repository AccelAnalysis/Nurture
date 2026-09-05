import { where } from 'firebase/firestore';
import type { Attribution } from '../domain/identity';
import type { Offer, Referral, Subscription } from '../domain/commerce';
import { DEMO_MODE } from '../config/runtime';
import { DEMO_ORG, demoOffers, demoReferrals } from '../demo/data';
import { FeatureUnavailableError } from '../lib/errors';
import { readMany, readOne, scopedRepository, pathId } from './repository';
export const offerService = {
  ...scopedRepository<Offer>('Offers', demoOffers, (id) => `organizations/${id}/offers`, DEMO_ORG),
  async publicList(): Promise<Offer[]> {
    return DEMO_MODE
      ? (await offerService.list(DEMO_ORG)).filter(
          (offer) => offer.status === 'published' && offer.visibility === 'public',
        )
      : readMany<Offer>('publicOffers', [
          where('status', '==', 'published'),
          where('visibility', '==', 'public'),
        ]);
  },
  async publicGet(id: string): Promise<Offer | null> {
    const offer = DEMO_MODE
      ? await offerService.get(DEMO_ORG, id)
      : await readOne<Offer>(`publicOffers/${pathId(id)}`);
    return offer?.status === 'published' && offer.visibility === 'public' ? offer : null;
  },
};
export interface BillingOwner {
  type: 'user' | 'organization';
  id: string;
}
export const billingService = {
  async openPortal(_owner: BillingOwner): Promise<{ url: string }> {
    throw new FeatureUnavailableError('Stripe billing portal');
  },
};
export const checkoutService = {
  async createSession(_offerId: string, _owner: BillingOwner): Promise<{ url: string }> {
    throw new FeatureUnavailableError('Stripe test checkout');
  },
};
export const subscriptionService = {
  async list(_owner: BillingOwner): Promise<Subscription[]> {
    if (DEMO_MODE) return [];
    throw new FeatureUnavailableError('Subscription synchronization');
  },
};
export const referralService = {
  ...scopedRepository<Referral>(
    'Referrals',
    demoReferrals,
    (id) => `organizations/${id}/referrals`,
    DEMO_ORG,
  ),
  async claim(_attribution: Attribution): Promise<void> {
    throw new FeatureUnavailableError('Server-verified referral attribution');
  },
  async userReferrals(_uid: string): Promise<Referral[]> {
    if (DEMO_MODE) return structuredClone(demoReferrals);
    throw new FeatureUnavailableError('Personal referral history');
  },
};
