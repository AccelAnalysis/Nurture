# Release 1 Track B — Experience Architecture

**Requirements:** NUR-07, NUR-08, NUR-09  
**Contract:** [Experience module contract](experience-module-contract.md)  
**Status:** Track B host/module implementation present; cross-track trusted backends and deployed media acceptance remain integration gates.

## Purpose

Track B owns the architectural separation between Nurture and the application/Experience delivered through it:

**Nurture Shell + Experience Module + Entitlements**

The implementation must keep an Experience replaceable without teaching the module how Nurture registration, Stripe checkout, organization administration, platform administration, or lifecycle delivery works.

## Implemented Track B surface

The Release 1 implementation lives in `src/features/experience/`.

| Area | Implementation |
| --- | --- |
| Canonical contracts | `contracts.ts` defines `Experience`, `ExperienceModule`, `ExperienceModuleManifest`, `ExperienceCapability`, server-derived `Entitlement`, media/event contracts, and cross-track adapters. |
| Trusted registry | `registry.ts` registers developer-supplied modules by primary/secondary slot. It is not a remote-script or arbitrary-HTML loader. |
| Published configuration handoff | `ExperienceDefinitionSource` allows Track A to supply a published organization-scoped `Experience`; registry defaults remain the safe fallback. Configuration is checked against the module schema before rendering. |
| Customer handoff | `ExperienceCustomerSource` lets Track C resolve `Identity -> Customer` explicitly. The host does not equate Firebase user ID with Customer ID. |
| Entitlement handoff | `ExperienceEntitlementSource` accepts only a presentation snapshot marked `server-derived`. The default source is unavailable, so protected capabilities fail closed. |
| Capability resolver | `access.ts` checks declared capability, access mode, authentication, organization/customer/Experience scope, active entitlement, expiry, and allowance. |
| Host runtime | `ExperienceHost.tsx` loads the configured module, resolves its route/navigation, provides host services, and contains loading/unavailable/error/restricted states plus a module crash boundary. |
| Participant routing | `/experience/*` mounts the primary module in trial mode; `/app/experience/*` mounts it authenticated; `/app/secondary/*` mounts the secondary slot authenticated. |
| Lifecycle hook | Module browser events must be declared in the manifest and flow through `ExperienceEventSink`. Events are marked `browser-observed`; they cannot assert paid/platform authority. |
| Onboarding hook | `ExperienceOnboardingBridge` is an injected Track C boundary. Modules cannot mark arbitrary undeclared onboarding steps complete. |
| Diagnostics hook | `ExperienceRecoverableErrorReporter` is an injected platform/operations boundary and accepts safe context only. |
| Media | `SharedExperienceMedia` supports validated YouTube, Vimeo, and direct MP4/WebM paths plus image provenance/fallback behavior. Third-party video is click-to-load. |
| Reference primary module | `nurture.reference-assessment` is a small generic assessment fixture with trial use, authenticated continuation, one protected capability, progress handoff, events, linked stock imagery, and optional YouTube fixture. |
| Portability fixture | `nurture.reference-checklist` is a second, different-domain module using the same host contract. It exists to prove portability, not to become a second Nurture product domain. |

## Cross-track integration contract

Track B deliberately exposes adapters rather than reaching into another track's implementation.

| Owner | Track B consumes | Required behavior |
| --- | --- | --- |
| Track A — Configuration + Public Shell | `ExperienceDefinitionSource` | Return the **published** organization-scoped Experience/configuration for a registered module. Draft configuration must never appear here. |
| Track C — Identity + Customer Onboarding | `ExperienceCustomerSource`, `ExperienceOnboardingBridge`, existing auth context | Resolve Identity to Customer without collapsing the concepts; preserve/consume the validated Experience return path around registration; complete only declared host-owned onboarding steps. |
| Track D — Offers + Billing | trusted commercial state upstream of entitlement | Do not push checkout success into the module. Track D supplies/reconciles subscription state to the trusted entitlement layer. |
| Track E — Platform, Security + Operations | `ExperienceEntitlementSource` implementation and backend capability enforcement; recoverable-error sink | Deliver server-derived entitlement snapshots and repeat organization/customer/capability/quota authorization on protected backend operations. Client `canUse` is presentation only. |
| Track F — Analytics Instrumentation | `ExperienceEventSink` | Ingest the common event envelope; preserve module ID/version/source/trust and validate important milestones before promoting them to trusted lifecycle state. |
| Participant owner | existing `ParticipantShell` and route boundary | Continue owning shared participant chrome/account destinations; Track B owns module content and module-internal navigation within the reserved Experience slots. |

