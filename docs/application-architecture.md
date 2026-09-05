# Nurture application skeleton architecture

## Purpose

Nurture is a multi-tenant application hub organized around a seven-stage customer pipeline: Marketing → Offers → Registration + Onboarding → App Experience → Secondary Experience → Upsell / Recurring Offer → Feedback + Referral → acquisition again.

The App Experience is deliberately the boundary between public acquisition and the customer lifecycle. An experience may be anonymous, free, or trial-accessible before registration. The public/trial entry now renders inside the same participant shell used by the authenticated application, in a restricted access mode.

See [`owner-boundaries.md`](owner-boundaries.md) for the cross-owner contract governing Public / Marketing, Identity / Onboarding, Participant, Organization Administration, and Nurture Platform Administration.

## Surface and route boundaries

### Public / Marketing
`/`, `/features`, `/how-it-works`, `/offers`, `/offers/:offerId`, `/about`, `/help`, `/contact`, `/privacy`, `/terms`, `/r/:referralCode`, `/survey/:surveyId`.

Public pages own public navigation/footer, route metadata, and handoff analytics only. They do not expose environment health or authenticated administration state.

### Identity, registration, and onboarding
`/sign-in`, `/register`, `/forgot-password`, `/verify-email`, `/invite/:invitationId`, `/onboarding/*`.

`/login` remains a compatibility redirect to `/sign-in`.

### Participant application
`/experience` is the public/trial participant shell.

Authenticated routes are `/app`, `/app/experience`, `/app/secondary`, `/app/offers`, `/app/notifications`, `/app/feedback`, `/app/referrals`, `/app/account`, `/app/profile`, `/app/settings`, `/app/billing`, `/app/help`.

### Organization administration
Canonical routes are under `/org/:organizationId/admin/*`, including overview, dashboard, profile, members, roles, invitations, contacts, lifecycle, sequences, templates, surveys, offers, referrals, feedback, analytics, billing, and settings.

Legacy `/org/:organizationId/*` skeleton links redirect to the canonical `/admin` namespace.

### Nurture platform administration
Platform scope is reserved under `/platform/*`: overview, organizations, access, product, billing, communications, integrations, operations, audit, and settings.

Platform administration is never nested under an organization route.

## Application/provider structure

`src/app/routing/` owns top-level route composition. `src/app/providers/` composes focused providers. Domain owners own the implementation behind their route and context boundaries.

Authentication state remains separate from organization access and platform access. Participant shell components receive session/access inputs rather than embedding registration workflows.

## Authentication architecture

The current `AuthProvider` is a skeleton integration point around Firebase Authentication. `authService` uses the Firebase modular Web SDK and defines email/password sign in/registration, local persistence, password reset, verification, anonymous sign-in, and anonymous-to-registered linking. Google and Apple remain future providers and are not enabled by this skeleton.

The Identity / Registration / Onboarding owner is authoritative for production auth state, route guards, profile bootstrap, onboarding state, and guest-to-account transitions. Demo authentication remains session-only and clearly labeled; it does not write demo records to production Firebase.

## Organization authorization

`OrganizationProvider` models organization membership independently of authentication. Authorization is capability-based (`workspace.view`, `members.manage`, `contacts.manage`, etc.) rather than scattered role comparisons. Initial roles map to capability sets; future role definitions can evolve behind this boundary.

Organization deep links distinguish unauthenticated, data unavailable, not found, no membership, and insufficient permission states.

## Platform authorization

Platform roles and capabilities are independent of organization roles. The skeleton reserves Super Administrator, Administrator, Support, Read Only, and custom-role extension points. Demo platform authority is isolated from demo organization membership.

Production platform authority must come from Firebase custom claims or an equivalent server-authoritative mechanism and be enforced again in Firestore rules / Cloud Functions. Client navigation is never the security boundary.

## Multi-tenancy and proposed Firestore layout

The first persisted implementation should favor tenant-scoped subcollections for organization-owned data:

```text
users/{uid}
organizations/{organizationId}
  memberships/{uid}
  invitations/{invitationId}
  contacts/{contactId}
  sequences/{sequenceId}
  messageTemplates/{templateId}
  surveys/{surveyId}
  offers/{offerId}
  referrals/{referralId}
  feedback/{feedbackId}
  notifications/{notificationId}
surveyResponses/{responseId}
referralRewards/{rewardId}
subscriptions/{subscriptionId}
platformAudit/{eventId}
```

