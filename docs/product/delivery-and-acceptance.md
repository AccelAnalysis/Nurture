# Delivery plan, acceptance gates, and decisions

**Version:** 1.0.0 · **Date:** 2026-09-05 · **Status:** Proposed delivery sequence for the canonical target specification

This document operationalizes the [product specification](nurture-product-spec.md). Release grouping, test fixtures, and operational safeguards are added planning decisions. They are not evidence that any feature is already implemented. The owner's attachment specifies the 33 product areas; it does not settle every billing, legal, deployment, or provider-policy choice.

## 1. Existing foundation versus target

The reviewed repository already documents a React/TypeScript/Vite skeleton, shared Nurture branding, Firebase service boundaries, separated public/identity/participant/organization/platform routes, and proposed tenant security gates. That is a starting point, not proof that production billing, automation, customer persistence, surveys, referrals, or video playback meet this specification.

Before implementation, inspect the relevant current code and read [AGENTS.md](../../AGENTS.md), [owner boundaries](../owner-boundaries.md), and the [brand guide](../../brand/README.md). Use the existing Firebase project and infrastructure. Do not mark an acceptance item complete because a demo card or placeholder route exists.

## 2. Proposed releases

### Release 1 — Configurable shell and commercial Experience

Build organization-scoped configuration, default inheritance/versioning, Brand & Site, draft/preview/publish, identity, three editable offers with monthly/annual terms, Stripe test-mode checkout, server-derived access, configurable onboarding, the participant Experience host, and a reference module. Include the shared media model with working YouTube, Vimeo, and direct-video adapters and linked stock assets.

Define event schemas and instrument key handoffs in this release; the durable automation engine can follow. Establish tenant authorization and minimum operational diagnostics before enabling persistence. Ship accessible default states, N logo rendering, mobile layout, and media fallback from the first usable shell.

**Exit:** an administrator can configure and publish a test-mode branded application; a visitor can try it, register, purchase in test mode, complete onboarding, and use a protected capability. No browser-only paid access, fake success states, or cross-tenant leakage.

### Release 2 — Customer lifecycle foundation

Build the organization-scoped customer record, progressive lead linking, consent/suppression model, validated events/projections, communication templates, sender-readiness checks, and durable trigger/condition/delay/action execution. Deliver default welcome and acquisition cycles with dry run and controlled test recipients.

**Exit:** a permitted test lead can receive the configured sequence; a purchase or opt-out during a delay cancels an obsolete action; the administrator can inspect eligibility, delivery, suppression, and failure reasons.

### Release 3 — Expansion, retention, and re-engagement

Add contextual upsell, in-app prompts, renewal and payment-recovery treatment, inactivity/re-engagement, cancellation/win-back handling, re-entry policies, cross-cycle caps, and operational pause/retry/reconciliation tools.

**Exit:** milestone/capability signals produce appropriate offers; outdated or conflicting messages are suppressed; cancellation remains straightforward; duplicate events do not create duplicate effects.

### Release 4 — Surveys and referrals

Add versioned survey templates, invitations/responses, NPS and satisfaction reporting, service-recovery handoff, referral attribution, approved incentives, qualification, ledger-based fulfillment, reversals, and abuse controls.

**Exit:** a valid response can lead to one eligible referral invitation; a referred customer converts through the same acquisition shell; verified qualification produces the incentive once, with a complete audit trail.

### Release 5 — Analytics and optimization

Add the richer internal lifecycle visualization, defined funnel/cohort measures, offer and automation performance, activation, satisfaction, referral results, renewal/churn, and data-quality indicators. Operational logs and minimal instrumentation are prerequisites from earlier releases, not deferred here.

**Exit:** displayed metrics can be traced to definitions and scoped source events; annual cash and normalized recurring revenue are not confused; missing/test data are not presented as live zeros/results.

### Release 6 — Experience ecosystem

Extend the trusted initial registry into version-aware installation/configuration, reusable templates, compatibility checks, migrations, and controlled module upgrades. Evaluate third-party modules only after trust/review/isolation policies are defined.

