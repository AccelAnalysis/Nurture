# Nurture product specification

**Version:** 1.0.0  
**Date:** 2026-09-05  
**Status:** Canonical target specification; implementation and acceptance testing are separate work  
**Repository:** AccelAnalysis/Nurture  
**Product authority:** Nurture product owner

> **Nurture is a configurable application foundation.**
>
> 1. The Experience can be anything.
> 2. Nurture owns the lifecycle around the Experience.
> 3. Everything works with Nurture defaults and becomes organization-specific through configuration.

**Architecture: Configurable Shell + Pluggable Experience + Lifecycle Engine.**

## Read this first

The customer comes for an Experience: a game, assessment, administrative application, learning tool, or another digital product. Nurture supplies the reusable commercial and customer-lifecycle infrastructure around it. Neither the customer nor the Experience developer must recreate that lifecycle for every application.

Nurture is **not** intrinsically a CRM, task manager, business-accountability application, coworking service, local referral network, or Academy. Any of those may be an Experience; none is the shell's required business domain. Earlier chat proposals for a small-business operating system are superseded by this definition.

The organization administrator configures a working shell instead of assembling a product from a blank canvas. End customers see that organization's brand, offers, onboarding, and Experience, not pipeline-management terminology. Nurture platform administrators operate the foundation separately from organization administrators.

## Baselines, provenance, and interpretation

