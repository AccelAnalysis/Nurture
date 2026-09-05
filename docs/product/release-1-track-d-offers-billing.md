# Release 1 — Track D: Offers + Billing

Status: implementation branch `track-d/offers-billing`  
Requirements: NUR-05, NUR-06  
Acceptance focus: ACC-05, ACC-06 commercial-state boundary

## Ownership

Track D owns the commercial transition:

```text
Offer -> Checkout -> Stripe -> trusted SubscriptionSnapshot -> entitlement input
```

Track D does **not** own authentication or organization-Customer bootstrap (Track C/E), Experience entitlement resolution (Track B), organization/platform authorization and audit contracts (Track E), public host resolution (Track A), or the analytics catalog/ingestion contract (Track F).

Stripe remains an external provider behind a Nurture adapter. Browser redirects, query parameters, local storage, Firebase sign-in, staff roles, and marketing benefit text cannot create paid access.

## Cross-track convergence review

The completed Release 1 branches were reviewed directly:

- **Track A / PR #7** owns approved host -> `publicOrganizationId` resolution and published public configuration. Track D public Offer components accept an explicit organization ID; the merged router must pass Track A's resolved value rather than add a second host resolver.
- **Track B / PR #6** owns Experience capabilities and entitlements. Track D now retains the exact immutable `offerVersion` and `offerPriceId` in every trusted subscription snapshot so entitlement projection can use the commercial version actually purchased.
- **Track C / PR #11** distinguishes the global `identityCustomers/{identityUid}` profile from the canonical organization-scoped Customer. Track D therefore requires a trusted active `organizations/{organizationId}/customers/*` binding for the verified identity and never substitutes the global profile.
- **Track E / PR #8** publishes server-consumable `shared/platform/authorization.ts`, `audit.ts`, `integrations.ts`, and `tenant-binding.ts`. Track D keeps its current Firestore lookups/writes isolated behind adapters so the integrated branch can replace them with those shared contracts without changing Offer/checkout domain code.
- **Track F / PR #9** owns the event catalog, source policy, validation, and envelope. Track D's commercial events use its event names/source conventions; after branch convergence durable writes must route through Track F validation plus Track E persistence rather than duplicate those horizontal policies.

Do not copy Track E/F source files into this isolated branch: that would create avoidable merge conflicts. The intended convergence order is to preserve Track E's shared contracts first, then replace Track D's temporary adapters in the merged integration branch.

## Canonical commercial contracts

Provider-neutral shared contracts live in:

- `shared/billing/contracts.ts`
- `shared/billing/pricing.ts`
- `shared/billing/defaults.ts`

Core types are `CommercialOffer`, `OfferPrice`, `BillingInterval`, and `SubscriptionSnapshot`. `marketingBenefits` and `capabilityKeys` are intentionally different fields.

`SubscriptionSnapshot` records:

- organization Customer scope;
- `offerId`;
- immutable `offerVersion`;
- immutable local `offerPriceId`;
- provider Customer/subscription/Price IDs;
- interval/currency/minor-unit amount;
- provider-backed status and period dates; and
- provider event/trust time.

Track B can combine that trusted snapshot with the immutable Offer version to derive server-owned entitlement state. Track D never writes entitlement grants.

## Offer draft, publication, and immutable versions

Current Offer state is stored conceptually as:

```text
organizations/{organizationId}/offers/{offerId}
  draft
  published?
  updatedAt

organizations/{organizationId}/offers/{offerId}/versions/{version}
  <immutable CommercialOffer publication>
```

Saving a draft does not change `published`. Publishing validates provider readiness and transactionally commits:

1. the new published projection;
2. the immutable version document; and
3. the organization audit event.

The transaction rechecks the draft revision to prevent a validated draft from being replaced while provider validation is in progress. Re-publishing an unchanged published state is a no-op rather than manufacturing another version.

Default seeding and draft saves likewise couple their material write and audit record transactionally.

Release 1 templates remain Entry, Primary, and Premium. Illustrative paid templates contain no Stripe Price IDs until an authorized administrator maps Stripe **test-mode** recurring Prices.

## Pricing truthfulness

Money remains integer currency minor units. Annual comparisons use:

```text
annualAtMonthlyRate = monthly * 12
annualSavings = max(0, annualAtMonthlyRate - annual)
annualSavingsPercent = annualSavings / annualAtMonthlyRate   # only when denominator > 0 and savings > 0
equivalentMonthly = round(annual / 12)
```

The actual annual charge is labeled as billed annually. Zero-price Offers do not divide by zero and annual prices at/above twelve monthly charges do not claim savings.

Display conversion uses the currency's ISO/`Intl.NumberFormat` minor-unit exponent rather than assuming every currency has two decimal places (for example JPY 0, USD 2, KWD 3).

## Identity and tenant-Customer trust boundary

`createBillingCheckoutSession`, current subscription reads, portal access, and authenticated-only Offer visibility require a trusted active organization Customer binding.

Track C's global account profile:

```text
identityCustomers/{firebaseUid}
```

is **not** sufficient commercial tenant authority.

The temporary Track D adapter in `functions/src/billing/customer-binding.ts` implements the current Firestore realization of Track E's `OrganizationCustomerBindingPort` contract:

```text
organizations/{organizationId}/customers/{customerId}
  identityId: <verified Firebase identity>
  status: active
```

