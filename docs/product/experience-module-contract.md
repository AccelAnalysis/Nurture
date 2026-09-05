# Experience module contract

**Version:** 1.0.0 · **Date:** 2026-09-05 · **Status:** Target contract, not an implemented SDK  
**Parent requirements:** [NUR-07–NUR-10, NUR-12–NUR-13, NUR-33](nurture-product-spec.md)

B1 requires pluggable Experiences. This document adds a proposed implementation contract without turning Nurture into an arbitrary no-code application builder.

## 1. Ownership

| Nurture host owns | Experience module owns |
| --- | --- |
| Public shell, branding, offers, account identity | The actual application or game behavior |
| Organization/customer scope and access context | Domain-specific views and persisted records |
| Checkout, subscriptions, entitlement derivation | Declared capabilities and quota units |
| Onboarding framework | Minimal required profile/setup inputs |
| Lifecycle orchestration, email/SMS/in-app delivery | Meaningful activity and milestone definitions |
| Surveys, referrals, rewards, retention | Validated domain actions that can produce signals |
| Shared design, media renderer, error boundaries | Accessible module content within the host contract |

An Experience must not implement a second authentication, payment, campaign, survey, or referral engine. It must not assume that every user is a small-business owner or that a pipeline board is the product.

## 2. Registration manifest — EXP-01

Each trusted module declares a manifest with the following information. The table is a contract; it does not imply that a runtime loader already exists.

| Field | Requirement |
| --- | --- |
| `id`, `version`, `contractVersion` | Stable namespaced identifier, module version, and compatible host-contract version |
| `name`, `description`, `icon` | Administrator-facing identity and approved asset reference |
| `routes`, `navigation` | Relative routes and labels, with explicit public/trial/authenticated access modes |
| `configurationSchema`, `defaults` | Typed, validated, versioned configuration; safe default values |
| `capabilities` | Stable feature keys, display descriptions, quota unit if any, and upgrade handoff context |
| `eventDefinitions` | Event name/schema, allowed source, meaning, and any server-validation requirement |
| `profileRequirements` | Named fields, purpose, validation, required/optional status, and sensitivity classification |
| `onboardingRequirements` | Setup steps and completion criteria provided through the host framework |
| `activityDefinition` | What counts as meaningful use; distinguish a page view from successful value delivery |
| `dataContract` | Organization/customer scope, retention/export handling, migration requirements |
| `compatibility` | Host versions, module migrations, and behavior when unavailable or uninstalled |

Configuration is data, not an executable script. Administrators may not paste JavaScript, arbitrary iframe HTML, or vendor credentials into a manifest. A schema change must include a migration or explicitly supported old-version behavior.

## 3. Host context and service boundaries — EXP-02

The host provides current application/organization identity, customer identity when known, authentication status, access mode, locale/timezone preferences, published configuration version, and a presentation snapshot of entitlements. Never include private staff permissions, another customer's profile, or vendor secrets in customer context.

Conceptual host operations:

| Operation | Behavior |
| --- | --- |
| `canUse(capability, operationContext)` | Explain allowed/denied presentation state; protected backend repeats authorization |
| `requestRegistration(returnPath)` | Use the host identity flow and a validated return path |
| `requestUpgrade(capability)` | Open the host's eligible published offer/checkout experience |
| `submitEvent(name, payload, idempotencyKey)` | Validate, bind scope, and ingest through the lifecycle boundary |
| `completeOnboardingStep(step, result)` | Validate step ownership and result before accepting completion |
| `renderMedia(assetReference)` | Use the shared image/video provider adapter and accessibility behavior |
| `reportRecoverableError(code, safeContext)` | Produce a useful state and diagnostic reference without leaking personal data |

These names describe responsibilities, not a promise of a particular library API. Implement typed adapters within the existing repository rather than introducing a second host framework.

## 4. Routes and the participant host — EXP-03

Use the existing participant shell in `/experience` for public/trial entry and `/app/*` for authenticated participation. Register module destinations within these boundaries; do not take over `/platform/*`, organization administration, or identity routes.

