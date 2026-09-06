# Post-Release 6 — Branded Communications Infrastructure

Status: implementation branch, hold for reconciliation after Release 6 promotion
Branch: `post-r6/branded-communications`
Draft PR: #48

This track extends Nurture's existing Release 2 email communications foundation so organizations can operate lifecycle communications under their own brand identity across email and SMS.

## Release 6 boundary

This work intentionally does not modify or redefine Release 6-owned ecosystem contracts, host/runtime compatibility, module trust and platform governance, reusable module templates/configuration, registry/installation lifecycle, controlled upgrades/migrations, portability certification, version-aware observability, or R6 finisher acceptance. The branch must be rebased/reconciled after Release 6 lands before merge.

## Promise owned here

- self-service organization email-domain onboarding
- automated provider domain-authentication provisioning and verification state
- organization branded tracking/link domains
- Reply-To identity and inbound email routing contracts
- SMS provider abstraction and Twilio implementation
- dedicated organization SMS number provisioning
- organization A2P/10DLC registration state and submission contracts
- inbound SMS routing
- STOP/START/HELP handling with organization-scoped preference effects
- international alphanumeric sender selection strategy
- administrative/readiness APIs and tests

## Existing foundation reused

This work preserves the current organization-scoped communication templates, sender readiness, consent evaluation, suppressions, SendGrid outbound delivery, provider webhooks, lifecycle outbox, and audit model. New infrastructure must plug into those seams rather than create a parallel communication engine.
