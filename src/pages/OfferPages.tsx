import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import type { Offer } from '../domain/commerce';
import { useAsync } from '../lib/useAsync';
import { useAction } from '../lib/useAction';
import { offerService, checkoutService } from '../services/commerceServices';
import { useAuth } from '../providers/AuthProvider';
import { DEMO_MODE } from '../config/runtime';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  SkeletonNote,
  ActionStatus,
  LoadingState,
} from '../components/ui';
import { ResourceState } from '../components/ResourceState';
export function priceLabel(offer: Offer) {
  return offer.amountMinor === null
    ? 'Pricing to be configured'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: offer.currency,
        maximumFractionDigits: 0,
      }).format(offer.amountMinor / 100);
}
export function OfferCard({ offer, base = '/offers' }: { offer: Offer; base?: string }) {
  return (
    <Card className="offer-card">
      <div className="row">
        <Badge tone={offer.type === 'free' ? 'positive' : 'neutral'}>
          {offer.type === 'oneTime' ? 'One-time' : offer.type}
        </Badge>
        {DEMO_MODE && <small>Sample offer</small>}
      </div>
      <h2 className="section">{offer.name}</h2>
      <p>{offer.description}</p>
      <div className="price">
        {offer.type === 'free' ? 'Free' : priceLabel(offer)}
        {offer.interval && <small> / {offer.interval}</small>}
      </div>
      <ul className="offer-features">
        {offer.entitlements.map((item) => (
          <li key={item}>{item.replaceAll('-', ' ')} experience access</li>
        ))}
        {offer.trialDays && <li>{offer.trialDays}-day illustrative trial</li>}
      </ul>
      <div className="actions">
        <LinkButton variant={offer.type === 'free' ? 'primary' : 'secondary'} to={`${base}/${offer.id}`}>
          Explore offer
        </LinkButton>
      </div>
    </Card>
  );
}
export function OffersPage({ customer = false }: { customer?: boolean }) {
  const result = useAsync(useCallback(() => offerService.publicList(), []));
  return (
    <>
      <PageHeader
        eyebrow={customer ? 'Stage 6 · Continue the relationship' : 'Stage 2 · Offers'}
        title={customer ? 'Your next experience' : 'Find your next beginning.'}
        description="Explore free access, trials, one-time experiences, and recurring options. Only published public offers appear here."
      />
      <SkeletonNote>
        {DEMO_MODE
          ? 'These prices are illustrative sample data, not commercial offers. No payment information is collected.'
          : 'The offer catalog is being prepared. Checkout is not connected; no live charges can be made.'}
      </SkeletonNote>
      {result.loading ? (
        <LoadingState />
      ) : result.error || !result.data?.length ? (
        <Card>
          <EmptyState
            title="Start with the public experience"
            description="Paid offers have not been made available in this skeleton. You can still explore the open experience container."
          >
            <LinkButton to="/experience">Explore without an account</LinkButton>
          </EmptyState>
        </Card>
      ) : (
        <div className="grid three">
          {result.data.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}
    </>
  );
}
export function OfferDetailPage() {
  const { offerId = '' } = useParams();
  const result = useAsync(useCallback(() => offerService.publicGet(offerId), [offerId]));
  const { user } = useAuth();
  const action = useAction();
  return (
    <>
      <PageHeader
        eyebrow="Offer details"
        title="A next step that fits."
        description="Review the experience before deciding how to continue."
      />
      <ResourceState result={result}>
        {(offer) => (
          <div className="grid two">
            <OfferCard offer={offer} />
            <Card>
              <h2>What happens next?</h2>
              <p className="muted">
                Free experiences can be explored immediately. Trial and paid entitlements will be granted by
                the trusted backend, not by this page.
              </p>
              <SkeletonNote>
                Checkout remains a server-side integration boundary. This button cannot create a charge.
              </SkeletonNote>
              <div className="actions">
                {offer.type === 'free' ? (
                  <LinkButton to="/experience">Start the public experience</LinkButton>
                ) : user && !user.isAnonymous ? (
                  <Button
                    disabled={action.working}
                    onClick={() => {
                      void action.run(() =>
                        checkoutService.createSession(offer.id, { type: 'user', id: user.uid }),
                      );
                    }}
                  >
                    Preview checkout
                  </Button>
                ) : (
                  <LinkButton to="/register?next=/app/offers">Create an account</LinkButton>
                )}
                <LinkButton variant="quiet" to="/offers">
                  All offers
                </LinkButton>
              </div>
              <ActionStatus {...action} />
            </Card>
          </div>
        )}
      </ResourceState>
    </>
  );
}
