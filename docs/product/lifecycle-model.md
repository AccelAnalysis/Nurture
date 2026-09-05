# Customer lifecycle model

**Version:** 1.0.0 · **Date:** 2026-09-05 · **Status:** Target model, not a running automation system  
**Parent requirements:** [NUR-01, NUR-11–NUR-26, NUR-29–NUR-33](nurture-product-spec.md)

The owner baseline establishes reusable lifecycle treatment. This document adds execution semantics and explicit safeguards. It does not introduce a customer-facing CRM or prescribe what the Experience does.

## 1. Seven stages versus operational state — LIFE-01

Retain the existing repository's conceptual seven-stage map:

| Stage | Nurture responsibility |
| --- | --- |
| 1. Marketing | Published brand/site/media, attraction, permissible attribution and identification |
| 2. Offers | Offer presentation, trial choices, purchase/upgrade handoff |
| 3. Registration + Onboarding | Identity and configurable customer setup |
| 4. App Experience | Host public/trial/authenticated primary Experience and receive meaningful signals |
| 5. Secondary Experience | Optional additional value or module; not a compulsory funnel step |
| 6. Upsell / Recurring Offer | Expansion, subscription continuation, and commercial servicing |
| 7. Feedback + Referral | Surveys, feedback response, referral invitation/qualification, and return to acquisition |

Retention and re-engagement span these stages. The source's Visitors → Identified → Registered → Activated → Customers → Expanded → Retained → Advocates illustration contains eight labels and describes an operational view, not a replacement definition of the seven stages.

**Added modeling decision:** maintain independent dimensions rather than one irreversible `stage` field. A customer can be paid but not onboarded, active but approaching renewal, or a referrer while also re-engaging. Suggested dimensions include identity, onboarding, subscription, engagement, consent, and advocacy. The stage visualization is a derived administrator view; it does not control authority or require a visitor to register before every free interaction.

## 2. Event envelope and trust — LIFE-02

Persist a validated envelope with `eventId`, `eventType`, `schemaVersion`, `organizationId`, scoped `subjectId`/subject kind, optional `experienceId`/module version, `occurredAt`, `receivedAt`, trusted `source`, `correlationId`, `idempotencyKey`, and bounded `payload`. Bind organization and actor to verified context; do not trust those fields merely because a browser supplied them.

Use the baseline names:

```text
visitor.identified
lead.created
registration.completed
trial.started
offer.viewed
checkout.started
checkout.abandoned
subscription.started
onboarding.started
onboarding.completed
experience.started
experience.milestone_reached
experience.premium_feature_requested
experience.inactive
survey.completed
referral.created
subscription.renewed
subscription.cancelled
```

Module-specific names are registered and namespaced. The following are proposed additions, not source-mandated names: `communication.suppressed`, `payment.failed`, `subscription.cancellation_requested`, `referral.qualified`, `referral.reward_issued`, and `experience.reactivated`.

| Source class | May establish | May not establish alone |
| --- | --- | --- |
| Anonymous/browser signal | Permitted interest, interaction, navigation, reported activity | Payment, eligibility for money/credits, privileged status |
| Validated authenticated domain action | Accepted onboarding action or verified module milestone | Another customer's identity or tenant authority |
| Verified provider webhook | Provider-backed subscription/payment/delivery occurrence | An unrelated tenant mapping inferred from browser input |
| Trusted scheduler/derived event | Inactivity/abandonment after the configured window and current-state recheck | That a human ignored a message or received no value |
| Authorized administrator action | Audited configuration/manual override within granted scope | Unlogged privilege escalation or fabricated payment history |

Keep the event record and current-state projection distinct. Duplicate provider events must be identifiable; late events must not regress a newer known state. Where webhook order is uncertain, reconcile provider state through the trusted adapter. Never treat a checkout return URL as payment confirmation.

## 3. Identity and attribution — LIFE-03

An anonymous visitor can become an identified lead without becoming an authentication user. On registration, link the lead only through a verified, tenant-scoped procedure. Record attribution under an approved retention/consent policy; no cross-tenant email matching or hidden personal identifiers in referral URLs.