**Exit:** a second materially different Experience runs on the same host/lifecycle contract without bespoke identity, billing, communications, surveys, or referral systems. Arbitrary administrator-uploaded code remains out of scope unless separately approved.

## 3. Non-negotiable cross-release gates

**Security:** server-enforced organization/customer/capability isolation; trusted billing and reward mutations; no vendor secrets in browser bundles or repository; no production permission from demo state. Include negative tests using changed URLs, IDs, roles, and direct requests.

**Customer control:** purpose/channel-aware messaging, suppression/withdrawal, optional feedback/referral participation, straightforward cancellation, private survey answers, and a clear data-retention policy. Complete the applicable market/provider review before enabling real outreach or incentives.

**Defaults and publishing:** usable Nurture-branded preview; three configurable offers; verified readiness before live charges/sends; no silent changes to published prices, terms, campaigns, or overrides. A rollback restores configuration, not external side effects.

**Design/media:** canonical N asset and shared tokens; mobile/desktop and keyboard/text-resize testing; readable glass fallbacks; stock provenance and license links; actual browser verification of YouTube/Vimeo/direct playback plus blocked-content cases.

**Reliability:** durable scheduling, current-state rechecks, deduplication, bounded retries, ambiguous-result reconciliation, audit history, and emergency pause. Provider failure cannot break unrelated account/Experience operations.

## 4. End-to-end product acceptance scenario

Use a controlled test organization, test customers/recipients, Stripe test mode, and approved media fixtures. This validates the completed lifecycle across releases; it is not a Release 1-only promise.

1. Provision an organization with Nurture logo, hero/copy/footer, three offer defaults, onboarding, reference Experience, and inspectable lifecycle templates.
2. Replace logo/hero, select a linked stock asset or video, edit bottom matter, and preview multiple viewport sizes without changing the published version.
3. Configure monthly and annual prepaid prices, trial options, and a protected module capability. Check truthful annual savings and actual billing disclosures.
4. Publish only after readiness validation. Confirm another organization and platform administration remain unchanged.
5. Visit anonymously and try the public Experience without exposing the internal pipeline or requiring all lifecycle steps first.
6. Provide lead information with the appropriate permission. Show the relevant acquisition cycle and an explained excluded-recipient case.
7. Register, preserve valid scope/attribution, purchase in test mode, and verify that entitlement comes from trusted payment reconciliation rather than the return URL.
8. Complete the configured onboarding and use the Experience, including optional video with controls/captions/equivalent content and failure fallback.
9. Perform a meaningful module action and submit its validated milestone. The module does not send lifecycle emails itself.
10. Request a premium capability, see an eligible offer, and upgrade. Repeated events/refreshes do not cause a duplicate financial action.
11. Receive one eligible automated survey and submit a versioned response. Verify that a withdrawal or changed eligibility cancels a queued invitation.
12. Become eligible for a referral request under the active program; voluntarily share a non-PII link. A negative-feedback path instead receives the configured support treatment.
13. Register/purchase as the referred test customer. Verify attribution and qualification, then issue the approved test incentive once. Replay the event and simulate a refund/reversal.
14. Exercise renewal, failed payment, cancellation, re-engagement, and win-back paths. Check obsolete-message suppression and clear cancellation behavior.
15. Inspect customer history, automation explanations, audit events, and analytics without leaking private information across tenants or roles.

The Experience developer owns domain actions and meaningful signals only. Nurture owns the surrounding identity, commercial, communications, survey, referral, and retention work.

## 5. Focused acceptance tests

