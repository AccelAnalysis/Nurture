# Track F — Release 1 analytics instrumentation

**Status:** Release 1 implementation contract  
**Primary product requirement:** NUR-25 (instrument early; richer analytics later)  
**Related contracts:** NUR-13, NUR-33, LIFE-02, LIFE-10

Track F is a lightweight cross-track instrumentation function. It defines the shared event vocabulary and contract used while Tracks A–E build the Release 1 vertical slice. It does **not** build the full analytics dashboard and it does not create a competing lifecycle engine.

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

The existing public shell dispatches `nurture:public-analytics`, and the active Track A branch has evolved that hook to a dotted event envelope. Track F's compatibility bridge supports both forms:

- current skeleton underscore names such as `public_page_view`;
- Track A dotted names such as `public.page_viewed`, `public.cta_selected`, and its more-specific public handoff signals.

The bridge normalizes these into `public.page_viewed` and `public.cta_selected` and de-duplicates the current primary-CTA + handoff double dispatch. Track A therefore does not need to replace its public shell with Track F implementation code to integrate.

When Track A resolves the public organization from an approved domain/application mapping, its organization ID remains a hint until the trusted ingestion boundary verifies the scope. `configuration.published` is not a browser fact; emit it only after the authorized publish operation succeeds.

### Track B — Experience Architecture

The active Track B branch exposes an injected `ExperienceEventSink` and defaults it to the `nurture:experience-event` browser hook. Track F consumes that hook through a compatibility bridge, preserving Track B's event ID, occurrence time, Experience/module identifiers, idempotency key, and safe properties while treating organization/identity/customer values as non-authoritative hints.

`experience.started` maps directly to the shared catalog. Registered module events such as `experience.reference-assessment.completed` remain namespaced signals. Milestones that drive lifecycle state must be recorded through a validated domain/server action as `experience.milestone_reached` or another approved trusted event. Do not put entitlement decisions into analytics payloads and do not infer access from analytics history.

After the tracks are composed, Track B can inject a Track F-backed sink directly instead of relying on the compatibility browser hook; module code should not need to change.

### Track C — Identity + Customer Onboarding

Emit `registration.started` at the interaction boundary. Emit `lead.created`, `registration.completed`, `identity.verified`, and onboarding completion events only after the corresponding domain action succeeds. Preserve the distinction between a Firebase identity and an organization-scoped customer; use the persisted envelope's `identityId`, `customerId`, and/or subject binding intentionally rather than assuming they are interchangeable.

### Track D — Offers + Billing

Browser code may record `offer.viewed` and `checkout.started`. `checkout.completed` and every subscription-state event must come from verified backend/provider state and use `provider_webhook` or `trusted_server`. Stripe test-mode events must be stored with `dataMode: "test"` so they cannot be mixed into live commercial metrics.

### Track E — Platform, Security + Operations

Track E owns the durable ingestion/persistence boundary, organization/actor verification, Firestore rules, server authorization, provider webhook verification, and idempotent storage. Track F supplies the event catalog, runtime validation, trust-source matrix, binding helper, and `AnalyticsSubmissionSink` contract. The default browser sink emits `nurture:analytics-submission`; it is a transport hook, not a production event store.

Track E must not persist browser `organizationIdHint`, `identityIdHint`, or `customerIdHint` as verified identity merely because they are present. It should bind those values from authenticated/tenant/server context and reject or reconcile mismatches.

## 4. Browser behavior

`trackAnalyticsEvent(...)` creates a versioned submission with a stable per-tab session ID, correlation ID, idempotency key, data mode, bounded payload, and optional context hints.

The default browser sink:

- dispatches `nurture:analytics-submission` for a future secure transport adapter;
- keeps a bounded `sessionStorage` debug buffer only for non-live modes;
- emits `nurture:analytics-error` when a configured sink rejects a submission;
- never blocks the user flow if analytics delivery fails.

Compatibility listeners consume the existing Track A public hook and Track B Experience hook. Unknown or malformed compatibility events are not promoted into the canonical stream.

The debug buffer is acceptance/debug evidence only. It is not trusted, durable production history and must not be used to grant access, calculate billing, or report live analytics.

## 5. Release 1 acceptance for Track F

Track F is ready to merge when:

- the shared event vocabulary and schema compile;
- Track A's current and proposed public event hooks normalize without requiring Track A implementation ownership to move;
- Track B's browser-observed global and namespaced Experience events enter the Track F submission boundary without becoming trusted milestones;
- browser submissions cannot be bound as payment/subscription/publish facts by an unauthorized source;
- browser-provided tenant/customer hints do not override trusted bindings;
- payload limits and secret-bearing field checks are verified;
- `live`, `test`, `preview`, `demo`, and `development` records are distinguishable;
- CI runs the Track F contract verification;
- the integration handoffs above are available to Tracks A–E.

The overall Release 1 analytics completion test remains integration-level: the vertical slice must leave durable, server-trusted event history that can reconstruct the customer's path. That final durability depends on Track E's secure ingestion and on Tracks A–D emitting their owned events at the successful domain boundaries.

## 6. Explicitly deferred

- full NUR-25 lifecycle analytics dashboard;
- cohort/funnel/churn calculations and attribution windows;
- admin lifecycle visualization;
- provider-specific analytics reporting;
- a standalone analytics database or new vendor;
- using browser debug history as a production source of truth.
