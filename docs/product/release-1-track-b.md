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
| Participant host | `/experience/*` defaults to **public** access; `/app/experience/*` and `/app/secondary/*` mount authenticated modules. `trial` remains a distinct supported access mode that must be established explicitly rather than inferred from visiting the public route. |
| Track A configuration adapter | `configuration.ts` defines the stable `experience:<slot>:<moduleId>:<moduleVersion>` extension key, draft-extension serializer, public organization adapter, and **published-only** `ExperienceDefinitionSource` over Track A's completed opaque extension store. |
| Customer context | `ExperienceCustomerSource` is structurally compatible with Track C's `customerScopeSource`; Customer/Profile remains distinct from Firebase identity and from tenant authority. |
| Registration continuity | Public/Experience registration handoff uses Track C's supported `returnTo`, `entryPoint`, `organizationId`, and `source` query contract; the module does not invent a second handoff store. |
| Onboarding | The manifest exposes minimal `id` / `label` / `completion` requirements. Track C owns `experienceRequirementsToOnboardingExtension(...)`, `createExperienceOnboardingBridge(...)`, ordering, persistence, validation, and completion. |
| Commercial projection | `shared/experience/entitlements.ts` projects Track D's trusted published Offer + reconciled subscription state into Experience grants and exposes a protected-operation authorization helper. A trialing commercial state must have a valid trusted trial/period end or projection fails closed. |
| Reference capability map | `shared/experience/reference-capabilities.ts` publishes the exact reference module capability keys plus Entry/Primary/Premium fixture mapping. |
| Presentation access | `access.ts` fails closed and checks mode, authentication, organization/Customer/Experience scope, entitlement state/expiry, and allowance. Browser access is presentation only. |
| Analytics/lifecycle | Track B emits browser-observed `experience.started`, `experience.premium_feature_requested`, and declared namespaced module events through `ExperienceEventSink`; Track F's completed bridge already consumes this transport. |
| Error isolation | Module render errors are contained and the boundary resets when the Experience/module route changes, so one broken destination cannot poison later module navigation. |
| Media | Shared image/YouTube/Vimeo/direct-video rendering preserves provenance and click-to-load. YouTube uses the IFrame Player API's readiness/error events plus a timeout/help fallback; iframe document `load` is not treated as proof of playable media. |
| Reference modules | `Momentum Check` proves public + authenticated + protected capability behavior; `Next-Step Checklist` is the different-domain portability fixture. |

## Final completed-track convergence

### Track A — Configuration + Public Shell

Track A provides the EXP-06 storage contract: opaque `ConfigurationExtension` payloads, draft extension writes/removal, immutable publication snapshots, `getPublishedExtension`, Brand/Site resets that preserve Track B extension drafts, and canonical `ConfigurationProvider.publicOrganizationId`.

Track B consumes that contract through `configuration.ts`. `createTrackAExperienceDefinitionSource` reads **only** `getPublishedExtension`; draft Experience settings cannot leak into `/experience` or `/app`. The immutable Track A configuration version ID becomes `Experience.configurationVersion`. Track B does not duplicate host-to-tenant resolution.

### Track C — Identity + Customer Onboarding

Track C's final contract resolves the stable Nurture `customerId` even when organization context is supplied; the organization value is context, not proof of tenant authority. Track B keeps the same distinction and sends organization + identity + customer context to the trusted entitlement boundary.

Track C also owns Experience onboarding adaptation and completion. Track B intentionally does **not** maintain another onboarding-extension adapter. Module requirements remain minimal declarations; Track C namespaces them, inserts them before Ready, rejects undeclared result fields, prevents module-asserted agreement acceptance, persists progress, and emits onboarding lifecycle signals.

Registration continuity also follows Track C's actual route contract: the host sends a validated `returnTo` plus safe `entryPoint`, organization, and Experience source context through `/register?...`; it does not rely on an unread browser-storage key.

### Track D — Offers + Billing

Track D owns Offer/pricing administration, Stripe test-mode checkout, webhook reconciliation, and `SubscriptionSnapshot`. Track B owns conversion of that trusted commercial state into Experience access.

`projectCommercialEntitlements(...)` requires a published Offer, matching Offer/subscription organization and Offer IDs, a valid reconciliation timestamp, and a granting commercial state. A `trialing` subscription additionally requires a valid trusted `trialEnd` or `currentPeriodEnd`; missing/invalid expiration returns `trial-expiration-unavailable` rather than an unbounded grant. Capability keys are intersected with the installed Experience catalog, and unknown keys are reported rather than silently granted.

`authorizeProjectedCapability(...)` repeats organization, Customer, Experience, capability, expiry, and quota checks for a protected server operation.