| Test ID | Scenario | Passing evidence |
| --- | --- | --- |
| ACC-01 | Default shell | Real canonical N asset, default content, offers, and usable reference Experience; demo/test state labeled |
| ACC-02 | Organization replacement | Logo, hero, bottom matter, offers, and module settings change only the chosen organization |
| ACC-03 | Draft/version inheritance | Preview differs from published; overrides survive default updates; reset targets a known base version |
| ACC-04 | Identity/scope | Trial continuation and scoped customer linking work; staff/customer/platform authority remain distinct |
| ACC-05 | Monthly/annual offer | Correct amounts, intervals, savings formula, zero-price handling, and test-mode checkout |
| ACC-06 | Entitlement bypass | Direct premium request without a grant fails server-side; stale or duplicated webhook does not grant wrong access |
| ACC-07 | Module portability | Different module fixture registers against the same host and emits accepted namespaced signals |
| ACC-08 | Durable acquisition | Restart during delay preserves work; purchase/opt-out before dispatch suppresses the send |
| ACC-09 | Execution reliability | Duplicate/out-of-order event, timeout, ambiguous provider result, retry exhaustion, and pause are explained and safe |
| ACC-10 | Survey | Versioned answers, valid NPS calculation, private response access, cap/expiry, and double-submit handling |
| ACC-11 | Referral | Attribution policy, qualification, one reward, abuse rejection, refund/reversal, and no private referrer/referred-data leakage |
| ACC-12 | Retention | Reactivation exits win-back; renewal exits reminders; cancellation does not require a survey or offer acceptance |
| ACC-13 | Measurement | Documented units/denominators, currency and annual revenue treatment, late events, and test-data exclusion |
| ACC-14 | Media/providers | All MEDIA-06 cases in [Design and media](design-and-media.md), including YouTube playback and error 153 behavior |
| ACC-15 | Accessible shell | Keyboard/screen-reader labels, visible focus, text enlargement/reflow, contrast, light/dark, reduced motion/transparency |
| ACC-16 | Tenant/security | Negative backend/rules tests for wrong tenant, forged role/customer/offer, direct asset access, and public/private separation |
| ACC-17 | Publish/audit | Readiness validation, failure leaves prior publish intact, safe audit diff, and no claim to undo sent messages/payments |

Record test environment, relevant commit, feature/automation/module version, expected versus actual result, and evidence. A checked box without observed evidence is not completion.

## 6. Decisions the baseline does not settle

| Decision | Proposed owner | Gate / treatment until decided |
| --- | --- | --- |
| Seller/merchant model: who charges the end customer and receives funds | Product + payments owner | No live money movement; do not silently assume one Stripe merchant fits all organizations |
| Platform subscription versus customer offers | Product + platform administration | Keep models and identifiers separate; the old $79/$99/$39 concept is not this product's approved pricing |
| Actual default prices and annual savings | Product + organization configuration | Preview/test examples only; configure approved amounts before live offers |
| Trial duration/payment method, grace period, proration/refunds, renewal/cancellation terms | Product + payments owner | Explicit policy and tested state transitions before billing launch |
| Organization/domain resolution and multiple customer roles | Architecture + identity owners | Use existing domain and validated organization mapping; additional domains need approved verification/routing |
| Outbound market, age/audience restrictions, consent, quiet hours, frequency caps | Product + communications/privacy reviewers | Safe previews; no unapproved external marketing or SMS |
| Durable scheduler mechanism and reconciliation operations | Lifecycle/backend owner | Select within existing infrastructure and test failure behavior before automation launch |
| Final default stock assets, rights, caption/transcript readiness, delivery method | Brand + content/media owners | Linked candidates only until approved; preserve canonical/logo and static fallback |
| Additional video-provider plans and protected paid-media requirements | Media + product owners | YouTube/Vimeo/direct adapters as specified; no promise that public embeds protect private paid content |
| Referral incentive economics, attribution window, refund/reversal and anti-abuse policy | Product + payments/lifecycle owners | Disabled fulfillment until terms and mechanism are approved |
| Survey anonymity and retention/export/deletion policy | Product + privacy/data owners | No unsupported anonymity claim or indefinite default retention |
| Multiple Experiences, arbitrary code, third-party module review | Architecture + platform owner | One trusted primary module initially; no arbitrary-code installation |
| Final acceptance browsers/devices and performance budgets | Frontend + QA owners | Test actual desktop/mobile paths; record budgets before a performance claim |

These are explicit gaps, not reasons to redesign the shell as a business-management product. An implementation can proceed in test mode while the relevant owners settle launch-gated choices.

## 7. Baseline traceability

