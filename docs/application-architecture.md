# Nurture application skeleton architecture

## Purpose

Nurture is a multi-tenant application hub organized around a seven-stage customer pipeline: Marketing → Offers → Registration + Onboarding → App Experience → Secondary Experience → Upsell / Recurring Offer → Feedback + Referral → acquisition again.

The App Experience is deliberately the boundary between public acquisition and the authenticated customer lifecycle. An experience may be anonymous, free, or trial-accessible before registration.

## Surfaces

### Public
`/`, `/features`, `/how-it-works`, `/offers`, `/offers/:offerId`, `/experience`, `/about`, `/help`, `/contact`, `/privacy`, `/terms`, `/r/:referralCode`, `/survey/:surveyId`.

### Authentication
`/login`, `/register`, `/forgot-password`, `/verify-email`, `/invite/:invitationId`.

### Customer app
`/app`, `/app/experience`, `/app/secondary`, `/app/offers`, `/app/notifications`, `/app/feedback`, `/app/referrals`, `/app/account`, `/app/profile`, `/app/settings`, `/app/billing`, `/app/help`.

### Organization administration
`/org/:organizationId`, `/dashboard`, `/profile`, `/members`, `/roles`, `/invitations`, `/contacts`, `/contacts/new`, `/contacts/:contactId`, `/lifecycle`, `/sequences`, `/templates`, `/surveys`, `/offers`, `/referrals`, `/feedback`, `/analytics`, `/billing`, `/settings` under the organization prefix.

## Authentication architecture

`AuthProvider` owns authentication state only. `OrganizationProvider` owns current tenant/membership/permission state separately. `authService` uses the Firebase modular Web SDK and defines email/password sign in/registration, local persistence, password reset, verification, anonymous sign-in, and anonymous-to-registered linking. Google and Apple remain future providers and are not enabled by this skeleton.

Demo authentication is session-only and clearly labeled. It does not write demo records to production Firebase.

## Multi-tenancy and proposed Firestore layout

The first implementation should favor tenant-scoped subcollections for organization-owned data:

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
```

Contacts are not Authentication users. A contact may later carry `linkedUserId` after registration. Public response, referral, and billing records can remain top-level when cross-tenant processing or server-side workflows justify it, but must include validated ownership/tenant references.

Do not blindly create these collections during skeleton work. TypeScript contracts and repository/service boundaries are the source of truth until each feature requires persisted data.

## Security Rule requirements

Before production persistence is enabled, rules must enforce:

- users can read/update only their permitted profile fields;
- tenant data requires active membership in that exact organization;
- management writes require an authorized role/capability;
- contacts, sequences, templates, surveys, organization offers, and feedback are tenant-isolated;
- public offers/surveys expose only specifically published documents/fields;
- billing state and referral rewards cannot be directly modified by browser clients;
- role/owner authority must never be accepted from `request.resource.data` alone;
- create and update validation must be symmetric enough to prevent update bypasses;
- sensitive fields require type, field, array-size, and reasonable string-size validation;
- client UI role gating is usability only, never an authorization boundary.

Firestore edition and database details must be confirmed with the Firebase CLI/MCP before writing edition-specific rule/index implementation, per the official Firebase Firestore agent skill.

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

The existing project remains `nurture-12398`. The app retains classic Firebase Hosting, the modular Web SDK, and environment-specific browser configuration. This skeleton does not create another project, enable unconfigured auth providers, deploy collections, or add secrets. Firebase CLI operations must use `npx -y firebase-tools@latest`.

## Incremental implementation order

1. Confirm Firebase Auth providers and Firestore edition/database; implement and audit Security Rules.
2. Persist users, memberships, invitations, and tenant switching.
3. Persist contacts with consent and deduplication/linking.
4. Implement sequences/templates with server-side delivery boundaries.
5. Persist surveys/responses and feedback attachments.
6. Implement Stripe test-mode checkout/subscriptions and server-derived billing state.
7. Implement durable referral attribution/reward qualification.
8. Replace demo analytics with aggregation/event instrumentation.