Direct purchase, return visits, trial-before-registration, and skipped optional steps remain valid paths. Acquisition analytics must not turn consent-denied or untracked visitors into invented lead records. A missing event is unknown, not proof of inactivity or abandonment.

## 4. Automation definition — LIFE-04

A published automation contains an ID/version, scope, trigger type, event schema, audience predicate, optional delay/window, action/template version, channels/purpose, priority, frequency limits, re-entry policy, stop conditions, and expiration. It also declares required integration readiness and permissions.

A run records the source event, customer scope, automation version, next scheduled step, eligibility decisions, attempts, outcome, and explanation. Suggested run states are `scheduled`, `eligible`, `executing`, `succeeded`, `suppressed`, `cancelled`, `retrying`, and `failed`. These are execution states, not customer stages.

Start with human-readable templates. Do not make a visual workflow builder or custom code a prerequisite for the default shell. Show a preview such as: “After registration, wait the selected interval; if no subscription and messaging is permitted, send this template.”

## 5. Reliable execution — LIFE-05

Persist schedules server-side through the existing backend boundary and an explicitly chosen durable scheduling mechanism. That mechanism is an implementation decision, not a new hosting stack.

At execution, recheck current subscription, completion, consent, suppression, channel readiness, timing, caps, campaign enablement, and customer existence. Pin content and automation versions for reproducibility, but apply current safety/permission state. Changes in marketing eligibility must take effect even for work already queued.

Use a stable effect identity such as organization + customer + automation version + trigger occurrence + step. Deduplicate ingestion and action scheduling, use transactional state transitions where needed, and record provider request identities. Design for at-least-once delivery; do not promise universal exactly-once behavior across external providers.

Retries require backoff, limits, and a reviewable terminal failure. When the provider's response is ambiguous, reconcile before retrying a charge, reward, or other irreversible operation. A retry must not create a new logical action identity. Replaying historical events must not resend campaigns or issue rewards unless an authorized, explicitly scoped replay mode permits it.

Provide per-automation and platform/organization emergency pause. A pause stops new dispatches and cancels/suppresses eligible queued work; it cannot recall a message already delivered. Expose a reason for every suppressed or failed action rather than silently dropping it.

## 6. Default-cycle catalog — LIFE-06

These templates are derived from B1; exact timings, thresholds, and copy require configuration. Seed previewable templates, not live unsolicited sends.

| Cycle | Trigger/example | Required recheck or exit |
| --- | --- | --- |
| Acquisition | Lead identified or registration completed | Contact permission; stop after conversion or withdrawal |
| Trial activation | Trial begins without first meaningful use | Stop when activated, trial ends, or access changes |
| Trial conversion | Trial approaches end | Current trial/offer/permission; no duplicate purchase solicitation |
| Checkout recovery | Checkout started and configured interval elapsed | Confirm no completed purchase and contact eligibility |
| Welcome/onboarding | Registration or purchase | Current onboarding version/status; distinguish service from marketing |
| Upsell | Premium request or valid milestone | Capability still absent; eligible published offer; dismissal cooldown |
| Survey | Onboarding/milestone/customer-age rule | Invitation cap, response state, survey version, consent policy |
| Referral invitation | Eligible positive feedback or milestone | Program active, incentive terms approved, customer eligible, cooldown |
| Renewal | Upcoming provider-backed renewal | Still renewing; accurate amount/date and commercial terms |
| Payment recovery | Verified payment failure | Current payment status; stop after successful recovery |
| Re-engagement | Meaningful inactivity threshold | Instrumentation valid; no reactivation; contact permitted |
| Win-back | Cancellation plus selected interval | Still cancelled; permission and trial/discount eligibility |

Cross-cycle coordination must prevent contradictory or repetitive prompts. Priorities and global caps are product settings; an automation cannot bypass consent by labeling itself high priority. Open support issues or adverse feedback may suppress promotional prompts under a documented organization rule.

## 7. Communications and privacy — LIFE-07

Store consent/suppression by channel and purpose, including capture source, policy version, time, and withdrawal. Sender identity and a contact address do not by themselves establish permission. Review launch-market requirements before enabling an outbound channel.

