# Track A — Configuration + Public Shell

**Release:** 1  
**Requirements:** NUR-02, NUR-03, NUR-04, NUR-29, NUR-30, NUR-31  
**Owner boundary:** Configuration + Public Shell

Track A owns the path:

```text
Nurture Default → Organization Override → Published Effective Configuration
```

A draft is never the public configuration merely because it was saved. Publishing creates a versioned effective snapshot and advances the active `Publication` pointer.

## Implemented contracts

The Track A domain lives under `src/features/configuration/` and defines:

- `OrganizationConfiguration`
- `BrandConfiguration`
- `SiteConfiguration`
- `ConfigurationVersion`
- `Publication`
- `OrganizationConfigurationOverride`
- default resolution / inheritance
- validation and provenance
- preview rendering
- publication history
- a replaceable `ConfigurationStore` boundary

The Release 1 default template is versioned by `NURTURE_DEFAULT_TEMPLATE_VERSION`. Organization storage contains only meaningful differences from that template; resetting a field removes the effective override by restoring the inherited value.

## Routes and shell integration

Organization administration uses the existing tenant route boundary:

```text
/org/:organizationId/admin/brand-site
```

Compatibility redirects currently accept `/brand`, `/site`, and `/configuration` beneath the organization-admin boundary. Track A reuses the existing `settings.manage` capability rather than defining a parallel permission model.

The public root `/` renders the active published configuration. If there is no explicit organization publication yet, the safe Nurture default is used. Saving another draft does not modify the active public version.

Public organization resolution is explicit. The initial approved hosts map to the existing Release 1 organization fixture; an unknown host returns an unavailable state instead of guessing a tenant.

## Public presentation

Track A configures:

- application name and organization logo with canonical N fallback
- accent color and appearance preference
- public headline and supporting copy
- primary and secondary CTA handoffs
- public navigation
- feature/value sections
- proof copy
- contact/footer/legal destinations
- route metadata and social image
- hero image, YouTube, Vimeo, or direct video metadata
- media source, creator, rights note, poster/static fallback, and alt/player text

The canonical Nurture brand system remains the default. Organization branding is scoped to the public application; participant, organization-admin, and platform-admin chrome continue to use the Nurture platform identity so scope stays clear.

## Draft, preview, and publish

The Brand & Site workspace includes:

- inherited-vs-override provenance per configurable field
- reset-to-default actions
- draft save
- validation
- desktop/tablet/mobile preview
- publish operation
- immutable version history
- active-publication indicator
- complete-draft reset that does not alter production until the next publish

Release 1 browser/demo persistence is intentionally implemented behind `ConfigurationStore`. It exists to prove the complete Track A behavior without bypassing the horizontal security ownership described below.

## Cross-track contracts

### Track B — Experience Architecture

Track A owns only public navigation and CTA handoffs to `/experience`. It does not implement Experience module registration, capability resolution, authenticated Experience behavior, or entitlements. Track B can consume the shared organization context and published presentation without importing Track A's admin UI.

### Track C — Identity + Customer Onboarding

Track A preserves handoffs to `/sign-in`, `/register`, and other identity/onboarding routes. It does not create authentication users, profiles, leads, onboarding state, or route guards. Public navigation must not duplicate Track C's identity state machine.

### Track D — Offers + Billing

Track A may link to `/offers` and offer details but does not define Offer, Subscription, checkout, Stripe state, or entitlement grants. Commercial configuration remains Track D's responsibility.

### Track E — Platform, Security + Operations

Track E owns the production persistence adapter and trusted enforcement for Track A configuration. The `ConfigurationStore` interface is the integration point. A production adapter should:

1. Persist records in the existing Firebase project only.
2. Scope every read/write to the organization tenant.
3. Enforce `settings.manage` (or the finalized equivalent) server-side / in Firebase Security Rules.
4. Prevent an organization member from mutating another tenant by changing an ID.
5. Generate canonical audit records for draft/publish/reset mutations that meet Track E policy.
6. Preserve immutable published configuration versions.
7. Keep external service calls behind shared provider interfaces.

Track A UI must not call privileged Firestore/provider APIs directly.

### Track F — Analytics Instrumentation

The public shell emits `nurture:public-analytics` browser events with the shared event-envelope fields available at this layer:

```text
eventId
eventType
occurredAt
organizationId
source
schemaVersion
path
properties
```

Release 1 public event types are:

- `public.page_viewed`
- `public.cta_selected`
- `public.offer_handoff`
- `public.trial_entry_handoff`
- `public.identity_handoff`

Track F owns collection, persistence, analytics schemas beyond this envelope, and downstream reconstruction. Track A does not create a second analytics database.

## Media boundary

Media rendering follows the product media contract:

- image failures fall back without making the page unusable
- YouTube uses the privacy-enhanced embed host and user-controlled playback
- Vimeo uses its normal player boundary
- direct video uses browser controls
- reduced-motion presentation prefers a static poster
- source/rights metadata is retained in configuration
- video is never required to register, purchase, receive an entitlement, or complete an essential action

The Google IFrame API sample video ID documented in the product specification is treated only as a replaceable integration fixture, not as Nurture marketing media.

## Release 1 Track A acceptance

Track A is functionally complete when an authorized organization administrator can:

1. Open Brand & Site and begin from usable Nurture defaults.
2. Change brand/site values and see which values are inherited versus overridden.
3. Preview the effective draft at desktop, tablet, and mobile sizes.
4. Save the draft without changing the public site.
5. Publish a version.
6. Visit `/` and see the active published configuration.
7. Change and save another draft and confirm `/` still shows the previous published version.
8. Publish again and see the new version become active.
9. Reset individual settings or the complete draft to Nurture defaults.
10. Reach downstream Experience, identity, and offer routes only through handoff contracts owned by Tracks B–D.

Production Release 1 additionally depends on Track E's tenant-authorized persistent store/audit implementation and the integrated A–F acceptance journey.