- **B1 — Owner attachment:** `Pasted markdown.md`, supplied on 2026-09-05, titled “Nurture is a configurable application foundation”; 33 numbered build sections. Original file SHA-256: `0ea38d5b1864efd5a5bb4a5484a272a770c53bd2a64cd5b82eb1a2b0855260e3`. Sections 1–33 below retain its numbering, scope, and terminology. This is an operational specification derived from the attachment, not a verbatim archival copy.
- **B2 — Apple Human Interface Guidelines:** [HIG](https://developer.apple.com/design/human-interface-guidelines/), interpreted for this responsive web application, not a claim of Apple certification or use of native Apple frameworks. Applicable guidance and web acceptance criteria are in [Design and media](design-and-media.md).
- **B3 — Nurture branding:** [canonical guide](../../brand/README.md), [CSS tokens](../../brand/tokens.css), [JSON tokens](../../brand/tokens.json), and [N logo](../../brand/logo/nurture-n.svg). Guide version reviewed: 0.1.0, dated 2026-09-04.
- **B4 — Owner media requirement:** Use linked stock images and video, including working YouTube embeds and other video-provider options. Concrete media candidates, source/license links, provider behavior, and tests are in [Design and media](design-and-media.md).
- **Existing repository constraints:** [owner boundaries](../owner-boundaries.md), [skeleton architecture](../application-architecture.md), and [agent instructions](../../AGENTS.md), reviewed against commit `4fb9c668f6f790bf654f77d1517645f7f192f557`.

**Interpretation rule:** B1 defines product scope; B2/B3 define design behavior; B4 extends media scope. Existing repository documentation supplies implementation context and security boundaries. This specification takes precedence over older descriptions that make the pipeline itself the customer-facing product. Do not silently replace the source's seven-stage vocabulary with a new funnel.

**Added clarifications:** Security, consent, event reliability, media provenance, publish safeguards, and acceptance criteria below make the baseline buildable. They are explicit engineering/product clarifications, not claims that the attachment specified every mechanism. Proposed release sequencing and unresolved policy choices are labeled in [Delivery and acceptance](delivery-and-acceptance.md).

## Governing constraints

Retain React + TypeScript + Vite, the existing Firebase project `nurture-12398`, classic Firebase Hosting, Cloud Firestore, Firebase Authentication, Cloud Storage, Cloud Functions, Stripe, Twilio, SendGrid, GitHub, and GitHub Actions. Preserve `nurture.accelanalysis.com`. This specification does not authorize a migration, another Firebase project, new production credentials, or deployment.

Use the modular Firebase Web SDK and the existing service initialization. Consult the appropriate [official Firebase agent skills](https://github.com/firebase/agent-skills) before implementation work. Keep vendor secrets server-side; browser `VITE_*` values are not a secret store. Production tenant isolation, financial state, rewards, and platform authority cannot depend on hidden navigation or browser assertions.

Default behavior must be useful and safe: a new organization can preview the complete Nurture shell and reference Experience. Live charges, outbound marketing, SMS, and incentive fulfillment require verified configuration and explicit activation. “Works by default” must not mean fabricated credentials, undisclosed live charges, or unsolicited messages.

**Behavioral design:** Incisive means relevant choices and clear next actions; diligence means reliable execution and visible failures; eagerness means timely, useful invitations without coercion. Do not expose personality scores or turn these principles into a business-management application.

## 1. Establish the Core Platform Model — NUR-01

Define shared entities independent of Experience business logic:

| Entity | Meaning and boundary |
| --- | --- |
| Organization | The operator of a Nurture-powered application; tenant boundary |
| Organization Member | Staff access to that organization; not automatically a customer or platform administrator |
| Customer | An organization-scoped end-customer relationship, optionally linked to an authentication user |
| Experience | An installed, versioned module and its organization-specific configuration |
| Offer | A published commercial package, prices, benefits, and capability grants |
| Entitlement | Server-derived access or usage allowance; not a staff role |
| Subscription | Provider-backed commercial status for the customer and offer |
| Lifecycle State | A projection of the customer's current lifecycle dimensions |
| Lifecycle Event | A scoped occurrence with provenance, version, and a deduplication identity |
| Lifecycle Automation | Versioned trigger, conditions, delays, actions, and stop rules |
| Communication | Template version, recipient eligibility, attempt, and delivery outcome |
| Survey | Versioned questions, eligibility, invitations, and responses |
| Referral | Attribution between referrer and referred customer, qualification, and incentive status |

Support media assets, published configuration versions, consent records, audit events, and execution records as supporting entities. A global authentication account can participate in multiple organizations without sharing its customer history between them. A lead/contact can exist before account registration. Do not collapse visitor, lead, registered user, staff member, and subscriber into one boolean status.

**Done when:** two organizations can operate independently, and a customer or staff identity in one cannot access another's private data by changing an ID.

## 2. Build the Organization Configuration Layer — NUR-02

The organization administrator fills the shell. Preserve these destinations: **Overview; Brand & Site; Offers; Experience; Onboarding; Customers; Lifecycle; Communications; Surveys; Referrals; Analytics; Team & Access; Settings.** Group navigation and use progressive disclosure so a first-time administrator is not presented with every setting simultaneously.

Provide a launch checklist organized around brand, offers, Experience, onboarding, and readiness. Show inherited defaults, organization overrides, unpublished changes, missing prerequisites, and feature availability distinctly. Avoid dead-end controls that imply a feature works when it is a placeholder.

Use the canonical `/org/:organizationId/admin/*` boundary. Preserve existing aliases during route evolution. A launch preview is not a production publish action.

**Done when:** an administrator can launch the reference Experience without learning pipeline methodology or editing application source.

## 3. Build Brand & Site Configuration — NUR-03

Configure application/organization name, canonical default N logo or organization replacement, icon, hero image or supported video, safe color overrides, and light/dark assets. Configure headline, supporting text, primary/secondary calls to action, feature/value sections, optional proof sections, contact details, and bottom matter: copyright, privacy, terms, and organization-defined links.

Use shared brand tokens and logo assets, not a second hand-drawn N or locally invented design system. Stock media must have source and rights metadata. Testimonials cannot be seeded as purported real endorsements. Brand and media changes must be previewable at desktop, tablet, and mobile sizes before publishing.

**Done when:** replacing or resetting an asset updates the correct organization only; missing or failed media has a legible Nurture fallback; published content is unchanged while a draft is edited.

## 4. Build the Public Application Shell — NUR-04

Render the published organization configuration into the public template. Baseline routes include `/`, `/offers`, informational content such as `/about`, `/sign-in`, and `/register`; retain the repository's existing public/identity route ownership. Public/trial Experience entry remains `/experience` using the participant host.

Resolve organization context from an approved domain or explicit application mapping; reject unknown or ambiguous mappings rather than displaying another tenant. Initially use the existing deployment and domain. Multiple custom-domain provisioning is an extension, not permission to migrate infrastructure.

Provide route-specific titles, descriptions, social metadata, accessible navigation/footer, linkable offer details, consent-aware lead capture, and minimal handoff events. Public pages must not expose environment health, private customer information, internal lifecycle controls, or platform administration.

**Done when:** one public template renders two differently configured organizations correctly, including direct links and browser refresh.

## 5. Build Offers and Entitlements — NUR-05

Seed three editable offer levels, conceptually **Entry, Primary, Premium**. Administrators can rename, reorder, disable, edit benefits, configure trials and duration, identify a recommended offer, control visibility, and map offers to Experience capabilities.

Distinguish an offer's marketing benefit text from enforceable entitlements. Support draft and published offer versions and provider price references. Three is the initial default, not a domain constraint on every Experience. Prices in the baseline are examples, not approved production charges.

**Done when:** the three defaults render, can be customized, and cannot grant a capability solely because its name appears in marketing copy.

## 6. Build Monthly and Annual Billing — NUR-06

Support month-to-month subscriptions and annual prepaid billing with a modest administrator-configurable annual incentive. Show the actual charge and billing interval prominently. An equivalent monthly figure must say it is billed annually; never present annual prepayment as monthly installments.

For monthly price `M` and annual prepaid price `A` in the same currency, compute annual savings as `12M - A`, savings percentage as `(12M - A) / (12M) × 100`, and equivalent monthly cost as `A / 12`. Handle zero-price plans without division by zero. Do not advertise savings when `A >= 12M`. Use currency minor units and defined rounding. The baseline example of $49/month and $499/year remains illustrative only.

Use Stripe test mode first. Verify checkout/subscription events server-side; a browser success redirect does not grant paid access. Define effective dates, cancellation, downgrade, failed-payment, refund, and annual-renewal behavior before live billing. Retain old price references for existing subscribers unless an explicit migration is approved. Separate the organization's charges to its customers from any Nurture platform subscription charged to the organization.

**Open gate:** merchant/payment routing, exact default discount, trial/payment-method policy, taxes, and proration are not settled by B1; see the decision register.

## 7. Build the Entitlement Contract — NUR-07

Experience modules declare stable capability keys and any quota semantics. Offers map to those capabilities. The host exposes a typed access check and upgrade handoff. Staff permissions, customer entitlements, onboarding completion, and identity verification are separate dimensions.

Enforce protected operations and data access server-side. Reconcile subscription changes without trusting customer-supplied offer IDs. Handle trial expiration and downgrade predictably without silently destroying customer data. Denials should explain the appropriate next step without revealing protected content.

**Done when:** manually bypassing the UI cannot obtain a premium operation. See [Experience module contract](experience-module-contract.md).

## 8. Build the Experience Module Framework — NUR-08

Formalize module identity, version, icon, routes, navigation, configuration schema, capabilities, events, and customer profile requirements. Nurture supplies identity, tenant/customer context, entitlement checks, common UI, lifecycle submission, and commercial handoffs. The module supplies domain behavior.

Start with trusted, developer-built modules registered in the repository. Administrators select/configure supported modules; this is not an arbitrary-code uploader or a promise to build any game from form fields. Module-registry/install/versioning expansion can follow the initial contract.

**Done when:** a module can be replaced by another kind of Experience without rewriting registration, checkout, surveys, or nurturing. Follow [Experience module contract](experience-module-contract.md).

## 9. Build a Default Experience — NUR-09

Ship a small, useful reference Experience rather than an empty page. A quiz or assessment is a proposed fixture, not Nurture's permanent business domain. Demonstrate public/trial use, authenticated use, configuration, a protected capability, activity/milestone events, and an upgrade handoff.

The same host must support public access before registration and authenticated access afterward. Do not make every customer traverse a forced linear funnel to try the Experience.

**Done when:** an organization can preview the end-to-end shell with default assets and test offers, and module code contains no bespoke payment, identity, survey, referral, or email subsystem.

## 10. Build Customer Identity — NUR-10

Provide registration, sign-in/out, recovery, email verification, account settings, and session management through the existing Identity owner and Firebase Authentication boundary. Retain `/sign-in` as canonical and `/login` as a compatibility redirect.

Preserve safe return paths and tenant scope across sign-in and checkout. Anonymous/trial activity can be linked after identity verification under a defined policy; do not merge customers across organizations merely because emails match. Module code receives context instead of implementing another authentication system.

**Done when:** public-to-authenticated continuation works, invalid sessions receive clear recovery, and no demo identity can authorize production data.

## 11. Build Lead Capture — NUR-11

Support the baseline progression **Anonymous Visitor → Identified Visitor → Lead → Registered Customer → Trial / Subscriber** without making every step compulsory. Forms can request name, email, phone, company, custom fields, and appropriate consent.

Collect only fields needed for the offer or Experience. Track communication permissions separately by channel and purpose, with provenance and withdrawal. Providing an email for an account is not itself a blanket marketing opt-in. Anonymous visitors are not externally contactable until they knowingly supply an address/channel and applicable permissions.

**Done when:** duplicate submissions are safely handled within tenant scope and acquisition messages cannot bypass consent or suppression.

## 12. Build Configurable Customer Onboarding — NUR-12

Configure welcome content, profile fields, questions, agreements, setup actions, module-specific requirements, and completion criteria. Track started, progress, completed, and abandoned/incomplete states with a resumable flow. Version agreements and record acceptance appropriately.

Separate platform/organization setup from customer onboarding. Preserve existing customer progress when admins revise a flow; do not retroactively claim new agreements were accepted. Essential onboarding must not require watching third-party video as its only accessible path.

**Done when:** two Experiences can use different onboarding questions while sharing the same framework and lifecycle events.

## 13. Build the Lifecycle Event System — NUR-13

Represent the baseline events for visitor identification, lead creation, registration, trial, offer view, checkout, subscription, onboarding, Experience use/milestones/premium requests/inactivity, surveys, referrals, renewal, and cancellation. Allow namespaced module events.

Version event schemas and include tenant, subject, occurrence/receipt time, source, and deduplication identity. Validate payloads and minimize sensitive data. Financial, entitlement, and referral-reward events require trusted server provenance. Abandonment and inactivity are derived after a defined interval and recheck, not proof inferred from a closed browser tab.

**Done when:** duplicate, delayed, and out-of-order events cannot double-charge, double-reward, or trigger duplicate lifecycle actions. See [Lifecycle model](lifecycle-model.md).

## 14. Build the Lifecycle Automation Engine — NUR-14

Expose **When X happens, and Y is true, do Z**, with optional delays. Start from editable templates rather than requiring a visual programming canvas. Support enable/disable, dry run, scheduled work, execution history, and clear errors.

Persist delayed work, re-evaluate eligibility at execution, enforce consent and frequency policies, define stop conditions, and cancel obsolete work. Provide retries, an idempotency strategy, failure review, and a pause/kill switch. Do not implement lifecycle scheduling with browser timers.

**Done when:** a queued acquisition message is suppressed when the customer buys before its scheduled send.

## 15. Build Acquisition Cycles — NUR-15

Supply templates for identification, lead-to-registration, registration-to-trial, trial-to-purchase, and abandoned-checkout follow-up. Administrators can edit timing/messages/conditions and enable or disable cycles.

Use on-site prompts for anonymous visitors. External sends require an eligible identified recipient. Exit or change the treatment when the customer purchases, withdraws consent, or no longer qualifies. Do not let parallel sequences create repeated competing asks.

**Done when:** an administrator can preview a cycle, see why a customer qualifies, and inspect why another was excluded.

## 16. Build Communication Infrastructure — NUR-16

Centralize email, optional properly authorized SMS, and in-app messages. Provide sender identity, versioned templates, safe variables, previews, test sends, trigger assignment, delivery status, and customer communication history. Use existing SendGrid/Twilio service boundaries and server-side credentials.

Require sender readiness and verified configuration before live use. Separate transactional service notices from optional promotional cycles; document the applicable policy rather than treating all messages identically. Handle unsubscribes, suppression, bounces, complaints, failures, quiet-hour settings, and cancellation of scheduled marketing. Do not treat delivery as evidence a person read or acted on a message.

**Done when:** tests cannot accidentally send to a production segment, and an admin can diagnose a suppressed or failed message.

## 17. Build Customer Records — NUR-17

Provide a coherent organization-scoped record with identity, offer/subscription status, lifecycle dimensions, onboarding, relevant Experience activity, communications, surveys, referrals, and a minimal event timeline.

This is a lifecycle service view, not a sales CRM that requires manually maintained deal stages. Permission-filter sensitive responses and personal data. Provide correction, export/deletion workflows, and configurable retention policies subject to required operational records. Do not expose one tenant's customer relationship in another tenant's view.

**Done when:** an authorized administrator can understand a customer's treatment history without seeing unrelated organizations or module-private data.

## 18. Build Upsell / Expansion Cycles — NUR-18

Support eligibility based on capability request, usage allowance, milestone, customer tenure, survey response, or an approved segment. Actions include contextual in-app offers and permitted messages. The Experience signals intent; Nurture selects the published eligible offer and handles the upgrade.

Show actual commercial terms, allow dismissal, apply cooldowns, and stop superseded cycles. Do not fabricate scarcity or block a customer's already-purchased core function merely to advertise an upgrade. Promotions are explicit, versioned configuration, not assumed defaults.

**Done when:** a premium request generates an appropriate offer and successful purchase changes server-derived access without module-specific billing code.

## 19. Build Survey Infrastructure — NUR-19

Supply Satisfaction, NPS, Data Gathering, Research, Onboarding Feedback, and Cancellation Feedback templates. Support versioned questions, answer validation, optional text, audience, and accessible presentation.

Keep identifiable and anonymous survey modes distinct. Do not promise anonymity while attaching an identifiable customer profile. Treat responses as private organization data with appropriate access. Use the established NPS question/scoring convention when presenting a metric as NPS, rather than renaming an arbitrary satisfaction score.

**Done when:** responses remain associated with the version answered and changing a survey does not change historical results.

## 20. Build Survey Automation — NUR-20

Configure event/time-based invitation, eligibility, frequency limits, expiry, and follow-up. Baseline examples include a post-onboarding satisfaction request and a later NPS request; their sample delays are templates, not universal defaults.

Survey completion can emit an event and start an appropriate service-recovery or referral treatment. Negative feedback should be actionable to authorized staff, not buried by continued promotional messaging. Do not bias NPS reporting by surveying only satisfied customers; distinguish invitation selection from positive-response referral eligibility.

**Done when:** one customer is not repeatedly surveyed by overlapping cycles, and a response is processed once.

## 21. Build the Referral Engine — NUR-21

Configure eligibility, referrer/referred-person incentives, qualification condition, expiration, limits, messages, and program terms. Give customers a non-PII referral code/link, share action, attribution status, and earned-incentive status.

Track **Referrer → Referred visitor → Registration → Qualification → Reward**. Distinguish a visit or registration from a qualified conversion. Define self-referral, duplicate attribution, refund, abuse, and reward-reversal handling. Use a server-controlled incentive ledger with idempotent fulfillment; reward-provider outages must not issue duplicate incentives.

Do not request uploads of another person's contact list as the default referral flow. Launch incentives only after their terms, cost, and fulfillment mechanism are approved.

## 22. Build Referral Automations — NUR-22

Provide templates following positive satisfaction, high NPS, a milestone, or successful renewal. Apply eligibility and cooldowns; never ask repeatedly merely because several positive events occurred. Referrals remain optional and should not block access to purchased functionality.

Positive-response referral selection must not become public-review manipulation. A referral event enters the same acquisition system for the referred customer without exposing either party's private account details.

**Done when:** multiple qualifying events generate no more than the permitted invitation and a repeated webhook cannot issue a second reward.

## 23. Build Retention Cycles — NUR-23

Recognize declining engagement, inactivity, renewal approaching, failed payment, cancellation requested/completed, and long-term milestones. Experience modules define meaningful activity rather than the shell treating every page load as value.

Distinguish voluntary disengagement from failed payment and genuine cancellation. Preserve a clear cancellation path; feedback and retention offers are optional. Record service-access end separately from the time cancellation is requested.

**Done when:** a cancelled subscription does not receive an active-customer upsell, and a renewed customer exits an obsolete renewal-reminder cycle.

## 24. Build Re-Engagement and Win-Back — NUR-24

Provide configurable cycles for inactive Experience customers, cancelled subscriptions, and abandoned trials. Templates may invite renewed use or describe real changes. Re-evaluate consent, current subscription, cooldown, prior response, and suppression before each action.

Stop on reactivation, purchase, opt-out, expiration, or administrator pause. Do not reset a person's trial or discount eligibility without an explicit policy.

**Done when:** reactivated customers are removed from scheduled win-back messages and the decision is visible in execution history.

## 25. Build Analytics Around the Lifecycle — NUR-25

Cover the attachment's acquisition, commercial, activation, engagement, satisfaction, referral, and retention measures. Clearly distinguish event counts, unique people, subscriptions, cohorts, and time periods. Define denominators and attribution windows before showing conversion or churn.

Annual cash received is not monthly recurring revenue. Separate booked/collected amounts, recurring normalized values, refunds, currency, and test-mode records. Label missing instrumentation as unavailable, not zero. Keep Experience metrics namespaced and separate from provider metrics. Do not display synthetic demo numbers as live results.

**Done when:** each displayed metric has a documented source, time window, unit, scope, and limitation.

## 26. Build Lifecycle Visualization for Admins — NUR-26

The administrator may inspect lifecycle progression; customers must not have to manage it. Preserve the repository's existing seven-stage labels as its internal conceptual map: **Marketing; Offers; Registration + Onboarding; App Experience; Secondary Experience; Upsell / Recurring Offer; Feedback + Referral**, with return loops.

B1 also illustrates eight operational labels from Visitors through Advocates. That illustration is not a replacement seven-stage taxonomy. The source does not define a universal finite-state machine. The added design decision is to model independent customer dimensions and overlay the established stage view, as detailed in [Lifecycle model](lifecycle-model.md).

**Done when:** trial-before-registration, repeat use, renewal, referral, and re-engagement do not require falsifying a single forward-only stage.

## 27. Build Organization Team & Permissions — NUR-27

Model named capabilities for brand, offers, Experience configuration, customer access, lifecycle, communications, surveys, referrals, analytics, billing, and team administration. Role presets map to capabilities. Avoid a universal `admin = true` authorization design.

Restrict publishing, financial actions, exports, incentive changes, and sensitive survey access. Revoke access when membership ends. Authenticated does not mean authorized, and subscribing does not grant organization-administration rights.

**Done when:** server-side checks and security-rule/emulator tests prove tenant and capability isolation, including crafted IDs and direct data requests.

## 28. Preserve Nurture Platform Administration — NUR-28

Keep `/platform/*` and its dedicated layout separate from organization routes. Platform controls include organizations, platform access, trusted Experience modules, global defaults/templates, platform offers, integrations, operations, audit, and settings.

Platform authority is independently server-established. Organization ownership does not confer it. Support access to customer data must be explicitly authorized, scoped, and audited; a global dashboard is not permission to browse all personal information.

**Done when:** organization administrators cannot elevate themselves to platform authority through membership or client configuration changes.

## 29. Build Defaults as First-Class Assets — NUR-29

Provision Nurture brand assets, hero/copy/footer, three offers with monthly/annual structure, identity/onboarding, reference Experience, acquisition/welcome templates, satisfaction/NPS, referral template, retention, and re-engagement defaults.

Represent readiness explicitly: preview/demo, test-configured, or production-enabled. Default legal/contact placeholders and incentive terms must be reviewed before live publication. Default communications are inspectable, but outbound activation is gated. Keep Nurture assets as fallbacks rather than seeding inaccessible external links without an alternative.

**Done when:** no organization begins with an empty shell, and no new organization accidentally sends real campaigns or charges live prices.

## 30. Build Template Inheritance — NUR-30

Use **Nurture default → Organization override** with visible provenance and a reset-to-default action. Record the base template version and each published configuration version.

Added safeguard: platform template improvements can become available to organizations without overwriting their overrides. Public or financially significant behavior must not silently change because a platform template changed. Preview the effective diff and publish a reviewed version, especially for prices, consent/legal text, automations, surveys, and incentives. Define migrations explicitly.

**Done when:** resetting an override restores the selected base version, and updating defaults does not silently alter an active organization's customer commitments.

## 31. Build Publish/Draft Controls — NUR-31

Support **Draft → Preview → Publish** for site/brand/media, offers, onboarding, automations, and surveys. Preserve a published version while edits are in progress. Preview all referenced assets and validate prerequisites before publish. Version rollback is an extension with explicit limits.

Configuration rollback cannot undo a sent message, payment, reward, or accepted agreement. Restoring an old price configuration must not silently migrate live subscriptions. Publish atomically at the configuration boundary and retain audit history.

**Done when:** a failed or incomplete publish leaves the previously published experience intact.

## 32. Build Audit History — NUR-32

Record actor, scope, action, target, time, reason where required, and a safe representation of previous/new values for material administrative changes: price/offer, automation, message, survey, referral incentive, module configuration, and access.

Use version references or redacted diffs for secrets and sensitive data rather than storing them in audit logs. Logs are access-controlled, tamper-resistant through trusted write boundaries, and governed by retention policy. Record manual overrides and emergency pauses.

**Done when:** an authorized reviewer can explain who published or changed an active treatment without exposing credentials or unrelated customer data.

## 33. Integration Layer — NUR-33

Expose typed application-facing interfaces for payments, email, SMS, storage/media, events/analytics, and authentication. Keep vendor SDK details and secrets behind their proper service boundaries. Experience modules use host services, not direct vendor-secret APIs.

Retain existing vendors and project configuration. Define retry, timeout, idempotency, observability, and unavailable-service behavior. Read official provider guidance before implementation; do not assume all provider URLs are embeddable media or all integrations have been activated.

**Done when:** a provider outage produces a clear recoverable state without leaking credentials, corrupting entitlements, or duplicating a financial or communication action.

## Cross-cutting requirements and build handoff

The [Experience contract](experience-module-contract.md), [Lifecycle model](lifecycle-model.md), and [Design and media specification](design-and-media.md) supply the added technical contracts and B2–B4 acceptance details. [Delivery and acceptance](delivery-and-acceptance.md) defines proposed staging, end-to-end tests, and decisions that must be resolved before affected releases.

**Scope boundary:** this specification creates no production features by itself. A feature is complete only when the corresponding acceptance evidence exists. Do not claim that adding an admin menu, demo data, a billing return page, or a provider name satisfies a production capability.

**Change control:** preserve requirement IDs; update the version/date and affected tests when behavior changes. Propose new product domains as Experience modules rather than redefining the Nurture shell.
