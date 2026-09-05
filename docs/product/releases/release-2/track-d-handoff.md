# Release 2 Track D — Communication Templates and Email Delivery Handoff

Status: implementation branch / integration handoff
Branch: `release-2/track-d-email-communications`
PR: #17
Provisional R1 base: `2e06f3615e37471f3b484ca1ae73490e42b42b95`

## Owned implementation

Track D owns the reusable Release 2 email communication domain:

- approved email template catalog and defaults
- organization draft/publish/version history
- safe rendering and bounded variables
- email eligibility evaluation and explanation
- sender readiness
- provider-neutral SendGrid delivery adapter
- message intent/delivery records and logical-effect de-duplication
- signed SendGrid Event Webhook verification and delivery reconciliation
- provider/account suppression records
- repairable communication lifecycle outbox
- organization communications editor and controlled test-send UX
- email preference UX boundary
- the concrete D side of E's acquisition-email dispatch seam

Track D does not own acquisition enrollment/scheduling, customer/lead/consent persistence, lifecycle event catalog/projections, organization-customer binding, Firestore rules/index policy, application routing composition, or the root Cloud Functions export entrypoint.

## Catalog and purpose lock

| Template | D/provider purpose | E automation purpose | C consent purpose |
| --- | --- | --- | --- |
| `registration-welcome` | `transactional` | `service` | `service` |
| `onboarding-reminder` | `transactional` | `service` | `service` |
| `lead-follow-up` | `marketing` | `promotional` | `marketing` |
| `activation-invitation` | `marketing` | `promotional` | `marketing` |
| `trial-conversion` | `marketing` | `promotional` | `marketing` |
| `checkout-recovery` | `marketing` | `promotional` | `marketing` |

Purpose is catalog-owned and immutable. Template authors cannot reclassify promotional content as service/transactional mail. E's `templateVersionId` maps to D's immutable positive decimal published version number serialized as a string.

## C consent convergence

Track C PR #16 defines the canonical organization/subject/data-mode scoped consent fact with channel `email|sms`, purpose `service|marketing`, decision `granted|denied|withdrawn`, source, policy version, and timestamps. Missing consent remains unknown.

D does not create another consent collection. The concrete E integration no longer asks E to interpret C consent. Instead the final composition supplies D's `CurrentCommunicationContextPort`, which resolves the current server-side recipient, C-owned consent fact, and authoritative template variables. D adapts and evaluates them:

- C `service` -> D/provider `transactional`
- C `marketing` -> D/provider `marketing`
- C `withdrawn` or `denied` -> D denied
- missing -> D unknown
- purpose mismatch -> D unknown, never permission

`createAcquisitionEmailDispatchAdapter(...)` structurally implements E's published `AcquisitionEmailDispatchPort`. D evaluates once for E's admission decision and **re-reads/re-evaluates the current communication context again inside `submit` after E has persisted its provider-submission ambiguity barrier**.

## E runtime convergence

Track E PR #18 owns enrollment, durable jobs, leases, pause/caps/expiry, current lifecycle/commercial stop checks, retries/backoff, and provider-submission ambiguity admission. Final composition should:

1. instantiate `createAcquisitionEmailDispatchAdapter(currentCommunicationContextPort)` and provide that object as E's email dispatch port;
2. keep raw recipient email, C consent details, and rendered variables out of E's job contract;
3. supply one stable E effect/idempotency identity per logical communication;
4. let D re-resolve recipient/consent/sender/suppression/template variables at final submit;
5. allow E to retry only D results explicitly classified `retryable-failure`, subject to E's current-state rechecks and bounds;
6. treat D `unknown-outcome` as terminal/reviewable until reconciliation, never as permission for a blind resend;
7. bind `SENDGRID_API_KEY` to every Firebase Function that can execute D provider submission;
8. keep preview/demo/development as E dry-run modes; D's public/admin preview also never sends.

