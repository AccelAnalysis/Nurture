# Release 1 Track B — Experience Architecture

**Requirements:** NUR-07, NUR-08, NUR-09  
**Contract:** [Experience module contract](experience-module-contract.md)  
**Status:** Track B is reconciled against the final Release 1 A/C/D/E/F contracts. Remaining work is integration/deployment acceptance, not a parallel Experience architecture.

## Purpose

Track B owns the separation:

**Nurture Shell + Experience Module + Entitlements**

An Experience stays replaceable and does not implement its own registration, checkout, organization administration, lifecycle engine, or platform security model.

## Implemented Track B surface

The browser host lives in `src/features/experience/`; provider-neutral contracts that trusted server code must consume live in `shared/experience/`.

| Area | Implementation |
| --- | --- |
| Canonical contracts | `contracts.ts` defines `Experience`, module manifests, capabilities, entitlements, host context, media/events, and the cross-track runtime ports. |
| Registry | `registry.ts` registers trusted developer-supplied modules in primary/secondary slots. No arbitrary remote script or HTML loader is introduced. |
| Participant host | `/experience/*` mounts the primary module in public/trial mode; `/app/experience/*` and `/app/secondary/*` mount authenticated primary/secondary modules inside the existing participant shell. |
| Track A configuration adapter | `configuration.ts` defines the stable `experience:<slot>:<moduleId>:<moduleVersion>` extension key, draft-extension serializer, public organization adapter, and **published-only** `ExperienceDefinitionSource` over Track A's completed opaque extension store. |
| Customer context | `ExperienceCustomerSource` is structurally compatible with Track C's `customerScopeSource`; Customer/Profile remains distinct from Firebase identity and from tenant authority. |
| Onboarding | The manifest exposes minimal `id` / `label` / `completion` requirements. Track C owns `experienceRequirementsToOnboardingExtension(...)`, `createExperienceOnboardingBridge(...)`, ordering, persistence, validation, and completion. |
| Commercial projection | `shared/experience/entitlements.ts` projects Track D's trusted published Offer + reconciled subscription state into Experience grants and exposes a protected-operation authorization helper. |
| Reference capability map | `shared/experience/reference-capabilities.ts` publishes the exact reference module capability keys plus Entry/Primary/Premium fixture mapping. |
| Presentation access | `access.ts` fails closed and checks mode, authentication, organization/Customer/Experience scope, entitlement state/expiry, and allowance. Browser access is presentation only. |
| Analytics/lifecycle | Track B emits browser-observed `experience.started`, `experience.premium_feature_requested`, and declared namespaced module events through `ExperienceEventSink`; Track F's completed bridge already consumes this transport. |
| Media | Shared image/YouTube/Vimeo/direct-video rendering preserves provenance, click-to-load, accessibility/failure behavior, and no entitlement-by-video semantics. |
| Reference modules | `Momentum Check` proves public/trial + authenticated + protected capability behavior; `Next-Step Checklist` is the different-domain portability fixture. |

## Final completed-track convergence

### Track A — Configuration + Public Shell

Track A now provides the exact missing EXP-06 storage contract:

- opaque `ConfigurationExtension` payloads;
- `saveDraftExtension` / `removeDraftExtension`;
- immutable publication snapshots;
- `getPublishedExtension` with parent configuration version metadata;
- Brand/Site resets that preserve Track B extension drafts;
- canonical `ConfigurationProvider.publicOrganizationId` for the public host.

Track B consumes that contract through `configuration.ts`. `createTrackAExperienceDefinitionSource` reads **only** `getPublishedExtension`; draft Experience settings cannot leak into `/experience` or `/app`. The immutable Track A configuration version ID becomes `Experience.configurationVersion`. Track B does not duplicate host-to-tenant resolution.

### Track C — Identity + Customer Onboarding

Track C's final contract resolves the stable Nurture `customerId` even when organization context is supplied; the organization value is context, not proof of tenant authority. Track B keeps the same distinction and sends organization + identity + customer context to the trusted entitlement boundary.

Track C also now owns the concrete conversion and completion machinery for Experience onboarding requirements. Track B therefore intentionally does **not** maintain a second onboarding-extension adapter. Module requirements remain minimal declarations; Track C namespaces them, inserts them before the final Ready step, rejects undeclared result fields, prevents module-asserted agreement acceptance, persists progress, and emits onboarding lifecycle signals.

### Track D — Offers + Billing

Track D owns Offer/pricing administration, Stripe test-mode checkout, webhook reconciliation, and `SubscriptionSnapshot`. Track B owns conversion of that trusted commercial state into Experience access.

`projectCommercialEntitlements(...)`:

