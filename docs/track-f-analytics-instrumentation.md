# Track F — Release 1 analytics instrumentation

**Status:** Release 1 implementation contract  
**Primary product requirement:** NUR-25 (instrument early; richer analytics later)  
**Related contracts:** NUR-13, NUR-33, LIFE-02, LIFE-10

Track F is a lightweight cross-track instrumentation function. It defines the shared event vocabulary and contract used by Tracks A–E in the Release 1 vertical slice. It does **not** build the full analytics dashboard and it does not create a competing lifecycle engine.

## 1. Contract boundary

The implementation deliberately separates two shapes:

1. **`LifecycleEventSubmission`** — a browser/client request to record an occurrence. Organization, identity, customer, and subject fields on this shape are hints only. A browser cannot make itself authoritative by supplying tenant, customer, payment, entitlement, or administrator values.
2. **`LifecycleEventEnvelope`** — the persisted form after a trusted boundary verifies and binds `organizationId`, subject, source, receipt time, and applicable provider/domain context.

This preserves the lifecycle model's rule that event history and trusted current-state projections are different things. A checkout return page may submit navigation/interaction telemetry; it cannot create `checkout.completed`, `subscription.started`, or an entitlement-granting fact.

The common envelope contains:

- `eventId`
- `eventType`
- `schemaVersion`
- `organizationId`
- optional `subjectId` + `subjectKind`
- optional verified `identityId` / `customerId`
- optional `experienceId` / `experienceModuleId` / `experienceModuleVersion`
- optional `offerId`
- optional `sessionId`
- `occurredAt`
- `receivedAt`
- trusted `source`
- `correlationId`
- `idempotencyKey`
- `dataMode` (`live`, `test`, `preview`, `demo`, or `development`)
- bounded `payload`

Payloads are JSON-only, capped at 16 KiB, reject non-finite numbers, and reject obvious secret-bearing keys. Do not put passwords, auth tokens, cookies, card data, service credentials, or unnecessary raw personal data in analytics payloads.

`validateLifecycleEventEnvelope(...)` is the runtime convergence gate for already-materialized server events. It verifies event/schema/source compatibility, subject pairing, timestamps, data mode, required IDs, and payload safety before durable persistence or publication through Track E's event integration port.

## 2. Release 1 vocabulary and owner handoff

| Family | Event | Owning track | Trusted-source rule |
| --- | --- | --- | --- |
| Public | `public.page_viewed` | A | browser signal |
| Public | `public.cta_selected` | A | browser signal |
| Identity | `visitor.identified` | C | validated domain/server action |
| Identity | `lead.created` | C | validated domain/server action |
| Identity | `registration.started` | C | browser or validated domain action |
| Identity | `registration.completed` | C | validated domain/server action |
| Identity | `identity.verified` | C | validated domain/server action |
| Experience | `trial.started` | B | validated domain/server action |
| Offers | `offer.viewed` | D | browser or validated domain action |
| Commerce | `checkout.started` | D | browser or validated domain action |
| Commerce | `checkout.abandoned` | D | scheduler/server derived |
| Commerce | `checkout.completed` | D | verified provider/server only |
| Commerce | `subscription.started` | D | verified provider/server only |
| Commerce | `subscription.updated` | D | verified provider/server only |
| Commerce | `subscription.renewed` | D | verified provider/server only |
| Commerce | `subscription.cancelled` | D | verified provider/server only |
| Onboarding | `onboarding.started` | C | validated domain/server action |
| Onboarding | `onboarding.step_completed` | C | validated domain/server action |
| Onboarding | `onboarding.completed` | C | validated domain/server action |
| Experience | `experience.started` | B | browser/domain/server signal |
| Experience | `experience.milestone_reached` | B | validated domain/server action |
| Experience | `experience.premium_feature_requested` | B | browser/domain/server signal; never grants access |
| Experience | `experience.inactive` | B/lifecycle | scheduler/server derived |
| Publishing | `configuration.published` | A | authorized administrator/server only |
| Satisfaction | `survey.completed` | later lifecycle work | validated domain/server action |
| Referral | `referral.created` | later lifecycle work | validated domain/server action |

