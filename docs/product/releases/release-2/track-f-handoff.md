# Release 2 Track F — lifecycle events, state, and customer timeline

**Owner:** F  
**Branch:** `release-2/track-f-lifecycle-state`  
**Provisional R1 base:** `2e06f3615e37471f3b484ca1ae73490e42b42b95` (`release/1-integration`)  
**Requirements:** NUR-13, NUR-17, initial NUR-25–NUR-26, NUR-33  
**Status:** Track implementation complete at the provider-neutral boundary; combined persistence/security/provider acceptance remains a Release 2 integration gate.

## What this track implements

Track F retains the Release 1 `LifecycleEventSubmission` / `LifecycleEventEnvelope` vocabulary and adds:

- reviewed lifecycle registrations with producer ownership, schema identifier, source policy, subject requirement, payload bounds, execution modes, and projection policy;
- additive communication outcome events required by Track D so provider acceptance, delivery, bounce/drop/complaint/unsubscribe/suppression/failure/unknown outcome remain distinct;
- independent tenant/customer/mode projections for identity, onboarding, commercial summary, Experience activity/activation, and communication eligibility;
- explicit source/provenance/version/staleness metadata and data-quality indicators;
- deterministic, bounded customer summary/timeline DTOs for Track A;
- authorization-first query composition that depends on Track E for server-authoritative capability/mode decisions, Track C for verified lead/identity aliases, and Track D/E for message/run links;
- compare-and-set + idempotency-receipt projection persistence contract for at-least-once trigger safety;
- projection-only replay/backfill that has no automation or message ports and therefore cannot enroll, send, or synthesize historical lifecycle events.

The derived seven-stage view is explicitly `nonAuthoritative: true`; it never controls access, entitlements, or customer navigation.

## Event convergence decisions

Track F reviewed the active R2 producer branches while implementing:

- **B:** verified milestones use `milestoneKey`, `activation`, `actionId`, and evidence version. F accepts that shape. Only a validated milestone with `activation: true` advances the Experience activation/first-meaningful-use dimension. Ordinary module activity and non-activation milestones do not.
- **C:** registration/onboarding producers use trusted customer subjects and `flowVersion` / `stepId`. Lead events remain lead-scoped until C verifies linking; timeline queries resolve those aliases through a C-owned port rather than cross-tenant email matching.
- **D:** message records use a stable `messageId`; F's communication events use that opaque reference and do not store recipient email in the timeline DTO.
- **E:** `SecureLifecycleEventAppender` / `DurableLifecycleEventStore` remain the canonical append boundary. F never introduces another raw event writer or store.

New R2 communication event names owned by D and registered by F:

`communication.provider_accepted`, `communication.delivered`, `communication.bounced`, `communication.dropped`, `communication.complained`, `communication.unsubscribed`, `communication.suppressed`, `communication.failed`, and `communication.outcome_unknown`.

Provider acceptance is not delivery. Delivery is not human engagement. Lead-scoped communication events can later appear on the linked customer timeline through C's verified alias resolver without rewriting the original event subject.

## Projection rules

- Identity is monotonic from unknown → lead → registered → verified; a late older fact cannot regress it.
- Onboarding completion cannot be undone by a late start/step for the same flow. A genuinely later different flow may enter progress independently.
- `experience.started` and namespaced module activity establish use, not activation.
- A verified milestone is deduplicated by milestone key. Only an activation-declared milestone establishes first meaningful use.
- Inactivity is ignored when it predates newer observed activity; later activity exits inactivity.
- Commercial lifecycle events never infer subscription state. They mark the commercial projection stale and request a current snapshot from the trusted Release 1 billing reconciler. The projection never grants entitlements.
- Communication outcome events mark communication eligibility stale and request a fresh D evaluator snapshot rather than directly treating a callback as marketing permission.
- Older authoritative snapshots cannot regress a newer observed source time.
- Backfill snapshots fill only dimensions with no event evidence and are labeled `backfill_snapshot`; they do not manufacture historical events.