1. requires a published Offer;
2. requires Offer/subscription organization and Offer IDs to agree;
3. requires a valid trusted reconciliation timestamp;
4. grants only from Release 1 granting states (`active` or `trialing`);
5. intersects Offer capability keys with the installed Experience's declared capability catalog;
6. reports unmapped capability keys rather than granting unknown strings;
7. produces organization + Customer + Experience-scoped grants.

`authorizeProjectedCapability(...)` repeats organization, Customer, Experience, capability, expiry, and quota checks for a protected server operation.

Track D's current reference defaults still contain generic placeholder keys (`experience.core`, `experience.progress`, `experience.premium`). Track B publishes `RELEASE_ONE_REFERENCE_OFFER_CAPABILITIES` so final integration can seed the reference Offers with the real Momentum Check keys without duplicating that vocabulary.

### Track E — Platform, Security + Operations

Track E's `experience.view`, `experience.manage`, and `experience.publish` are staff permissions and remain separate from participant entitlements.

Track E now also owns `OrganizationCustomerBindingPort`. Before entitlement presentation or a protected Experience operation, trusted backend composition must bind the verified identity + trusted organization to exactly one active Customer relationship. The returned `customerId` must agree with the Track D subscription and Track B entitlement snapshot. Track B's pure server helper runs **after** that trusted binding; it does not replace it.

Track E remains authoritative for Firestore rules, trusted persistence, provider ports, audit writes, and server authorization. Client `canUse` is never the security boundary.

### Track F — Analytics Instrumentation

Track F already consumes Track B's `nurture:experience-event` compatibility transport. Browser organization/identity/Customer fields remain hints until trusted ingestion binds scope. Namespaced module completion is not automatically a trusted `experience.milestone_reached`; a validated backend/domain action must establish that milestone.

## Entitlement trust rule

The allowed sequence is:

`verified identity + trusted organization binding -> Customer relationship`

`published Offer + reconciled subscription -> entitlement projection`

`Customer + organization + Experience + entitlement -> protected capability`

The following are never sufficient to grant protected access:

- checkout success/return URL;
- browser/local/session storage;
- Firebase authentication alone;
- staff role/capability;
- onboarding completion;
- browser event;
- hidden or enabled client control.

## Reference Experience

The `Momentum Check` public/trial route stores only versioned browser-session progress. A trial participant can hand off to Track C registration and resume at `/app/experience/review`. Authenticated review is not a paid grant. `/app/experience/deep-dive` is the protected fixture and contains no premium payload in the browser bundle that can be uncovered by bypassing UI gating.

The `Next-Step Checklist` proves a different module domain can register against the same host/entitlement/event boundaries without a second lifecycle engine.

## Acceptance evidence and remaining gates

| Gate | Current Track B evidence | Remaining integrated gate |
| --- | --- | --- |
| NUR-07 / EXP-04 / ACC-06 | Fail-closed client resolver, D→B commercial projector, E-compatible scope model, server protected-operation helper, contract verification script. | Compose Track E tenant binding + Track D authoritative records + Track B projector in a trusted Function and prove direct premium bypass fails. |
| NUR-08 / EXP-01–03 | Manifest, trusted registry, dynamic loading, routes/navigation, standard states, participant-shell integration. | None inside Track B for the Release 1 trusted registry; broader installation marketplace remains later scope. |
| NUR-08 / EXP-05 | Declared namespaced signals and global Experience events; Track F compatibility is confirmed. | Trusted milestone promotion remains a backend/domain validation concern. |
| NUR-08 / EXP-06 | Concrete Track A opaque draft/publish serializer + published-only reader + public organization adapter + schema validation. | Final branch composition must wire Track A's provider/store into `ExperienceRuntimeProvider`; no new contract is required. |
| NUR-08 / EXP-07 | Scoped host context, shared media, no arbitrary scripts/vendor secrets. | Track E rules/server enforcement remains required when durable module data is introduced. |
| NUR-08 / ACC-07 | Assessment + different-domain checklist use the same host contract. | Integrated event-ingestion evidence in the vertical-slice run. |
| NUR-09 / EXP-08 / ACC-01 | Usable reference Experience, exact reference capability catalog, public/trial/authenticated paths, protected capability fixture. | Final vertical-slice composition with A/C/D/E/F. |
| NUR-09 / ACC-14 | Provider-specific media adapter/fallback code is present. | **Still not claimed complete:** run the MEDIA-06 browser matrix on localhost, hosting preview, and production, including restricted YouTube/error 153, Vimeo/direct video, captions/equivalent content. |
| CI | Web/shared typecheck, cross-track Experience contract verification, production Vite build. | Integrated Firebase/Functions/E2E checks occur on the converged release branch. |

Track B is ready for integration review. The remaining gates are intentionally assigned to the combined Release 1 vertical slice and do not justify duplicating another track's implementation inside the Experience module layer.