Contacts are not Authentication users. A contact may later carry `linkedUserId` after registration. Public response, referral, billing, and platform audit records can remain top-level when trusted cross-tenant workflows justify it, but must include validated ownership/scope references.

Do not blindly create these collections during skeleton work. TypeScript contracts and repository/service boundaries remain the source of truth until a feature requires persisted data.

## Security Rules requirements

Before production persistence is enabled, rules and emulator tests must enforce:

- users can read/update only permitted profile fields;
- tenant data requires active membership in that exact organization;
- management writes require the required server-authoritative capability/role;
- a member of Organization A cannot read or mutate Organization B by changing URL, tenant ID, or document ID;
- contacts, sequences, templates, surveys, organization offers, and feedback are tenant-isolated;
- public offers/surveys expose only specifically published documents/fields;
- billing state and referral rewards cannot be directly modified by browser clients;
- platform data/actions require server-authoritative platform privileges independent of organization membership;
- role/owner authority must never be accepted from `request.resource.data` alone;
- create and update validation must prevent update bypasses;
- sensitive fields require type, field, array-size, and reasonable string-size validation;
- client UI gating remains usability only, never authorization.

Firestore edition and database details must be confirmed with the official Firebase CLI/MCP workflow before edition-specific rule/index implementation. Real tenant-isolation rule tests are a gate for enabling persistence; the skeleton does not substitute client-only tests for them.

## Public metadata and analytics boundary

Public routes set route-aware title, description, canonical, and Open Graph metadata. The public shell emits browser events for public page view, primary CTA, offer handoff, trial-entry handoff, and identity handoff. A future analytics adapter can subscribe to those events without making the public layer responsible for customer records.

## Participant extension contract

Participant contracts reserve primary and secondary experience module slots and model access mode, entitlements, progress/action state, and standard loading/empty/unavailable/error/permission-limited/completion states.

The public `/experience` route uses `ParticipantShell` in trial mode; `/app/*` uses the same shell in authenticated mode.

## Referral attribution

`/r/:referralCode` captures a non-PII referral code before registration. The attribution service should preserve organization/user/campaign/source context through registration and later conversion. Never encode personal information in the referral URL. Reward qualification and mutation belong on trusted server-side logic.

## Sequences

The UI models `trigger → delay → action` steps. Production execution belongs behind a server-side scheduling boundary using Cloud Functions plus an appropriate scheduling mechanism. A future engine must enforce stop conditions, consent/suppression, quiet hours, tenant time zones, retry/failure states, and frequency caps.

## External integrations

- Stripe checkout, subscriptions, portal sessions, webhooks, and reward-affecting billing events are server-side only.
- Twilio SMS credentials and SendGrid API keys are server-side only.
- Browser code talks to typed service boundaries, never vendor secret APIs.
- Test mode is required when Stripe implementation begins.

## Firebase

The existing project remains `nurture-12398`. The app retains classic Firebase Hosting, the modular Web SDK, and environment-specific browser configuration. `src/services/firebase/` provides a stable feature-facing re-export of the existing client initialization; it does not initialize another Firebase app.

This skeleton does not create another project, enable unconfigured auth providers, deploy collections, or add secrets. Firebase CLI operations must use `npx -y firebase-tools@latest`.

## Incremental implementation order

1. Confirm Firebase Auth providers and Firestore edition/database; implement, audit, and emulator-test Security Rules.
2. Let the Identity owner implement profile bootstrap/onboarding and production guards behind the reserved routes.
3. Persist users, memberships, invitations, tenant switching, and capability assignments.
4. Persist contacts with consent and deduplication/linking.
5. Implement sequences/templates with server-side delivery boundaries.
6. Persist surveys/responses and feedback attachments.
7. Implement Stripe test-mode checkout/subscriptions and server-derived billing state.
8. Implement durable referral attribution/reward qualification.
9. Establish server-authoritative platform claims and platform audit events before privileged platform mutations.
10. Replace demo analytics with aggregation/event instrumentation.
