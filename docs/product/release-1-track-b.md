# Release 1 Track B — Experience Architecture

**Requirements:** NUR-07, NUR-08, NUR-09  
**Contract:** [Experience module contract](experience-module-contract.md)  
**Status:** Track B implementation is converged against the completed Release 1 track contracts; deployed media and trusted-backend acceptance remain release gates.

## Purpose

Track B owns the architectural separation between Nurture and the application/Experience delivered through it:

**Nurture Shell + Experience Module + Entitlements**

The implementation keeps an Experience replaceable without teaching the module how Nurture registration, Stripe checkout, organization administration, platform administration, or lifecycle delivery works.

## Implemented Track B surface

The browser host lives in `src/features/experience/`. Provider-neutral commercial/authorization helpers that must also be usable by trusted server code live in `shared/experience/`.

| Area | Implementation |
| --- | --- |
| Canonical contracts | `contracts.ts` defines `Experience`, `ExperienceModule`, `ExperienceModuleManifest`, `ExperienceCapability`, server-derived `Entitlement`, media/event contracts, and cross-track adapters. |
| Trusted registry | `registry.ts` registers developer-supplied modules by primary/secondary slot. It is not a remote-script or arbitrary-HTML loader. |
| Organization scope | `ExperienceOrganizationSource` lets application composition supply Track A's canonical public organization ID while authenticated mode retains the selected organization scope. Track B does not duplicate hostname-to-tenant mapping. |
| Published configuration handoff | `ExperienceDefinitionSource` allows Track A to supply a published organization-scoped `Experience`; registry defaults remain the safe fallback. Configuration is checked against the module schema before rendering. |
| Customer handoff | `ExperienceCustomerSource` resolves the stable Nurture Customer/Profile identity separately from Firebase identity. Release 1 follows the completed C/D implementation: the stable Customer ID is global while organization scope remains explicit on Experience, billing, and entitlement records. |
| Entitlement projection | `shared/experience/entitlements.ts` projects a trusted Track D published Offer + reconciled Subscription snapshot into Experience grants and exposes a protected-operation authorization helper. It never reads a checkout return URL. |
| Entitlement presentation | `ExperienceEntitlementSource` accepts only a presentation snapshot marked `server-derived`. The default source is unavailable, so protected capabilities fail closed. |
| Capability resolver | `access.ts` checks declared capability, access mode, authentication, organization/customer/Experience scope, active entitlement, expiry, and allowance for presentation. |
| Host runtime | `ExperienceHost.tsx` loads the configured module, resolves its route/navigation, provides host services, and contains loading/unavailable/error/restricted states plus a module crash boundary. |
| Participant routing | `/experience/*` mounts the primary module in trial mode; `/app/experience/*` mounts it authenticated; `/app/secondary/*` mounts the secondary slot authenticated. |
| Lifecycle hook | Module browser events must be declared in the manifest and flow through `ExperienceEventSink`. Events are marked `browser-observed`; they cannot assert paid/platform authority. Track F's completed compatibility bridge consumes this hook. |
| Onboarding handoff | `createExperienceOnboardingExtension` projects manifest requirements to Track C's concrete `{ source: "experience", namespace, steps }` extension shape. `ExperienceOnboardingBridge` remains the completion boundary. |
| Diagnostics hook | `ExperienceRecoverableErrorReporter` is an injected platform/operations boundary and accepts safe context only. |
| Media | `SharedExperienceMedia` supports validated YouTube, Vimeo, and direct MP4/WebM paths plus image provenance/fallback behavior. Third-party video is click-to-load. |
| Reference capability catalog | `shared/experience/reference-capabilities.ts` publishes the exact reference module keys and the Entry/Primary/Premium fixture mapping so billing does not guess capability names. |
| Reference primary module | `nurture.reference-assessment` is a small generic assessment fixture with trial use, authenticated continuation, one protected capability, progress handoff, events, linked stock imagery, and optional YouTube fixture. |
| Portability fixture | `nurture.reference-checklist` is a second, different-domain module using the same host contract. It exists to prove portability, not to become a second Nurture product domain. |

## Completed-track convergence

Track B was reconciled against the completed A, C, D, E, and F branches before declaring its implementation ready for integration.

### Track A — Configuration + Public Shell

Track A's `ConfigurationProvider.publicOrganizationId` is the canonical public host/tenant decision. Track B now exposes `ExperienceOrganizationSource` specifically so composition can pass that value into `/experience/*`; it does not maintain a second hostname table.

Track A's current `OrganizationConfiguration` intentionally contains Brand/Site/metadata only. The remaining EXP-06 integration seam is therefore a **versioned Experience settings extension participating in Track A's draft/preview/publish transaction**, or an equivalent Track B published store advanced atomically by Track A publish. `ExperienceDefinitionSource` reads published state only and schema-validates it. It never reads a Track A draft.

### Track C — Identity + Customer Onboarding

Track C provides the stable Nurture Customer/Profile and a structurally compatible `CustomerScopeSource`. Track D's completed trusted billing implementation reads the same stable `identityCustomers/{identityUid}.customerId` and scopes billing records separately by `organizationId`. Track B follows that concrete Release 1 implementation: it resolves the stable Customer without synthesizing an organization Customer, then independently validates organization/Experience scope on the entitlement.

Track C owns onboarding reconciliation/persistence/completion. Track B's manifest can define setup steps but `createExperienceOnboardingExtension` produces Track C's namespaced extension shape and leaves all completion authority with Track C. Onboarding completion is never an entitlement.

### Track D — Offers + Billing

Track D owns `CommercialOffer`, `OfferPrice`, Stripe checkout, provider reconciliation, and `SubscriptionSnapshot`. Track B owns conversion of that trusted commercial state into Experience capability grants.