The catalog includes the lifecycle baseline events that Release 1 work will touch plus near-term baseline events already named by the canonical lifecycle model.

### Namespaced Experience events

Developer-built Experience modules may register namespaced events such as `experience.reference-assessment.answer_selected` and `experience.reference-assessment.completed`. Track F accepts these as module-scoped signals while keeping them separate from global lifecycle facts. A browser-observed module completion does **not** become `experience.milestone_reached` merely because its event name says “completed”; a validated domain/server action must establish any shared lifecycle milestone used for automation or trusted analytics.

Namespaced events must match `experience.<module>.<event>` and remain declared by the Experience module. They may originate from browser, validated domain action, or trusted server sources; provider webhooks, schedulers, and administrators do not get implicit authority to invent module events.

## 3. Cross-track integration rules

### Track A — Configuration + Public Shell

Track A dispatches `nurture:public-analytics` using the dotted Release 1 vocabulary, while the merged skeleton still contains the earlier underscore names. Track F's compatibility bridge supports both forms:

- skeleton names such as `public_page_view`;
- Track A names such as `public.page_viewed`, `public.cta_selected`, and its more-specific public handoff signals.

The bridge normalizes these into `public.page_viewed` and `public.cta_selected` and de-duplicates the primary-CTA + handoff double dispatch. Track A therefore does not need to replace its public shell with Track F implementation code to integrate.

When Track A resolves the public organization from its approved host/application mapping, its organization ID remains a hint until the trusted ingestion boundary verifies the scope. `configuration.published` is not a browser fact; emit it only after the authorized publish operation succeeds at the trusted mutation boundary.

### Track B — Experience Architecture

Track B exposes an injected `ExperienceEventSink` and defaults it to the `nurture:experience-event` browser hook. Track F consumes that hook through a compatibility bridge, preserving Track B's event ID, occurrence time, Experience/module identifiers, idempotency key, and safe properties while treating organization/identity/customer values as non-authoritative hints.

`experience.started` maps directly to the shared catalog. Registered module events such as `experience.reference-assessment.completed` remain namespaced signals. Milestones that drive lifecycle state must be recorded through a validated domain/server action as `experience.milestone_reached` or another approved trusted event. Do not put entitlement decisions into analytics payloads and do not infer access from analytics history.

After composition, Track B can inject a Track F-backed sink directly instead of relying on the compatibility browser hook; module code should not need to change.

### Track C — Identity + Customer Onboarding

Track C now has a concrete browser transport contract: `nurture:lifecycle-signal`. It emits `lead.created`, `registration.started`, `registration.completed`, `identity.verified`, `onboarding.started`, `onboarding.step_completed`, and `onboarding.completed`, carrying event/correlation/idempotency IDs plus identity/customer/lead hints and a bounded payload.

Track F installs `installIdentityLifecycleCompatibilityBridge()` at application composition and converts that hook into `LifecycleEventSubmission` while preserving Track C's identifiers. Its `transport: "browser"` / `trust: "client-observed"` metadata does **not** become persisted event `source` authority. Events that require `domain_action` or `trusted_server` provenance still require Track E/server verification before binding and persistence.

This is especially important for `registration.completed`, `identity.verified`, and onboarding completion: the browser can report that Track C observed the owning action complete, but the persisted envelope must bind the verified Firebase identity and organization/customer relationship. Track C's `identityCustomers/{identityUid}` global account profile remains distinct from an organization-scoped customer.

### Track D — Offers + Billing

Track D's server-side `writeLifecycleEvent` currently materializes the same core envelope fields Track F requires: event/schema/organization/subject, customer/offer context, occurrence/receipt time, source, correlation/idempotency IDs, `dataMode: "test"`, and payload. Its commercial vocabulary (`offer.viewed`, `checkout.started`, `checkout.completed`, `subscription.started`, `subscription.updated`, `subscription.cancelled`) is a subset of the Track F catalog.

