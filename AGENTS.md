# Nurture agent instructions

## Product authority

Before architectural or feature work, read `docs/product/nurture-product-spec.md` and `brand/README.md`. Use `docs/product/README.md` to find the Experience contract, lifecycle model, design/media requirements, and delivery/acceptance gates.

Nurture is **Configurable Shell + Pluggable Experience + Lifecycle Engine**. The Experience can be anything. Nurture owns the lifecycle around it. Nurture defaults become organization-specific through configuration. Do not redefine the shell as a CRM, task manager, business-accountability product, coworking network, or Academy; those may be Experience modules.

The repository specification is authoritative; chat proposes changes. Preserve the specification's source terminology and requirement IDs. Update the relevant specification and acceptance evidence when intentionally changing product behavior. Do not describe target requirements, placeholders, or test fixtures as implemented production capabilities.

## Design and media

Consume canonical `brand/` assets/tokens, including the actual N logo. Apply Apple HIG-inspired interaction and the accessibility/functional-glass rules in `docs/product/design-and-media.md`. Organization overrides must not alter the global Nurture identity or bypass accessibility.

Use linked stock-media provenance and approved provider adapters. YouTube support requires real playback testing, correct URL/origin/Referer handling, provider controls, privacy/load behavior, and unavailable-video fallback; a stored URL is not implementation. Do not use arbitrary iframe HTML or treat public video links as secure paid-content access.

## Firebase

Always look for and use the appropriate official Firebase agent skill before performing Firebase work. The Firebase project for this repository is `nurture-12398`.

Use `npx -y firebase-tools@latest` for Firebase CLI operations rather than a globally installed or unversioned `firebase` command.

For this web app, use classic Firebase Hosting unless the architecture explicitly changes to a framework/SSR requirement that calls for Firebase App Hosting.

Use the Firebase modular Web SDK. Keep Firebase client configuration environment-specific. Never commit server credentials or service-account JSON.

## Payments and communications

Stripe integration must begin in test mode. Keep Stripe secret/restricted keys and webhook secrets server-side only.

Twilio Auth Tokens/API Key secrets and SendGrid `SG.*` API keys are server-side secrets. Never expose them in browser bundles or `VITE_*` environment variables.

Seed usable preview defaults, not unapproved live charges, outbound campaigns, or incentives. Enforce tenant scope and privileges server-side. Recheck current consent and eligibility before delayed actions. Preserve auditability and idempotency for provider events and financial/reward effects.