`shared/experience/entitlements.ts` consumes only structural provider-neutral fields from those Track D contracts and can run in a trusted Function/server boundary. It:

1. requires a published Offer;
2. requires Offer/subscription organization and Offer IDs to match;
3. requires a valid trusted reconciliation time;
4. grants only for a granting commercial state (`active` or `trialing` in Release 1);
5. intersects the Offer's capability keys with the installed Experience's declared capability catalog;
6. reports unknown/unmapped capability keys rather than silently granting them;
7. produces organization + Customer + Experience-scoped entitlements;
8. provides `authorizeProjectedCapability` for the protected backend operation to repeat access checks.

Track D's original reference Offer defaults used generic placeholder keys (`experience.core`, etc.). Track B now publishes `RELEASE_ONE_REFERENCE_OFFER_CAPABILITIES` with the exact Momentum Check keys; the integration branch should use those values when seeding the Track D Entry/Primary/Premium reference Offers.

### Track E — Platform, Security + Operations

Track E's `experience.view`, `experience.manage`, and `experience.publish` capability vocabulary is compatible with Track B. Those are **staff administration permissions**, not Customer entitlements.

Track E's provider/audit contracts remain the horizontal boundary for persisted Experience settings, protected server operations, lifecycle ingestion, media/storage, and diagnostics. Firestore rules and durable audit persistence remain Track E release gates; Track B does not replace them with client checks.

### Track F — Analytics Instrumentation

Track F already consumes the `nurture:experience-event` hook produced by Track B's default `ExperienceEventSink`. It preserves Experience/module context while treating organization, identity, and Customer values from the browser as hints until trusted binding.

Track B also emits the global browser-observed `experience.started` event and now emits `experience.premium_feature_requested` on an upgrade/access-options handoff. Namespaced module completion remains browser-observed; only a trusted domain/server action may promote it to `experience.milestone_reached`.

## Entitlement rule

The allowed sequence is:

`commercial state -> trusted backend state -> entitlement -> Experience capability`

The following are explicitly insufficient to grant a protected capability:

- checkout success URL;
- browser/local/session storage;
- a hidden or enabled button;
- an organization staff role;
- Firebase authentication by itself;
- onboarding completion by itself;
- a browser-observed lifecycle event.

`resolveExperienceCapability` is intentionally a presentation resolver. `authorizeProjectedCapability` is the shared server-side authorization helper, but the protected Cloud Function/server handler still owns authoritative record loading and must independently bind identity, organization, Customer, Experience, and current entitlement state before returning protected data or performing a protected mutation.

## Reference Experience behavior

The primary reference module is deliberately small and generic. The public/trial route allows the Momentum Check before registration and keeps only versioned session progress. On completion, trial users can hand off to registration with `/app/experience/review` as the intended return path. Registration ownership remains Track C.

Authenticated review is a non-paid capability declared by the module. `/app/experience/deep-dive` demonstrates a protected capability. Premium reference Offer mapping grants that exact capability only after Track D's trusted subscription state is projected through Track B's entitlement contract. The browser fixture contains no premium result that can be revealed by bypassing the button.

The secondary checklist fixture proves that another module domain can use the same registry, routing, access, state, and event infrastructure without adding a second lifecycle engine.

## Acceptance evidence and remaining integration gates

| Requirement / gate | Current evidence | Remaining gate |
| --- | --- | --- |
| NUR-07 / EXP-04 | Canonical entitlement contract, fail-closed client resolver, pure D→B commercial projector, and server authorization helper. | ACC-06 requires the trusted Function/server integration to load Track D records, project entitlements, and exercise one protected operation end to end. |
| NUR-08 / EXP-01–03 | Manifest contract, trusted registry, dynamic module loading, participant routes, module navigation, standardized states. | Organization-selected installed modules beyond the Release 1 trusted registry are later scope. |
| NUR-08 / EXP-05 | Namespaced browser events validated against manifest definitions; Track F bridge already accepts them. | Trusted milestone promotion still requires backend validation of the underlying domain action. |
| NUR-08 / EXP-06 | Typed configuration schema/defaults, Track A organization source, published-definition adapter, runtime schema validation. | The integration branch must attach Experience module settings to Track A's versioned publish operation. |
| NUR-08 / EXP-07 | Module code receives scoped host context and shared media; no vendor secrets or arbitrary runtime script/iframe HTML are accepted by the registry. | Persisted module data security rules/server handlers are required when a module begins storing durable records. |
| NUR-08 / ACC-07 | Primary assessment and different-domain secondary checklist register against the same host contract and emit namespaced signals. | Integrated lifecycle ingestion evidence after the branches are composed. |
| NUR-09 / EXP-08 / ACC-01 | Usable Momentum Check replaces the empty Experience placeholder and uses the canonical participant shell; shared reference capability keys are published for Offer mapping. | Integration must compose Track A scope/config, Track C Customer/onboarding, Track D subscription, and Track B entitlement adapters. |
| NUR-09 / ACC-14 | Provider-specific media code, exact-host URL normalization, click-to-load behavior, fallback states, and the specified YouTube sample fixture are present. | **Not yet accepted:** localhost/preview/production playback, restricted-video/error-153 behavior, Vimeo/direct fixtures, captions/transcript evidence, and the complete MEDIA-06 browser matrix must be run and recorded. |
| CI | Pull-request CI typechecks the web and shared Experience contracts and creates a production Vite build. | Browser/E2E and cross-track trusted-backend tests remain separate integration gates. |

Do not mark the integrated Release 1 journey complete solely from Track B client rendering or branch CI. The remaining items above are composition/deployment acceptance work, not reasons for the Experience module architecture to invent duplicate identity, billing, configuration, analytics, or security systems.
