# Implementation status

## Implemented foundation

Responsive public/customer/organization shells; lazy route modules; reusable UI components; private and role-based navigation guards; modular Firebase initialization; explicit emulator configuration; Auth state persistence, email/password operations, reset and verification, anonymous credential linking; separate auth/profile/organization/referral/notification providers; domain interfaces; tenant-scoped read repositories; own-profile persistence; bounded and expiring referral candidate capture; and controlled demo editors for contacts, sequence timing, message templates, surveys, offers, profile/settings, feedback, and invitation states.

Demo uses fictional fixtures and memory-only edits. The guide offers four perspectives so reviewers can inspect both permitted and denied screens. Published demo public surveys can collect fictional responses in memory; an admin preview does not submit a response.

## Explicitly unavailable in production

Organization provisioning; membership writes and invitation resolution/acceptance/delivery; organization CRUD; survey publishing and public response submission; contact import; automated scheduling/enrollment/dispatch; message delivery and provider configuration; Stripe checkout/portal/subscription changes; verified referral conversions and rewards; file uploads; feedback submission/review mutations; notification mark-read writes; data export/deletion; deep analytics; legal policy approval.

These actions render useful context or a typed feature-unavailable error instead of fabricating success. Their interfaces identify the future trusted integration point. No Stripe/Twilio/SendGrid client or external campaign is connected. No AI, native apps, enterprise SSO, or warehouse is introduced.

## First implementation increments

1. Confirm live Firebase configuration, database edition, existing deployed rules, authorized domains, and enabled providers. Review prototype rules and approve trust content. Add runtime read/write schemas.
2. Implement emulator-tested organization creation and verified, single-use invitation acceptance atomically, including role hierarchy and audit events.
3. Enable bounded contact CRUD, consent evidence and deduplication, profile/contact linking, and cursor-based queries. Avoid any implicit membership grant.
4. Add versioned template/survey publishing and safe public response submission with App Check and abuse controls. Enable private feedback upload/submission only after retention and storage review.
5. Implement the sequence engine with idempotency, quiet hours, suppression, consent, cancellation, retries, and delivery health; begin with provider test/sandbox modes.
6. Add Stripe test-mode checkout and verified webhook projections, then server-verified referral attribution/rewards and aggregate lifecycle events.

## Release gates

Passing CI does not mean the skeleton is ready to onboard real organizations. The legal pages and unavailable workflows are release blockers for those features. Production rollout requires security review, provider setup, operational monitoring, accessibility review, retention/deletion/export policy, and verified authorization tests for each implemented mutation.