Every row maps directly to the same-numbered section of the owner's attachment and [product specification](nurture-product-spec.md).

| Baseline / requirement | Delivery emphasis | Contract / test |
| --- | --- | --- |
| 1 / NUR-01 Core model | R1, cross-cutting | ACC-04, ACC-16 |
| 2 / NUR-02 Organization configuration | R1 | ACC-01–ACC-03 |
| 3 / NUR-03 Brand & Site | R1 | DESIGN-01–04, MEDIA-01–06 |
| 4 / NUR-04 Public shell | R1 | ACC-01–ACC-04, ACC-15 |
| 5 / NUR-05 Offers | R1 | ACC-05–ACC-06 |
| 6 / NUR-06 Monthly/annual billing | R1 test; live gated | ACC-05–ACC-06 |
| 7 / NUR-07 Entitlements | R1 | EXP-04, ACC-06 |
| 8 / NUR-08 Experience framework | R1; registry expands R6 | EXP-01–EXP-08, ACC-07 |
| 9 / NUR-09 Default Experience | R1 | EXP-08, ACC-01, ACC-14 |
| 10 / NUR-10 Identity | R1 | ACC-04, ACC-16 |
| 11 / NUR-11 Lead capture | R1/R2 | LIFE-03, ACC-08 |
| 12 / NUR-12 Onboarding | R1/R2 | EXP-02, ACC-04 |
| 13 / NUR-13 Events | R1 contracts; R2 execution | LIFE-02, ACC-09 |
| 14 / NUR-14 Automation | R2 | LIFE-04–05, ACC-08–09 |
| 15 / NUR-15 Acquisition | R2 | LIFE-06–07, ACC-08 |
| 16 / NUR-16 Communications | R2; in-app/SMS expand gated | LIFE-07, ACC-08–09 |
| 17 / NUR-17 Customer records | R2 | LIFE-10, ACC-16 |
| 18 / NUR-18 Upsell | R3 | ACC-06, ACC-09 |
| 19 / NUR-19 Surveys | R4 | LIFE-08, ACC-10 |
| 20 / NUR-20 Survey automation | R4 | LIFE-08, ACC-10 |
| 21 / NUR-21 Referrals | R4 | LIFE-09, ACC-11 |
| 22 / NUR-22 Referral automation | R4 | LIFE-09, ACC-11 |
| 23 / NUR-23 Retention | R3 | LIFE-06, ACC-12 |
| 24 / NUR-24 Win-back | R3 | LIFE-06, ACC-12 |
| 25 / NUR-25 Analytics | Instrument early; expand R5 | LIFE-10, ACC-13 |
| 26 / NUR-26 Admin lifecycle view | R2 state; visualization R5 | LIFE-01, ACC-13 |
| 27 / NUR-27 Permissions | R1, every release | ACC-16 |
| 28 / NUR-28 Platform administration | R1 boundary; expand by feature | ACC-16–ACC-17 |
| 29 / NUR-29 Defaults | R1 foundation; templates by feature | ACC-01, ACC-17 |
| 30 / NUR-30 Inheritance | R1 | ACC-03 |
| 31 / NUR-31 Draft/publish | R1; extend by feature | ACC-03, ACC-17 |
| 32 / NUR-32 Audit | R1; extend by feature | ACC-17 |
| 33 / NUR-33 Integrations | R1, every release | EXP-02, LIFE-05, ACC-09 |
| B2 Apple HIG | Every customer/admin surface | DESIGN-01–04, ACC-15 |
| B3 Nurture brand | Every default surface/module | DESIGN-02–03, ACC-01–03 |
| B4 Stock/video/YouTube | R1 shared media; reuse throughout | MEDIA-01–06, ACC-14 |

## 8. Definition of completion for this documentation change

The canonical specification and supporting contracts must exist in the repository, link to the branding guide and external baselines, preserve all 33 source areas, identify media candidates and YouTube requirements, and be discoverable through README and agent instructions. This documentation change does not deploy or implement the application, send communications, configure payment products, download stock footage, or demonstrate video playback.