Track D's current reference defaults still contain generic placeholder keys. Track B publishes `RELEASE_ONE_REFERENCE_OFFER_CAPABILITIES` so final integration can seed the reference Offers with the real Momentum Check keys without duplicating that vocabulary.

### Track E — Platform, Security + Operations

Track E's `experience.view`, `experience.manage`, and `experience.publish` are staff permissions and remain separate from participant entitlements.

Track E owns `OrganizationCustomerBindingPort`. Before entitlement presentation or a protected Experience operation, trusted backend composition must bind verified identity + trusted organization to exactly one active Customer relationship. The returned `customerId` must agree with the Track D subscription and Track B entitlement snapshot. Track B's pure server helper runs **after** that trusted binding; it does not replace it.

Track E remains authoritative for Firestore rules, trusted persistence, provider ports, audit writes, and server authorization. Client `canUse` is never the security boundary.

### Track F — Analytics Instrumentation

Track F already consumes Track B's `nurture:experience-event` compatibility transport. Browser organization/identity/Customer fields remain hints until trusted ingestion binds scope. Namespaced module completion is not automatically a trusted `experience.milestone_reached`; a validated backend/domain action must establish that milestone.

## Access and entitlement trust rules

The public `/experience` route is **public**, not a synonym for trial. A future trial entry must come from explicit trusted lifecycle/commercial state and then invoke the host with `accessMode="trial"`; page navigation alone cannot manufacture trial capability access.

The protected-access sequence is:

`verified identity + trusted organization binding -> Customer relationship`

`published Offer + reconciled subscription -> entitlement projection`

`Customer + organization + Experience + entitlement -> protected capability`

The following are never sufficient to grant protected access: checkout return URL, browser storage, Firebase authentication alone, staff permissions, onboarding completion, browser events, or hidden/enabled client controls.

## Reference Experience

The `Momentum Check` public route stores only versioned browser-session progress. A public participant can hand off to Track C registration with `/app/experience/review` encoded as the validated `returnTo`; Track C then owns verification/onboarding and the eventual continuation. Authenticated review is not a paid grant. `/app/experience/deep-dive` is the protected fixture and contains no premium payload in the browser bundle that can be uncovered by bypassing UI gating.

The `Next-Step Checklist` proves a different module domain can register against the same host/entitlement/event boundaries without a second lifecycle engine.

## Acceptance evidence and remaining gates

| Gate | Current Track B evidence | Remaining integrated gate |
| --- | --- | --- |
| NUR-07 / EXP-04 / ACC-06 | Fail-closed client resolver, D→B projector, bounded trials, E-compatible scope model, protected-operation helper, contract tests. | Compose Track E tenant binding + Track D authoritative records + Track B projector in a trusted Function and prove direct premium bypass fails. |
| NUR-08 / EXP-01–03 | Manifest, trusted registry, dynamic loading, public/authenticated route separation, navigation, standard states, resettable crash containment, participant-shell integration. | A trusted trial-mode entry mechanism is only required when Release 1 enables an actual trial policy; anonymous public navigation does not imply one. |
| NUR-08 / EXP-05 | Declared namespaced signals and global Experience events; Track F compatibility is confirmed. | Trusted milestone promotion remains a backend/domain validation concern. |
| NUR-08 / EXP-06 | Concrete Track A opaque draft/publish serializer + published-only reader + public organization adapter + schema validation. | Final branch composition must wire Track A's provider/store into `ExperienceRuntimeProvider`; no new contract is required. |
| NUR-08 / EXP-07 | Scoped host context, shared media, no arbitrary scripts/vendor secrets. | Track E rules/server enforcement remains required when durable module data is introduced. |
| NUR-08 / ACC-07 | Assessment + different-domain checklist use the same host contract. | Integrated event-ingestion evidence in the vertical-slice run. |
| NUR-09 / EXP-08 / ACC-01 | Usable reference Experience, exact reference capability catalog, public/authenticated paths, protected capability fixture, Track C return-path continuity. | Final vertical-slice composition with A/C/D/E/F. |
| NUR-09 / ACC-14 | Provider-specific media adapter/fallback code now distinguishes YouTube API readiness/error from iframe loading. | **Still not claimed complete:** run the MEDIA-06 browser matrix on localhost, Hosting preview, and production, including restricted YouTube/error 153, Vimeo/direct video, captions/equivalent content. |
| CI | Web/shared typecheck, cross-track Experience contract verification, production Vite build. | Integrated Firebase/Functions/E2E checks occur on the converged release branch. |

Track B is ready for integration review after its review findings are resolved and the latest CI is green. Remaining gates belong to the combined Release 1 vertical slice and do not justify duplicating another track's implementation inside the Experience layer.
