# Release 1 — Track D: Offers + Billing

Status: implementation branch `track-d/offers-billing`  
Requirements: NUR-05, NUR-06  
Acceptance focus: ACC-05, ACC-06 commercial-state boundary

## Ownership

Track D owns the commercial transition:

```text
Offer -> Checkout -> Stripe -> SubscriptionSnapshot -> entitlement input
```

Track D does **not** own authentication/Customer bootstrap (Track C), Experience entitlement resolution (Track B), organization membership/rules/audit infrastructure (Track E), or the analytics product/event catalog (Track F).

Stripe remains an external provider behind the Nurture billing adapter. Browser redirects, local storage, and checkout success query parameters never create paid access.

## Canonical contracts

The shared provider-neutral contract lives in:

- `shared/billing/contracts.ts`
- `shared/billing/pricing.ts`
- `shared/billing/defaults.ts`

The core types are `CommercialOffer`, `OfferPrice`, `BillingInterval`, and `SubscriptionSnapshot`. Marketing benefits are stored separately from `capabilityKeys`. Track B may use a trusted subscription plus the published Offer mapping to derive server-owned entitlements; Track D does not write those grants.

## Offer versioning

Firestore conceptually stores each organization Offer as:

```text
organizations/{organizationId}/offers/{offerId}
  draft
  published?
  updatedAt
```

Saving a draft changes only `draft`. Publishing validates provider readiness and copies the draft to `published` with an incremented version. Public and checkout queries read only `published`; therefore a new draft cannot silently alter production pricing or capabilities.

Release 1 templates are Entry, Primary, and Premium. Template prices are illustrative test configuration, not approved live charges. Paid templates intentionally contain no Stripe Price IDs until an authorized organization administrator maps Stripe **test-mode** recurring Prices.

## Pricing truthfulness

All money is stored in currency minor units. Annual presentation uses the canonical formulas:

```text
annualAtMonthlyRate = monthly * 12
annualSavings = max(0, annualAtMonthlyRate - annual)
annualSavingsPercent = annualSavings / annualAtMonthlyRate   # only when denominator > 0 and savings > 0
equivalentMonthly = round(annual / 12)
```

The actual annual charge is always labeled as billed annually. Zero-price Offers do not divide by zero, and annual prices at or above twelve monthly charges do not advertise savings.

## Checkout trust boundary

`createBillingCheckoutSession` requires Firebase Authentication and resolves exactly one organization-scoped Customer by `identityId`. It never uses the Firebase UID as the Customer ID.

Track C integration seam:

```text
organizations/{organizationId}/customers/{customerId}
  identityId: <Firebase uid/reference>
```

Track C owns creation and lifecycle of that Customer/Profile record. If there is no unique Customer match, checkout fails closed.

Checkout then:

1. loads the published Nurture Offer;
2. selects the internal `priceId` server-side;
3. validates the mapped Stripe Price is test mode, active, recurring, and matches amount/currency/interval;
4. creates/reuses an organization+Customer Stripe Customer mapping;
5. creates hosted Stripe Checkout in subscription mode;
6. uses a client-generated UUID only as the Stripe idempotency attempt key;
7. records `checkout.started`;
8. redirects to Stripe.

The return URL only returns the person to `/app/billing`. That page re-reads server-reconciled subscription state and does not trust `checkout=returned`.

## Stripe webhook reconciliation

`stripeBillingWebhook` requires the Secret Manager values `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` and verifies the raw request body against `Stripe-Signature`.

Release 1 is intentionally test-mode locked. Live secret keys, live Prices, live Checkout Sessions, live subscription events, mismatched Customer mappings, mismatched Offer metadata, and unmapped/mismatched Prices are rejected.

Handled Release 1 event families:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

For subscription events, one Firestore transaction reads the provider-event marker and current subscription, then either:

- does nothing for a duplicate event;
- records an older event as `ignored_stale` without regressing state; or
- writes the provider-neutral `SubscriptionSnapshot`, provider-event marker, and lifecycle event atomically.

This directly protects ACC-06's stale/duplicate webhook requirement.

## Commercial events

Track D emits Track F-compatible envelopes with schema version 1 and `dataMode: test`:

- `offer.viewed`
- `checkout.started`
- `checkout.completed`
- `subscription.started`
- `subscription.updated`
- `subscription.cancelled`

Provider-backed events use `source: provider_webhook`. Checkout initiation uses `domain_action`; public Offer views use `browser`.

## Organization administration and authorization

Track D uses the Track E capability vocabulary:

- `offers.view`
- `offers.manage`
- `offers.publish`
- `billing.view`
- `billing.manage`

The server authorization lookup is isolated in `functions/src/billing/store.ts`. Until Track E finalizes the durable membership persistence model, that adapter expects:

```text
organizations/{organizationId}/memberships/{firebaseUid}
  status: active
  role: owner | administrator | manager | member
```

Track E owns the final membership/rules contract. The adapter must be reconciled to Track E before Release 1 integration if that storage path changes. Direct Firestore access to Track D commercial collections should remain denied to ordinary clients; feature code uses callable Functions instead.

Administrative Offer draft/publish/default-seed mutations also write the existing organization audit shape (`actorUserId`, `action`, `targetType`, `targetId`, `occurredAt`, context).

## Trial and live-billing gates

`trialDays` is editable in Offer configuration, but Stripe trial application is disabled unless the explicit `BILLING_TRIALS_ENABLED` parameter is enabled. This preserves the NUR-06 open product gate around trial payment-method policy.

The implementation does not assume or implement merchant routing/Connect, taxes, proration, or live-mode billing. Those remain explicit product/integration gates.

## Firebase Functions

The Functions package is in `functions/`, runs on Node 22, and is registered in `firebase.json`. Required server configuration:

- `STRIPE_SECRET_KEY` — Secret Manager; must be a Stripe `sk_test_...` key for Release 1.
- `STRIPE_WEBHOOK_SECRET` — Secret Manager webhook signing secret.
- `APP_BASE_URL` — defaults to `https://nurture.accelanalysis.com` and must be HTTPS.
- `BILLING_TRIALS_ENABLED` — defaults to false.

The existing production workflow continues to deploy Hosting only. Functions are buildable/deployable from Firebase configuration, but Track D does not enable production billing or deploy provider secrets as part of this branch.

## Verification

CI now validates both packages:

```text
web:       typecheck -> build
functions: typecheck -> build/tests
```

Function tests cover:

- annual savings/equivalent-monthly math;
- zero-price behavior;
- no false savings disclosure;
- minor-unit validation;
- stale-event detection;
- subscription started/updated/cancelled event decisions.

A final integrated Release 1 acceptance test still requires the other tracks: Track C Customer bootstrap, Track E membership/rules, Track B server entitlement projection, and Track F integration of the common event store/catalog.