The Track F contract verification now includes a Track D-shaped `subscription.started` provider-webhook fixture and passes it through `validateLifecycleEventEnvelope(...)`. A commercial event with an invalid source, such as browser-authored `checkout.completed`, is rejected.

During final branch composition, Track D should validate the materialized envelope before its durable event write or before publishing it through Track E's `EventIntegrationPort<LifecycleEventEnvelope>`. Track F does not replace Track D's Stripe reconciliation, and Track D must retain `dataMode: "test"` for Release 1 so test commercial activity cannot enter live metrics.

`subscription.renewed` remains in the canonical lifecycle catalog even though Track D's current Release 1 producer does not yet emit a distinct renewal event; that is not required to reconstruct the initial purchase vertical slice, but later renewal analytics should use the canonical name rather than inventing another one.

### Track E — Platform, Security + Operations

Track E owns the trusted ingestion/persistence boundary, organization/actor verification, Firestore rules, server authorization, provider webhook verification, and provider/integration conventions. Its completed `EventIntegrationPort<TEvent>` is the correct durable provider-facing seam for Track F events.

Track F supplies:

- the canonical event catalog;
- browser/client submission contract;
- runtime payload and trusted-envelope validation;
- trust-source matrix;
- trusted binding helper;
- `AnalyticsSubmissionSink` client seam.

At composition, Track E should use `EventIntegrationPort<LifecycleEventEnvelope>` for validated trusted records. It must not persist browser `organizationIdHint`, `identityIdHint`, `customerIdHint`, or Track C/Track B subject hints as verified identity merely because they are present. It should bind those values from authenticated tenant/server context and reject or reconcile mismatches.

Track E's still-open durable Firestore rules/audit gates remain Release 1 integration dependencies; Track F does not claim durable production event history is complete until that trusted persistence path exists.

## 4. Browser behavior

`trackAnalyticsEvent(...)` creates a versioned submission with a stable per-tab session ID, correlation ID, idempotency key, data mode, bounded payload, and optional context hints.

The default browser sink:

- dispatches `nurture:analytics-submission` for a future secure transport adapter;
- keeps a bounded `sessionStorage` debug buffer only for non-live modes;
- emits `nurture:analytics-error` when a configured sink rejects a submission;
- never blocks the user flow if analytics delivery fails.

Compatibility listeners consume Track A's public hook, Track B's Experience hook, and Track C's lifecycle-signal hook. Unknown or malformed compatibility events are not promoted into the canonical stream.

The debug buffer is acceptance/debug evidence only. It is not trusted, durable production history and must not be used to grant access, calculate billing, or report live analytics.

## 5. Release 1 acceptance for Track F

Track F is ready to merge when:

- the shared event vocabulary and schema compile;
- Track A's current public event hooks normalize without requiring Track A implementation ownership to move;
- Track B's browser-observed global and namespaced Experience events enter the Track F submission boundary without becoming trusted milestones;
- Track C's concrete identity/onboarding lifecycle hook enters the Track F submission boundary while retaining client-observed trust semantics;
- Track D-shaped trusted provider events pass the Track F envelope validator while invalid commercial sources fail closed;
- browser submissions cannot be bound as payment/subscription/publish facts by an unauthorized source;
- browser-provided tenant/customer hints do not override trusted bindings;
- payload limits and secret-bearing field checks are verified;
- `live`, `test`, `preview`, `demo`, and `development` records are distinguishable;
- CI runs the Track F contract verification;
- the integration handoffs above are available to Tracks A–E.

The overall Release 1 analytics completion test remains integration-level: the vertical slice must leave durable, server-trusted event history that can reconstruct the customer's path. Track F now covers the concrete A/B/C client transports and D trusted envelope shape; final durability depends on Track E's secure persistence and the integrated A–D success paths.

## 6. Explicitly deferred

- full NUR-25 lifecycle analytics dashboard;
- cohort/funnel/churn calculations and attribution windows;
- admin lifecycle visualization;
- provider-specific analytics reporting;
- a standalone analytics database or new vendor;
- using browser debug history as a production source of truth.
