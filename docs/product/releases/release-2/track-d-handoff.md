# Release 2 Track D — Communication Templates and Email Delivery Handoff

Status: implementation branch / integration handoff
Branch: `release-2/track-d-email-communications`
PR: #17
Provisional R1 base: `2e06f3615e37471f3b484ca1ae73490e42b42b95`

## Owned implementation

Track D owns the reusable email communication domain for Release 2:

- approved email template catalog and defaults
- organization draft/publish/version history
- safe rendering and bounded variables
- email eligibility evaluation
- sender readiness
- provider-neutral SendGrid delivery adapter
- message intent/delivery records and effect de-duplication
- SendGrid signed Event Webhook verification and delivery reconciliation
- provider/account suppression records
- organization communications editor and controlled test-send UX
- email preference UX boundary

Track D does not own acquisition enrollment/scheduling, customer/lead/consent persistence, lifecycle event catalog/projections, organization-customer binding, Firestore rules/index policy, application routing composition, or the root Cloud Functions export entrypoint.

## Catalog and purpose lock

| Template | Provider/D purpose | C consent purpose at composition |
| --- | --- | --- |
| `registration-welcome` | `transactional` | `service` |
| `onboarding-reminder` | `transactional` | `service` |
| `lead-follow-up` | `marketing` | `marketing` |
| `activation-invitation` | `marketing` | `marketing` |
| `trial-conversion` | `marketing` | `marketing` |
| `checkout-recovery` | `marketing` | `marketing` |

Purpose is catalog-owned and immutable. Template authors cannot reclassify promotional content as transactional/service mail.

## C consent convergence

Track C PR #16 defines the canonical consent fact as:

- organization scoped
- lead/customer scoped
- data-mode scoped
- `channel: email|sms`
- `purpose: service|marketing`
- `decision: granted|denied|withdrawn`, with missing = `unknown`
- source, policy version, recorded time, optional withdrawal time

D does not create another consent collection. At final dispatch, E must read the current C-owned email consent fact and adapt it to D's `EmailConsentSnapshot`:

- C `service` -> D/provider `transactional`
- C `marketing` -> D/provider `marketing`
- C `withdrawn` -> D `denied`
- missing -> D `unknown`

D's evaluator then returns `eligible`, `hold`, or `suppress` with a human-readable reason.

## Storage owned by D

Organization-scoped:

- `organizations/{organizationId}/communicationTemplates/{templateId}`
- `organizations/{organizationId}/communicationTemplates/{templateId}/versions/{version}`
- `organizations/{organizationId}/communicationSettings/emailSender`
- `organizations/{organizationId}/communicationMessages/{messageId}`
- `organizations/{organizationId}/communicationEffects/{effectHash}`

Provider correlation/suppression:

- `_communicationProviderMessages/{providerMessageHash}`
- `_communicationProviderEvents/{providerEventHash}`
- `_communicationProviderSuppressions/{recipientHash}`

Provider correlation fields use opaque/hashes. Raw recipient email is used in memory for provider submission but is not stored in `MessageIntent` or provider custom args.

## E security/runtime requirements

E owns final authorization/rules/index and worker admission. Integration must:

1. read current customer/lead existence and current C consent immediately before D dispatch;
2. recheck E-owned pause, automation state, caps, expiration, commercial/onboarding/activation stop state before invoking D;
3. supply one stable logical `effectId` per scheduled communication;
4. bind `SENDGRID_API_KEY` to every Firebase Function that can execute `dispatchEmail`;
5. leave D `unknown` provider outcomes held for reconciliation; do not blind-retry them;
6. allow bounded retry only for D attempts classified `retryable-failure` and only while all current E/C safety checks still pass;
7. deny direct client writes to D template/message/effect/provider/suppression records;
8. review/add the filtered history index if retained: collection `communicationMessages`, fields `recipientKey ASC`, `intent.createdAt DESC`.

## F event/timeline requirements

D deliberately does not register parallel lifecycle events. F should review and project D's trusted delivery outcomes, preserving the distinction among:

- provider accepted
- deferred
- delivered
- bounced
- dropped
- complained
- unsubscribed
- failed before known acceptance
- unknown provider outcome
- suppressed/held before provider submission

Provider acceptance is not delivery and delivery is not human engagement. SendGrid arbitrary custom fields are never tenant/customer authority; F should use D's stored message mapping/record references.

## A/admin integration requirements

A may consume D's template/readiness/history DTOs for customer/lifecycle explanation surfaces. D owns `CommunicationsAdminPage`.

Release 2 finisher routing change required:

- `/org/:organizationId/admin/communications` -> `CommunicationsAdminPage` under `communications.view`
- browser hiding is not authorization; D server mutations independently require `communications.manage`

The public preference route should render `EmailPreferencesPage` only after the finisher injects C's opaque-token consent adapter. The D component intentionally has no email lookup or consent persistence fallback.

## Cloud Functions export requirements

The finisher owns `functions/src/index.ts`. Export from `./communications/index.js`:

- `listCommunicationTemplates`
- `saveCommunicationTemplate`
- `publishCommunicationTemplateVersion`
- `getCommunicationSenderReadiness`
- `sendCommunicationTest`
- `listCommunicationMessages`
- `sendGridEventWebhook`

`dispatchEmail` is an internal trusted composition API for E, not a public client callable.

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

- preview/demo/development modes never submit to SendGrid
- test mode only sends to a server-side explicit allowlist
- no live-send callable is exposed to the browser
- all real sends require a pinned published template version
- missing/undeclared variables block before provider submission
- subjects cannot contain line breaks
- body HTML is generated from escaped canonical plain text; arbitrary HTML/script authoring is unsupported
- rendered HTTP links are rejected and HTTPS origins must be trusted
- sender must be `ready`
- account/provider suppression outranks otherwise valid consent
- missing consent is `unknown`, not permission
- persisted logical effect precedes provider submission
- duplicate effect IDs resolve to the existing message
- a prior `submitting` effect recovered without definitive provider evidence becomes `unknown`, preventing blind replay
- callback tenant/subject scope is resolved from stored provider-message mapping, never callback custom args
- callback recipient email is hashed and must match the stored recipient hash before mutation/suppression

## Test coverage

Track D adds Functions tests for:

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
- SendGrid ECDSA timestamp + raw-body verification
- delivery-event mapping
- out-of-order state transition rules

The existing Functions test script is extended to execute these Track D tests; no dependencies or lockfiles are added.

## Runnable acceptance scenario

After finisher/E/C/F composition and external SendGrid configuration:

1. enter organization A communications admin as a member with `communications.manage`;
2. preview the inherited registration welcome using fictional data; verify no provider call occurs;
3. save and publish an organization override; verify an immutable version is created and the draft can later change without mutating it;
4. attempt a controlled test to a non-allowlisted address; verify suppression with explanation;
5. configure a verified sender and use one allowlisted controlled recipient; submit one controlled test and observe `accepted`, not `delivered`;
6. deliver a correctly signed SendGrid callback and verify the same D message becomes `delivered` through stored provider mapping;
7. replay the callback and verify no duplicate logical mutation;
8. submit an invalid-signature callback or a valid callback whose email hash conflicts with the stored message; verify no cross-message mutation;
9. for a promotional scheduled effect, withdraw C-owned marketing consent before E calls D; verify D records suppression and makes no new provider submission;
10. simulate an ambiguous timeout after submission; verify status `unknown` and no blind retry for the same effect.

A real provider delivery/callback cannot be claimed until sender, secret, allowlist, webhook and deployed Functions are configured. SendGrid sandbox or a green build is not a substitute for this acceptance evidence.