## Persistence and index requirements for E / finisher

F intentionally does not choose a Firestore physical layout or edit rules/indexes in this branch. The official Firestore agent skill requires the target database edition to be established first, and the current Release 1 acceptance record still reports the remote Firestore/Functions provisioning gate separately. Security/rules/index ownership is also explicitly E-owned.

The persistence adapter must provide these logical guarantees regardless of physical layout:

1. projection identity = `organizationId + customerId + dataMode`;
2. checkpoint identity uses the same scope plus F processor version;
3. `commitProjection` atomically compare-and-sets the checkpoint revision, writes projection/checkpoint, and records a receipt for `organizationId + dataMode + sourceIdempotencyKey`;
4. a retry of the same logical event returns `duplicate`; concurrent different events return `conflict` and are re-read/reduced;
5. canonical timeline reads come from E's one durable event store and support bounded tenant/mode/customer plus verified lead/identity alias filtering;
6. any composite indexes required by the chosen Firestore layout are added by E/finisher only after edition detection and query-plan confirmation.

No client is authorized to write a projection, checkpoint, receipt, event, linked run status, or message outcome directly.

## Contracts produced

- `shared/lifecycle/contracts.ts`
- `shared/lifecycle/registrations.ts`
- `shared/lifecycle/projection.ts`
- `shared/lifecycle/processor.ts`
- `shared/lifecycle/query.ts`
- `shared/lifecycle/replay.ts`
- `shared/lifecycle/index.ts`
- `src/features/lifecycle/index.ts` (typed consumer export only)

## Contracts consumed

- F's accepted R1 analytics envelope/core validator.
- E: trusted append, tenant binding, server authorization, canonical event storage, automation run links, and projection persistence adapter.
- C: organization Customer relationship / verified lead+identity alias resolution and current-state backfill source.
- B: module activity and verified milestone semantics.
- D: current email-eligibility snapshot and communication record/status linkage.
- Release 1 billing reconciler: current commercial summary snapshot only; F does not rebuild Stripe reconciliation.

## Tests

Track-owned tests cover:

- duplicate/out-of-order convergence without state regression;
- browser-forged milestone rejection;
- live/test mode isolation;
- ordinary activity versus activation milestone semantics;
- authoritative commercial snapshot recheck rather than timestamp guessing;
- authorization before alias/event reads, payload redaction, deterministic timeline ordering, mode restrictions, and message linkage;
- replay deduplication with side effects structurally disabled and provenance-preserving backfill;
- projection processor compare-and-set retry plus atomic idempotency receipt behavior.

The branch is not evidence of the combined Firestore/Functions/provider path until E/C/D/B adapters are composed on one release commit.

## Runnable Track F acceptance fixture

Construct one `live` customer projection for organization A. Feed registration, verification, onboarding start/completion, Experience start, verified activation milestone, inactivity, and newer module activity in shuffled order. The resulting state must converge to verified identity, completed onboarding, activated Experience, one milestone, and active (not inactive) use. Feed a subscription event: the commercial state must remain unknown/stale until an as-of-current billing reconciler snapshot is applied. Replay the same event set with duplicate idempotency keys: the replay must create zero automation enrollments, zero communication effects, and zero synthetic events.

## Integration blockers / finisher actions

- Release 1 finisher must still name the final accepted `R1_BASE_SHA`; this branch uses the current R1 integration head provisionally.
- E must implement the concrete projection/timeline persistence and authorization adapters with rules/index tests and compose them with its canonical append boundary.
- C must expose the verified tenant-scoped alias resolver/current-state snapshot rather than F matching email addresses.
- D must emit the F-registered communication events only after its trusted message/provider state transitions and provide the current eligibility snapshot mapping (`eligible` / hold / suppression → F eligibility states and reason codes).
- B's milestone recorder must route through E's canonical append implementation; F then consumes the persisted envelope.
- The Release 2 finisher owns Functions exports, routing/providers, root dependencies/config, CI composition, and combined acceptance/deployment.

No deployment or live outbound activation is performed by Track F.