Exactly one active relationship must match. Missing, inactive, mismatched, or ambiguous relationships fail closed. Track C/E own the trusted bootstrap/link operation that creates this relationship; Track D does not create it during checkout.

After Track E is integrated, replace the temporary adapter with `shared/platform/tenant-binding.ts` without changing checkout callers.

## Checkout

Checkout performs this trusted sequence:

1. verify Firebase authentication;
2. resolve exactly one active organization Customer;
3. load only the current published Nurture Offer;
4. select the internal local `priceId` server-side;
5. validate the mapped Stripe Price is test mode, active, recurring, and matches amount/currency/interval;
6. create/reuse the organization+Customer Stripe Customer mapping;
7. create hosted Stripe Checkout with metadata containing organization, Customer, Offer, immutable Offer version, and local Offer Price;
8. persist the exact checkout commercial terms;
9. persist `checkout.started` through an idempotency-key uniqueness boundary; and
10. redirect to Stripe.

The client-generated UUID is an idempotency attempt key only. It is never authority for organization, Customer, Offer, payment, or entitlement state.

The success URL only returns to `/app/billing`; the participant page always re-reads server-reconciled state.

## Stripe webhook reconciliation

`stripeBillingWebhook` uses Secret Manager `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` and raw-body `Stripe-Signature` verification. Release 1 is test-mode locked.

Handled event families:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Important reliability rules:

- provider event ID gives duplicate idempotency;
- strictly older event timestamps cannot regress state;
- because Stripe `event.created` is only second-resolution and delivery is unordered, subscription events re-read the **current Stripe subscription** before projection;
- equal-timestamp/delayed events therefore reconcile the current provider state rather than their potentially older payload state;
- identical reconciled commercial state updates the provider marker/snapshot but emits no duplicate semantic lifecycle event;
- subscription Offer resolution uses `nurtureOfferVersion` when present and otherwise falls back to immutable historical Price/version matching for subscriptions created before version metadata existed;
- replacing a Price in a later Offer publication does not prevent an existing subscription's later update/cancellation from reconciling;
- permanent signed-payload/scope/provider-mapping failures are recorded as rejected and acknowledged; and
- transient Stripe/network/Firestore/transaction failures return 5xx so Stripe retries instead of silently losing commercial state.

Provider state, provider event marker, and any resulting subscription lifecycle event are committed transactionally.

## Commercial lifecycle events

Track D uses Track F names/source conventions:

- `offer.viewed`
- `checkout.started`
- `checkout.completed`
- `subscription.started`
- `subscription.updated`
- `subscription.cancelled`

Provider-backed events use `provider_webhook`; checkout initiation uses `domain_action`; public views use `browser`.

Feature-local trusted writes are isolated in `functions/src/billing/store.ts`. After Track F/E convergence, replace that adapter with Track F validation and Track E's `EventIntegrationPort`/persistence so source validation and durable event policy have one implementation.

## Organization authorization, audit, and provider ports

Track D currently uses the same Release 1 capability names completed by Track E:

- `offers.view`
- `offers.manage`
- `offers.publish`
- `billing.view`
- `billing.manage`

The temporary server adapter is intentionally isolated. In the merged branch it must import Track E's canonical role/capability resolver from `shared/platform/authorization.ts` rather than preserve a feature-local role map.

Likewise, material Offer/billing administration must be expressed through Track E's canonical `AuditRecord`, and the Stripe implementation should be exposed through Track E's `PaymentIntegrationPort`. Track D remains owner of Stripe and commercial DTO behavior; Track E remains owner of horizontal provider/error/health conventions.

Direct browser writes to subscription, billing mapping, provider-event, entitlement, audit, and trusted lifecycle collections remain forbidden; final Firestore rules/emulator evidence are Track E's release gate.

## Trial and live-billing gates

`trialDays` is editable Offer configuration. It is applied in Checkout only when `BILLING_TRIALS_ENABLED` is enabled. `listPublishedOffers` returns the **effective** trial-policy state, and public/participant UI only advertises a trial when that server gate is on; configured-but-disabled trial duration is visible only to administrators with explanatory copy.

Merchant routing/Connect, tax, proration/refund policy, and live-mode money movement remain explicit launch gates and are not assumed by Release 1 test billing.

## Track A public integration seam

Track A owns approved host resolution through its `ConfigurationProvider.publicOrganizationId`. Track D public Offer components take an organization ID. During the router conflict/convergence pass:

```text
Track A publicOrganizationId -> Track D PublicOffersPage / PublicOfferDetail
```

must be wired directly. Unknown/ambiguous host mapping must render unavailable rather than fall back to another organization's Offers. Track D must not add a second hostname table.

## Verification

CI validates:

```text
web:       typecheck -> build
functions: typecheck -> tests
```

Track D tests cover annual pricing, zero-price/no-false-savings behavior, ISO currency exponents, stale provider-event decisions, subscription lifecycle transitions, and no duplicate lifecycle transition when two provider events reconcile to identical commercial state.

### Integrated Release 1 gate

Individual track CI is necessary but not sufficient. The final merged vertical slice must prove:

```text
Track A organization/public resolution
-> Track C verified identity/global profile
-> Track C/E trusted active organization Customer binding
-> Track D Stripe test-mode checkout/reconciliation
-> Track D immutable commercial version
-> Track B server-derived entitlement/capability
-> Track F validated lifecycle event through Track E persistence
```

while Track E's rules/emulator tests prove tenant isolation, staff/platform authorization, no client-written commercial authority, and durable canonical audit records.
