import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useOrganization } from '../../providers/OrganizationProvider';
import { offerService, referralService } from '../../services/commerceServices';
import { organizationService } from '../../services/organizationService';
import { useAsync } from '../../lib/useAsync';
import { useAction } from '../../lib/useAction';
import type { Offer } from '../../domain/commerce';
import type { Organization } from '../../domain/identity';
import { DEMO_MODE } from '../../config/runtime';
import {
  ActionStatus,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  LinkButton,
  PageHeader,
  Select,
  SkeletonNote,
  TextArea,
} from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { ResourceState } from '../../components/ResourceState';
import { priceLabel } from '../OfferPages';
const offerTypes: [Offer['type'], string][] = [
  ['free', 'Free'],
  ['trial', 'Trial'],
  ['oneTime', 'One-time purchase'],
  ['subscription', 'Subscription'],
  ['upgrade', 'Upgrade'],
  ['promotional', 'Promotional'],
];
export function OrganizationOffersPage() {
  const { organization } = useOrganization();
  const id = organization!.id;
  const base = `/org/${id}/offers`;
  const result = useAsync(useCallback(() => offerService.list(id), [id]));
  return (
    <>
      <PageHeader
        title="Organization offers"
        description="Define the next experience, its audience, and the access it may provide. Price and entitlement fulfillment remain server-controlled."
        actions={<LinkButton to={`${base}/new`}>New offer</LinkButton>}
      />
      <ResourceState result={result}>
        {(offers) => (
          <DataTable
            caption="Organization offers"
            rows={offers}
            columns={[
              {
                key: 'name',
                label: 'Offer',
                render: (offer) => <Link to={`${base}/${offer.id}`}>{offer.name}</Link>,
              },
              {
                key: 'type',
                label: 'Type',
                render: (offer) => offerTypes.find(([type]) => offer.type === type)?.[1],
              },
              {
                key: 'price',
                label: 'Illustrative price',
                render: (offer) => `${priceLabel(offer)}${offer.interval ? ` / ${offer.interval}` : ''}`,
              },
              { key: 'status', label: 'Status', render: (offer) => <Badge>{offer.status}</Badge> },
              { key: 'visibility', label: 'Audience', render: (offer) => offer.visibility },
              {
                key: 'stripe',
                label: 'Stripe price',
                render: (offer) => (offer.stripePriceId ? 'Server-linked' : 'Not connected'),
              },
            ]}
          />
        )}
      </ResourceState>
      <SkeletonNote>
        No Stripe products, live prices, checkout sessions, or charges are created by this editor.
      </SkeletonNote>
    </>
  );
}
function blankOffer(organizationId: string): Offer {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    organizationId,
    name: 'A new experience',
    description: '',
    type: 'free',
    status: 'draft',
    visibility: 'organization',
    amountMinor: 0,
    currency: 'USD',
    interval: null,
    trialDays: null,
    entitlements: [],
    stripePriceId: null,
    createdAt: now,
    updatedAt: now,
  };
}
export function OfferEditorPage() {
  const { offerId } = useParams();
  const { organization } = useOrganization();
  const id = organization!.id;
  const result = useAsync(
    useCallback(
      () => (offerId ? offerService.get(id, offerId) : Promise.resolve(blankOffer(id))),
      [id, offerId],
    ),
  );
  return (
    <>
      <PageHeader
        title="Offer details"
        description="Model an offer without creating a live billing integration."
      />
      <ResourceState result={result}>
        {(offer) => <OfferEditor key={offer.id} initial={offer} />}
      </ResourceState>
    </>
  );
}
function OfferEditor({ initial }: { initial: Offer }) {
  const [offer, setOffer] = useState(initial);
  const [entitlements, setEntitlements] = useState(initial.entitlements.join(', '));
  const org = useOrganization();
  const action = useAction();
  const navigate = useNavigate();
  const base = `/org/${org.organization!.id}/offers`;
  return (
    <Card className="form-narrow">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action
            .run(
              async () => {
                if (!offer.name.trim() || !offer.description.trim())
                  throw new Error('Add a name and description.');
                await offerService.save(org.organization!.id, {
                  ...offer,
                  organizationId: org.organization!.id,
                  amountMinor: offer.type === 'free' ? 0 : offer.amountMinor,
                  entitlements: entitlements
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
                  updatedAt: new Date().toISOString(),
                });
              },
              DEMO_MODE
                ? 'Offer configuration saved in demo memory. No Stripe changes were made.'
                : 'Offer saved.',
            )
            .then((ok) => {
              if (ok) navigate(`${base}/${offer.id}`, { replace: true });
            });
        }}
      >
        <Input
          label="Offer name"
          value={offer.name}
          onChange={(event) => setOffer({ ...offer, name: event.target.value })}
          required
          maxLength={100}
        />
        <TextArea
          label="Description"
          value={offer.description}
          onChange={(event) => setOffer({ ...offer, description: event.target.value })}
          required
          maxLength={1500}
        />
        <div className="form-grid">
          <Select
            label="Offer type"
            value={offer.type}
            onChange={(event) => setOffer({ ...offer, type: event.target.value as Offer['type'] })}
          >
            {offerTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            label="Audience"
            value={offer.visibility}
            onChange={(event) =>
              setOffer({ ...offer, visibility: event.target.value as Offer['visibility'] })
            }
          >
            <option value="organization">Organization-specific</option>
            <option value="public">Public catalog</option>
          </Select>
        </div>
        {offer.type !== 'free' && (
          <div className="form-grid">
            <Input
              label="Illustrative amount (USD)"
              type="number"
              min={0}
              step={0.01}
              value={(offer.amountMinor ?? 0) / 100}
              onChange={(event) =>
                setOffer({ ...offer, amountMinor: Math.round(Number(event.target.value) * 100) })
              }
            />
            <Select
              label="Recurrence"
              value={offer.interval ?? ''}
              onChange={(event) =>
                setOffer({
                  ...offer,
                  interval: event.target.value ? (event.target.value as 'month' | 'year') : null,
                })
              }
            >
              <option value="">Not recurring</option>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </Select>
            <Input
              label="Trial days"
              type="number"
              min={0}
              max={365}
              value={offer.trialDays ?? 0}
              onChange={(event) => setOffer({ ...offer, trialDays: Number(event.target.value) || null })}
            />
          </div>
        )}
        <Input
          label="Entitlement identifiers"
          value={entitlements}
          onChange={(event) => setEntitlements(event.target.value)}
          maxLength={500}
          hint="Comma-separated configuration only. The browser cannot grant these entitlements."
        />
        <Select
          label="Status"
          value={offer.status}
          onChange={(event) => setOffer({ ...offer, status: event.target.value as Offer['status'] })}
        >
          <option value="draft">Draft</option>
          <option value="published">Published configuration</option>
          <option value="archived">Archived</option>
        </Select>
        <SkeletonNote>
          Publishing must later validate Stripe test-mode prices, trusted ownership, trial rules, and public
          projection fields.
        </SkeletonNote>
        <div className="actions">
          <Button type="submit" disabled={action.working}>
            Save offer configuration
          </Button>
          <LinkButton variant="quiet" to={base}>
            All offers
          </LinkButton>
        </div>
        <ActionStatus {...action} />
      </form>
    </Card>
  );
}
export function OrganizationReferralsPage() {
  const org = useOrganization();
  const id = org.organization!.id;
  const result = useAsync(useCallback(() => referralService.list(id), [id]));
  return (
    <>
      <PageHeader
        title="Referral program"
        eyebrow="Turn one connection into the next"
        description="Connect an organization or participant introduction to a verified registration or conversion."
      />
      <div className="grid two">
        <ReferralConfiguration organization={org.organization!} />
        <Card>
          <h2>From introduction to outcome</h2>
          <p className="muted">
            Referral link → public visitor → registration → verified conversion. Attribution follows the
            journey but does not imply membership.
          </p>
          {DEMO_MODE ? (
            <>
              <Input
                label="Sample organization referral link"
                value={`${window.location.origin}/r/NURTURE-DEMO`}
                readOnly
              />
              <LinkButton variant="secondary" to="/r/NURTURE-DEMO">
                Preview referral entry
              </LinkButton>
            </>
          ) : (
            <p className="notice subtle">
              A server-issued referral code will appear when the program is configured.
            </p>
          )}
          <SkeletonNote>
            The reward ledger, eligibility review, fraud checks, and reversals are modeled but not active. No
            monetary benefits are issued.
          </SkeletonNote>
        </Card>
      </div>
      <section className="section">
        <h2>Referral activity</h2>
        <ResourceState result={result}>
          {(referrals) => (
            <DataTable
              caption="Organization referrals"
              rows={referrals}
              columns={[
                { key: 'code', label: 'Code', render: (referral) => referral.referralCode },
                { key: 'source', label: 'Source', render: (referral) => referral.source },
                { key: 'campaign', label: 'Campaign', render: (referral) => referral.campaign },
                { key: 'status', label: 'Status', render: (referral) => <Badge>{referral.status}</Badge> },
                { key: 'reward', label: 'Benefit', render: () => 'Not issued' },
              ]}
            />
          )}
        </ResourceState>
      </section>
    </>
  );
}
function ReferralConfiguration({ organization }: { organization: Organization }) {
  const [config, setConfig] = useState(organization.referralConfiguration);
  const action = useAction();
  const org = useOrganization();
  return (
    <Card>
      <h2>Program configuration</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(
            async () => {
              await organizationService.save({ ...organization, referralConfiguration: config });
              org.refresh();
            },
            DEMO_MODE
              ? 'Saved in demo memory. No rewards or payouts are enabled.'
              : 'Program configuration saved.',
          );
        }}
      >
        <Checkbox
          label="Enabled program configuration (not a live program)"
          checked={config.enabled}
          onChange={(event) => setConfig({ ...config, enabled: event.target.checked })}
        />
        <Select
          label="Qualifying event"
          value={config.qualifyingEvent}
          onChange={(event) =>
            setConfig({ ...config, qualifyingEvent: event.target.value as typeof config.qualifyingEvent })
          }
        >
          <option value="registration">Verified registration</option>
          <option value="subscription">Verified subscription conversion</option>
        </Select>
        <Select
          label="Benefit type"
          value={config.rewardType}
          onChange={(event) =>
            setConfig({ ...config, rewardType: event.target.value as typeof config.rewardType })
          }
        >
          <option value="credit">Account credit (future)</option>
          <option value="seats">Additional seats (future)</option>
          <option value="recognition">Recognition (future)</option>
        </Select>
        <Input
          label="Illustrative benefit value"
          type="number"
          min={0}
          max={10000}
          value={config.rewardValue}
          onChange={(event) => setConfig({ ...config, rewardValue: Number(event.target.value) })}
        />
        <Button type="submit" disabled={action.working}>
          Save program configuration
        </Button>
        <ActionStatus {...action} />
      </form>
    </Card>
  );
}