Controlled `test` execution applies D's explicit server-side allowlist while preserving the actual lead/customer subject in the test-mode message/outbox. Ad-hoc admin test sends use a `test` recipient and deliberately do not manufacture customer lifecycle events.

## Storage owned by D

Organization-scoped:

- `organizations/{organizationId}/communicationTemplates/{templateId}`
- `organizations/{organizationId}/communicationTemplates/{templateId}/versions/{version}`
- `organizations/{organizationId}/communicationSettings/emailSender`
- `organizations/{organizationId}/communicationMessages/{messageId}`
- `organizations/{organizationId}/communicationEffects/{effectHash}`
- `organizations/{organizationId}/communicationEventOutbox/{outboxId}`

Provider correlation/suppression:

- `_communicationProviderMessages/{providerMessageHash}`
- `_communicationProviderEvents/{providerEventHash}`
- `_communicationProviderSuppressions/{recipientHash}`

Provider correlation fields and message recipient hashes are opaque. Raw recipient email is used in memory for current eligibility/provider submission but is not persisted in `MessageIntent`, the communication outbox, or SendGrid custom arguments.

## F event/timeline convergence

Track F PR #25 registered these D-owned lifecycle outcomes:

- `communication.provider_accepted`
- `communication.delivered`
- `communication.bounced`
- `communication.dropped`
- `communication.complained`
- `communication.unsubscribed`
- `communication.suppressed`
- `communication.failed`
- `communication.outcome_unknown`

D writes a repairable outbox fact atomically with each corresponding D message/provider state change. D does **not** write a second canonical lifecycle event store. Final composition must drain pending `communicationEventOutbox` records through F validation plus E's one secure canonical lifecycle append boundary, then mark the D outbox item appended. Stable outbox/idempotency IDs include organization, execution mode, message, event type, and callback/logical evidence identity.

A verified SendGrid callback may update D state only after signature verification, stored provider-message correlation, recipient-hash scope verification, callback de-duplication, and monotonic state checks. Callback custom fields never establish tenant/customer authority.

Provider acceptance is not delivery. Delivery is not human engagement. Deferred is retained in D delivery history but is not registered as an F lifecycle outcome in the current Release 2 catalog.

## Rules/index requirements owned by E

E must deny direct client writes to D template/version/message/effect/outbox/provider-correlation/provider-suppression records and enforce tenant/member capabilities on all callable/query paths.

If the filtered communication-history query remains as implemented, review/add the collection index for `communicationMessages`: `recipientKey ASC`, `intent.createdAt DESC`. The pending outbox query uses a bounded `state == pending` read and still requires E's final rules/index review for the accepted Firestore edition/configuration.

## A/admin integration requirements

A may consume D's template/readiness/history/eligibility summaries for customer/lifecycle explanation surfaces. D owns `CommunicationsAdminPage`.

Release 2 finisher routing change required:

- `/org/:organizationId/admin/communications` -> `CommunicationsAdminPage` under `communications.view`
- browser hiding is not authorization; D server mutations independently require `communications.manage`

The public preference route should render `EmailPreferencesPage` only after the finisher injects C's opaque-token consent adapter. The D component intentionally has no email lookup or consent persistence fallback. A verified preference withdrawal should also be surfaced to F through the trusted composed consent/event path; email-string equality is never sufficient proof.

## Cloud Functions export requirements

The finisher owns `functions/src/index.ts`. Export from `./communications/index.js`:

- `listCommunicationTemplates`
- `saveCommunicationTemplate`
- `publishCommunicationTemplateVersion`
- `getCommunicationSenderReadiness`
- `sendCommunicationTest`
- `listCommunicationMessages`
- `sendGridEventWebhook`

`dispatchEmail` and `createAcquisitionEmailDispatchAdapter` are internal trusted composition APIs, not browser callables.

## Provider configuration

Required before controlled real provider proof:

- Firebase Secret Manager: `SENDGRID_API_KEY`
- Functions parameter: `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY`
- Functions parameter: `SENDGRID_TEST_ALLOWLIST`
- Functions parameter: `COMMUNICATION_TRUSTED_LINK_ORIGINS`
- verified organization sender mapping at `communicationSettings/emailSender`
- SendGrid Event Webhook configured to the deployed `sendGridEventWebhook` HTTPS endpoint

`COMMUNICATION_TRUSTED_LINK_ORIGINS` is a temporary server-authoritative bridge. When A's published organization/offer configuration reader is available server-side, compose it so links are checked against the actual published trusted origins.

## Safety behavior

- preview/demo/development never submit to SendGrid
- test mode only submits to an explicit server-side allowlist
- no live-send callable is exposed to the browser
- all real sends require a pinned published template version
- missing/undeclared variables block before provider submission
- subjects cannot contain line breaks
- body HTML is generated from escaped canonical plain text; arbitrary HTML/script authoring is unsupported
- rendered HTTP links are rejected and HTTPS origins must be trusted
- sender must be `ready`
- provider/account suppression outranks otherwise valid consent
- missing consent is unknown, not permission
- persisted logical effect precedes provider submission
- duplicate effect IDs resolve to the existing message
- a prior `submitting` effect recovered without definitive provider evidence becomes `unknown` and emits repairable `communication.outcome_unknown`
- final D submit rechecks current communication permission after E's ambiguity barrier
- callback tenant/subject scope is resolved from stored provider-message mapping, never arbitrary custom args
- callback recipient email is hashed and must match the stored recipient hash before mutation/suppression
- callback ordering cannot regress stronger terminal delivery knowledge

## Track-owned tests

The Functions suite executes Track D coverage for:

- all six defaults render with fictional preview data
- missing variables block rendering
- untrusted links block live rendering
- generated HTML escapes variable content
- preview never sends
- unknown/withdrawn consent behavior
- provider suppression precedence
- sender readiness
- controlled test allowlist
- purpose mismatch
- E service/promotional -> D transactional/marketing mapping
- C consent adaptation and purpose mismatch
- immutable version parsing and approved-template boundary
- SendGrid ECDSA timestamp + raw-body verification
- delivery-event mapping and out-of-order state transitions
- F lifecycle outcome mapping
- ad-hoc test-send event isolation
- test-mode acquisition subject preservation
- stable outbox identity for replayed provider evidence
- absence of raw recipient/rendered-variable data from outbox records

No new package dependency or lockfile change was introduced by Track D.

## Runnable acceptance scenario

After finisher/E/C/F composition and external SendGrid configuration:

1. enter organization A communications admin as a member with `communications.manage`;
2. preview the inherited registration welcome with fictional data and verify no provider call;
3. save/publish an organization override and verify the immutable published version remains unchanged by later draft edits;
4. attempt a controlled test to a non-allowlisted address and verify safety suppression;
5. use a verified sender plus allowlisted controlled recipient and observe `provider accepted`, not `delivered`;
6. process the resulting D outbox through E/F canonical append and confirm F records `communication.provider_accepted` in test mode;
7. deliver a correctly signed SendGrid callback, verify the D message becomes delivered, drain one stable `communication.delivered` outbox event, then replay the callback with no duplicate logical event;
8. send an invalid-signature callback or a valid callback with a conflicting recipient hash and verify no cross-message mutation;
9. queue a promotional E acquisition effect, withdraw C marketing consent before E reaches final D submit, and verify D suppresses with no new provider submission plus a repairable suppression outcome;
10. simulate timeout/crash ambiguity after submission and verify D/E expose unknown outcome and do not blindly resend the logical effect.

A real provider delivery/callback cannot be claimed until sender, secret, allowlist, webhook, compatible Firebase backend persistence, and deployed Functions are configured. SendGrid sandbox or a green build is not a substitute for this acceptance evidence.
