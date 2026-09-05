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
- `ConfigurationExtension` / `PublishedConfigurationExtension`
- default resolution / inheritance
- validation and provenance
- preview rendering
- publication history
- a replaceable `ConfigurationStore` boundary

The Release 1 default template is versioned by `NURTURE_DEFAULT_TEMPLATE_VERSION`. Organization storage contains meaningful differences from that template. Track A-owned Brand/Site resets do not clear another feature track's draft extension data.

## Versioned cross-track configuration seam

Track B's completed Experience implementation needs module settings to participate in the same organization draft/publish lifecycle without making Track A understand Experience-specific fields. Track A therefore carries an opaque JSON-safe extension map in every effective configuration/version.

Each extension has:

```text
extension key
namespace
schemaVersion
payload
```

Track A stores and versions `payload` but does not validate its domain schema. The owning track validates it before use. `ConfigurationStore` exposes:

```text
getDraftExtension
getPublishedExtension
saveDraftExtension
removeDraftExtension
```

`getPublishedExtension` also returns the parent `configurationVersionId`, numeric version, and publish time, allowing Track B to build its immutable `Experience.configurationVersion` reference from the publication that actually contains the module settings.

A feature should generate a stable extension key from its own namespace and identity dimensions. For Experience, the integration convention is conceptually:

```text
experience:<slot>:<moduleId>:<moduleVersion>
```

Track B remains responsible for mapping that payload into its `ExperienceDefinitionSource`; Track A must not import Track B module contracts to interpret it.

`saveDraft` is deliberately Track A-owned and preserves the extension map already in the record. Only the explicit extension APIs can mutate extension state. `resetDraft` resets Brand/Site/metadata only; `resetAllDraft` is the explicit destructive orchestration/testing operation.

## Routes and shell integration

Organization administration uses the existing tenant route boundary:

```text
/org/:organizationId/admin/brand-site
```

Compatibility redirects accept `/brand`, `/site`, and `/configuration` beneath the organization-admin boundary.

Track E's completed capability model is now the canonical convergence target:

- `brand.view` — enter/view Brand & Site
- `brand.manage` — edit and save drafts
- `brand.publish` — publish

Track A detects that vocabulary when Track E is composed and falls back to the earlier `settings.manage` capability while this branch remains independently buildable. The Brand & Site UI separates manage from publish rather than treating navigation visibility as authorization.

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
- Brand/Site draft reset that leaves other feature drafts and production untouched
- permission-aware read/edit/publish states aligned to Track E

Release 1 browser/demo persistence is intentionally implemented behind `ConfigurationStore`. It proves Track A behavior without bypassing Track E's horizontal security ownership.

## Cross-track convergence after B–F completion

### Track B — Experience Architecture (PR #6)

Track A now provides the versioned opaque extension seam requested by Track B. Track B should implement its `ExperienceDefinitionSource` by reading only `getPublishedExtension(...)`; it must never resolve module behavior from a Track A draft.

Track A still owns only public presentation and configuration publication. Track B owns Experience module registration, routing, capability resolution, authenticated/public Experience behavior, and entitlement-aware access.

### Track C — Identity + Customer Onboarding (PR #11)

Track C accepts a `RegistrationHandoff` query contract containing `entryPoint`, `organizationId`, `offerId`, `referralCode`, `source`, and a safe `returnTo`.

Track A now provides `buildRegistrationHandoffHref` / `resolvePublicHandoffHref`. Public Create Account links and configurable `/register` CTAs preserve the host-resolved organization candidate without importing Track C implementation. Trial-shell registration uses `entryPoint=trial` and returns toward the authenticated Experience.

The organization ID remains a browser handoff candidate, not tenant authority. Track C/E must validate/bind it before creating organization-scoped customer state.

### Track D — Offers + Billing (PR #10)

Track D's public Offer components accept an explicit `organizationId`. Track A is the single source for public hostname → organization resolution and now exposes `PublicOrganizationScope` for composition.

The integrated router must use this pattern rather than let Track D infer a tenant independently:

```tsx
<PublicShell>
  <PublicOrganizationScope>
    {(organizationId) => <BillingPublicOffersPage organizationId={organizationId} />}
  </PublicOrganizationScope>
</PublicShell>
```

The same applies to `BillingPublicOfferDetail`. Track D should construct paid-offer registration links using Track C's handoff fields (`entryPoint=offer`, `organizationId`, `offerId`, safe return path); Track A does not own checkout or subscription state.

### Track E — Platform, Security + Operations (PR #8)

Track E owns the production persistence adapter, final organization authorization, trusted audit writes, and tenant isolation. The `ConfigurationStore` interface plus the `brand.*` capability vocabulary are the integration points.

A production Track E-backed adapter must:

1. Persist records in the existing Firebase project only.
2. Scope every read/write to the organization tenant.
3. Enforce `brand.manage` for draft mutations and `brand.publish` for publication.
4. Prevent cross-tenant access by changing an ID.
5. Generate canonical audit records only after trusted mutations succeed.
6. Preserve immutable published configuration versions and opaque extension payloads.
7. Keep external service calls behind shared provider interfaces.

Track A UI must not call privileged Firestore/provider APIs directly.

### Track F — Analytics Instrumentation (PR #9)

Track F reviewed Track A's public event hook and accepts it without an event rewrite. The public shell emits `nurture:public-analytics` events using dotted names:

- `public.page_viewed`
- `public.cta_selected`
- `public.offer_handoff`
- `public.trial_entry_handoff`
- `public.identity_handoff`

The event envelope includes the available browser-side fields (`eventId`, `eventType`, `occurredAt`, organization hint, source, schema version, path, properties). Track F performs normalization/de-duplication and trusted ingestion determines authoritative organization/source. `configuration.published` must be emitted only after an authorized publish succeeds, not from a browser click.

## Integrated router convergence order

Because Tracks A–D all touch the shared router, their PRs should not be merged by accepting one router wholesale over another. The integrated router should compose the completed owners in this order:

1. **Track A public root and configured PublicShell**.
2. **Track D `/offers` and `/offers/:offerId`**, wrapped with Track A `PublicOrganizationScope`.
3. **Track B `/experience/*` public/trial host**.
4. **Track C identity routes**.
5. **Track C authenticated onboarding boundary**.
6. **Authenticated `/app/*`** with Track C `OnboardingCompleteRoute`, Track B Experience routes, Track D offers/billing routes, then remaining participant destinations.
7. **Organization administration** with Track A Brand & Site, Track D Offers, and other owner destinations behind Track E capabilities.
8. **Platform administration** behind Track E's platform scope.

This is a manual composition requirement, not a reason for any track to duplicate another track's feature code.

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
2. Change Brand/Site values and see inherited versus overridden provenance.
3. Preview the effective draft at desktop, tablet, and mobile sizes.
4. Save the draft without changing the public site or another track's extension draft.
5. Publish a version containing the effective Brand/Site state and any opaque extension drafts.
6. Visit `/` and see the active published presentation.
7. Change and save another draft and confirm `/` still shows the previous published version.
8. Publish again and see the new version become active.
9. Reset Brand/Site settings without erasing Experience or other extension drafts.
10. Preserve organization context in downstream Experience, registration, and Offer handoffs.
11. Enforce distinct Track E view/manage/publish UI states after capability composition.

Production Release 1 additionally depends on Track E's tenant-authorized persistent store/audit implementation, the trusted organization-Customer bootstrap/link called out by Tracks C/D/E, Track B's trusted entitlement backend, and the integrated A–F acceptance journey.