Preserve the existing primary/secondary Experience extension points. Start with one selected primary Experience per organization; secondary Experiences are an extension supported by the underlying contract, not a mandatory setup step.

The host is responsible for navigation consistency, browser history, deep-link resolution, focus management after navigation, and standardized loading/empty/unavailable/error/permission-limited/completion states. An Experience crash should not prevent account recovery or cancellation. Unknown module routes must not fall through to another tenant or reveal admin screens.

## 5. Access and entitlements — EXP-04

The manifest may declare, for example, `experience.quiz.extra_sets`, `experience.game.level_pack`, or `experience.admin.export`. Different module domains use the same host services. The actual capability catalog is supplied by the installed module; these examples are not default commercial products.

Each capability identifies whether it is a boolean grant, a usage allowance, or another supported constraint. Metered operations need server-side reservation/consumption and a defined reset period; UI checks alone cannot enforce a quota. Specify retry behavior so an interrupted operation does not consume units twice.

An offer grants capabilities to a customer within the correct organization. Staff roles grant administrative actions and must not be substituted for customer subscriptions. Trial access and public access must be explicit. The backend rechecks scope, entitlement validity, and relevant quota before the protected operation.

When access ends, show a useful explanation and the available upgrade, renewal, export, or read-only path according to published policy. Do not delete domain data automatically because a subscription changed. Never store premium results in a publicly readable record and rely on a disabled button to hide them.

## 6. Events and meaningful activity — EXP-05

Use module events such as `experience.quiz.completed` and host-level events such as `experience.milestone_reached`. Register schemas; preserve the source module/version. Domain events can map to shared lifecycle milestones through explicit configuration.

A browser event may indicate interest or activity, but cannot establish paid status, award a referral incentive, or assert platform authority. For important domain achievements, a trusted backend should validate the underlying action before issuing a verified event. Examples and processing rules are in [Lifecycle model](lifecycle-model.md).

Do not infer a customer's business outcome merely because they clicked a control, opened a video, or remained on a page. Do not send raw documents, secret answers, medical/financial details, or credentials into a generic lifecycle payload. Submit minimal identifiers and documented non-sensitive facts.

## 7. Administrator configuration — EXP-06

Experience settings appear inside Organization Administration and use its draft/preview/publish flow. Show human-readable labels, help, sensible defaults, validation, and only the capabilities the installed module actually supports.

Offer mapping should make access understandable: select a declared capability, see which offers grant it, preview a representative customer's experience, and publish. Publishing brand configuration must not inadvertently change module data or subscription prices.

Do not advertise “create any app without code.” In the first build, developers supply modules and administrators configure supported behavior. A later module marketplace or installation UI needs its own trust, review, version, and rollback policy.

## 8. Isolation, assets, and data — EXP-07

All persisted module data must carry the validated organization/customer boundary. Security rules and trusted server handlers enforce it. Module code must not query unrelated organization records or receive platform-wide service credentials.

Use the shared brand tokens and media model. Organization uploads require file-type/size checks, ownership validation, and sanitization appropriate to the type; imported SVG cannot execute scripts. External provider content is displayed only through approved adapters. Configuration URLs must not become unrestricted server-side fetch endpoints.

Define retention, export, deletion, and migration behavior for module data. Uninstall disables routes and stops relevant future automations without claiming to reverse past charges or sent communications. Installation/version rollback is a separate operation from customer subscription cancellation.

## 9. Reference Experience acceptance — EXP-08

A proposed quiz fixture should let a visitor complete a short public interaction, register without losing valid progress, and use an authenticated activity. It should include one server-protected optional capability and emit one validated milestone. An administrator changes its questions/settings through the schema, not source edits.

The fixture must also use a linked stock image and a supported video in an appropriate optional content location, with failure and accessibility fallbacks. A YouTube clip is an embedding fixture, not paid protected content or a required incentive-generating action.

Acceptance evidence must show both:

1. The fixture receives branding, identity, access, offers, onboarding, surveys, and lifecycle treatment from Nurture.
2. A second minimal module of a different domain can register against the same host contract without adding a second lifecycle engine.

The second module may be a test fixture, not a second commercial application. This is the portability test that keeps “the Experience can be anything” real.
