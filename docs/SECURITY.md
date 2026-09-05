# Security boundaries and release requirements

## Status

The checked-in Firestore rules are a **prototype requiring review**, not a claim of production security certification. They use default deny, private user profiles, active tenant membership checks, verified staff roles, constrained publication reads, and server-only privileged mutations. The Storage rules deny all access because attachment handling is not implemented. Neither rules file is deployed by this change or the existing Hosting-only deployment workflow.

The connected GitHub account was used to inspect and modify the repository. No Firebase Admin credential, service-account file, SendGrid key, Twilio secret, or Stripe secret was read or requested. Live Firebase provider configuration, database edition, and existing deployed rules were not audited. Confirm those with authorized project access before enabling the production flows.

## Trust boundaries

- Firebase Auth establishes identity; a profile, referral candidate, contact, query string, or demo persona does not.
- User profile reads are owner-only. A user cannot set a role, status, default organization, referral reward, billing entitlement, or server-owned attribution by updating the profile.
- Organization reads require an active matching organization and membership. Managers have no team, billing, or reward administration rights. Unknown roles, suspended profiles, inactive memberships, and cross-tenant IDs fail closed.
- All organization mutations are denied to direct clients in this skeleton, including administrators. Frontend service stubs explain this rather than pretending to save production data. Future mutations belong in validated, authenticated Cloud Functions.
- The Firebase Admin SDK bypasses Firestore Rules. Each server handler must authorize the actor and tenant independently and validate schema, ownership, limits, state transitions, and idempotency.
- Published public projections must contain no private contact/member/response data. Public survey submission is a protected service boundary, not `allow create: if true`.
- Billing, subscriptions, benefits, attribution verification, and reward reversals are server-owned. A checkout redirect or client callback is not proof of payment.

## Invitations and referrals

Invitation lookup must return only a minimal invitation view. A future handler should verify a high-entropy, hashed-at-rest, expiring single-use token and the authenticated verified email, then create membership atomically. Never place raw tokens in analytics, application logs, contact notes, or public Firestore documents. Token replay, revoked/expired invitations, changed emails, existing members, and concurrent acceptance need tests.

Referral session data is an untrusted candidate with a 30-day TTL. A link must not add the visitor to an organization or award a benefit. Server resolution and conversion processing must prevent self-referrals, duplicate rewards, replay, campaign manipulation, and reward creation before a qualifying event. Monetary payouts remain out of scope.

## Communication and files

Future dispatch must enforce per-channel and per-purpose consent, suppression/opt-out, quiet hours, verified sender configuration, send limits, and tenant isolation. Template publishing must version the approved body. Provider webhooks require signature validation, replay/idempotency handling, and minimized logs.

The feedback file picker only validates and describes a local attachment; it never uploads one. Before enabling uploads, implement tenant/user-scoped private paths, allowed type and actual content validation, size limits, malware review where appropriate, retention, removal, and access logging. Do not make feedback screenshots publicly readable.

## Configuration and secrets

Firebase browser configuration is environment-specific public configuration, not permission to access protected data. No server secret belongs in a `VITE_*` variable, because Vite embeds these into browser assets. `.env.local`, credential files, private keys, and service-account JSON are ignored.

Demo is an explicit development mode or separate `--mode demo` build. `npm run build` forces production mode and cannot enable demo authorization even when a demo environment flag or session identity is present. URL parameters never switch providers. Demo must not be deployed as production. Production CI uses repository variables for Firebase client configuration, retains the existing secret reference for Hosting deployment, and does not print credentials.

Emulator connections are explicit, local-only, and use project `nurture-12398`. No test contacts live Firestore or Storage. Emulator tests require the emulator host environment variables and fail rather than fall back to production.

## Included checks

Unit tests cover permission boundaries, neutral profile defaults, safe return URLs, referral candidate validation/expiry, sequence validation, survey validation, and unavailable integration adapters. Rules tests cover private profiles, safe self-profile creation/updates, tenant isolation, role escalation, staff/ordinary-member separation, selective public reads, private invitations/responses, billing/reward write denial, anonymous restrictions, and denied Storage access.

Browser tests exercise public/customer/admin routes, demo roles, example workflow edits, mobile layouts, dialogs, and automated accessibility. These checks must pass before review; they do not replace manual review, abuse testing, threat modeling, penetration testing, or screen-reader evaluation.

## Before collecting real data

Review the prototype rules against the actual database edition and every query. Confirm configured providers and authorized domains, configure App Check and backend abuse/rate controls, implement runtime schemas and audit events, establish retention/export/deletion and recovery procedures, and approve the legal/trust content. Enable each integration only with test credentials and emulator/staging verification first.

References: https://firebase.google.com/docs/rules ; https://firebase.google.com/docs/firestore/security/rules-conditions ; https://firebase.google.com/docs/emulator-suite ; https://github.com/firebase/agent-skills .