Keep service/transactional notifications separate from optional promotional messaging with approved rules. Apply customer/organization timezone and quiet-hour behavior as configured; specify fallback when timezone is unknown. Do not infer location from sensitive profiling.

Use test-recipient allowlists in preview/test mode. Redact secrets and unnecessary personal data from run logs and dead-letter records. Deletion/withdrawal must stop future inappropriate processing; retention obligations for financial/audit records need an explicit policy. Survey invitations and referral share links must not expose private response or billing details.

## 8. Surveys and NPS — LIFE-08

Version questions and responses; include invitation identity, eligibility window, completion time, and permitted customer linkage. Enforce survey token scope and expiry server-side. Public links do not imply publicly readable answers.

For an NPS-labeled survey, use a 0–10 recommendation scale. Promoters are 9–10, passives 7–8, and detractors 0–6. Compute percentage of valid respondents who are promoters minus percentage who are detractors; passives remain in the denominator. Show response count, period, audience, and survey version. With no valid responses, show “No responses,” not zero. This definition follows [Bain's NPS measurement guidance](https://www.netpromotersystem.com/about/measuring-your-net-promoter-score/).

A validated response can produce a derived `survey.nps.promoter` event as in B1. The browser cannot self-assert that classification. Keep satisfaction responses and NPS separate. Inviting satisfied customers to refer is distinct from measuring all eligible customers' satisfaction; never present a positivity-selected sample as an unbiased overall NPS.

## 9. Referral attribution and rewards — LIFE-09

Use opaque non-PII codes scoped to program and organization. Preserve attribution across permitted public/registration/purchase handoffs. Decide first/last-touch precedence and the conversion window before launch; do not silently overwrite an already-qualified referrer.

Suggested record states are referred/attributed, registered, pending qualification, qualified, reward pending, rewarded, rejected, and reversed. Program versions preserve the terms that applied to an accepted referral. Qualification uses trusted records, not a clicked share button.

Define self-referral and duplicate-customer controls, reward limits, refund/chargeback effects, approval thresholds, expiry, and support dispute handling. Keep a ledger of entitlement/credit/coupon or other reward effects; select the actual incentive mechanism before enabling fulfillment. An issued reward requires a unique effect identity and auditable provider or internal-ledger result.

Customers see their referral's permitted progress and earned benefit, not another customer's email, payments, answers, or private use. Sharing remains voluntary. Do not tie incentives to YouTube viewing or require promotional sharing to access YouTube playback; see [media safeguards](design-and-media.md).

## 10. Analytics and inspection — LIFE-10

Expose the source event, rule version, current eligibility, scheduled step, and outcome in an authorized customer timeline. Filter private fields by staff capability. Distinguish queued, sent, delivered, failed, responded, and converted; one does not prove another.

For each metric define tenant scope, unit, test/live mode, source, event-time/reporting-time convention, timezone, period/cohort, denominator, deduplication, attribution window, and late-event policy. Do not sum multiple currencies into one unsupported figure. Normalize annual recurring amounts separately from collected annual cash. Define customer churn versus subscription churn before reporting them.

Module usage is not a generic engagement score unless its interpretation is documented. YouTube/provider API metrics must remain distinguished from Nurture's own lifecycle data and follow provider rules. Minimal operational observability ships with the first execution feature; the richer analytics release is not permission to postpone failure logs.

## 11. Required failure tests — LIFE-11

A customer purchases during an acquisition delay; opts out during an upsell delay; reactivates before a win-back send; or loses eligibility before a referral reward. Each scheduled action must re-evaluate and produce the correct explained result.

Also test duplicate/out-of-order webhooks, a worker crash after provider submission, provider timeout with unknown result, retries exhausted, template published during an active run, cancelled automation, malicious tenant ID, expired survey token, double survey submission, and refund after referral qualification. No client-generated financial or reward event is accepted as authoritative.

See [Delivery and acceptance](delivery-and-acceptance.md) for release gates. The durable scheduler, payment routing, exact frequency policy, and incentive economics remain explicit decisions rather than facts inferred from the attachment.