## Entitlement rule

The allowed sequence is:

`commercial state -> trusted backend state -> entitlement -> Experience capability`

The following are explicitly insufficient to grant a protected capability:

- checkout success URL;
- browser/local/session storage;
- a hidden or enabled button;
- an organization staff role;
- Firebase authentication by itself;
- a browser-observed lifecycle event.

`resolveExperienceCapability` is intentionally a presentation resolver. A protected Cloud Function/server handler must independently re-check scope, entitlement validity, and any allowance before returning protected data or performing a protected mutation.

## Reference Experience behavior

The primary reference module is deliberately small and generic. The public/trial route allows the Momentum Check before registration and keeps only versioned session progress. On completion, trial users can hand off to registration with `/app/experience/review` as the intended return path. Registration ownership remains Track C.

Authenticated review is a non-paid capability declared by the module. `/app/experience/deep-dive` demonstrates a protected capability: until Track C resolves a Customer and Tracks D/E provide a trusted entitlement snapshot, it is denied. The browser fixture contains no premium result that can be revealed by bypassing the button.

The secondary checklist fixture proves that another module domain can use the same registry, routing, access, state, and event infrastructure without adding a second lifecycle engine.

## Acceptance evidence and remaining integration gates

| Requirement / gate | Current evidence | Remaining gate |
| --- | --- | --- |
| NUR-07 / EXP-04 | Canonical entitlement contract plus fail-closed scoped presentation resolver. | ACC-06 still requires a trusted backend protected operation and payment/subscription reconciliation from Tracks D/E. |
| NUR-08 / EXP-01–03 | Manifest contract, trusted registry, dynamic module loading, participant routes, module navigation, standardized states. | Organization-selected installed modules beyond the Release 1 trusted registry are later scope. |
| NUR-08 / EXP-05 | Namespaced browser events validated against manifest definitions and emitted with source/trust metadata. | Track F/lifecycle ingestion and trusted milestone validation. |
| NUR-08 / EXP-06 | Typed configuration schema/defaults plus Track A published-definition adapter and runtime validation. | Track A organization-admin draft/preview/publish editor must write the published configuration source. |
| NUR-08 / EXP-07 | Module code receives scoped host context and shared media; no vendor secrets or arbitrary runtime script/iframe HTML are accepted by the registry. | Persisted module data security rules/server handlers are required when a module begins storing durable records. |
| NUR-08 / ACC-07 | Primary assessment and different-domain secondary checklist register against the same host contract and emit namespaced signals. | End-to-end lifecycle ingestion evidence after Track F integration. |
| NUR-09 / EXP-08 / ACC-01 | Usable Momentum Check replaces the empty Experience placeholder and uses the canonical participant shell. | Track A published organization configuration + Track C registration return integration complete the full R1 path. |
| NUR-09 / ACC-14 | Provider-specific media code, exact-host URL normalization, click-to-load behavior, fallback states, and the specified YouTube sample fixture are present. | **Not yet accepted:** localhost/preview/production playback, restricted-video/error-153 behavior, Vimeo/direct fixtures, captions/transcript evidence, and the complete MEDIA-06 browser matrix must be run and recorded. |
| CI | Pull-request CI typechecks and creates a production Vite build. | Browser/E2E and cross-track trusted-backend tests remain separate gates. |

Do not mark NUR-07 or NUR-09 fully accepted solely from client rendering or CI. Release 1 remains an integrated journey, and Track B's final acceptance depends on the trusted entitlement/backend and neighboring-track handoffs described above.
