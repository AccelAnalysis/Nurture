# Nurture application architecture

## Scope

Nurture is an application hub, not a single hard-coded experience. This skeleton makes the complete seven-stage journey navigable while leaving the scheduler, payment processing, delivery providers, public submissions, invitations, and privileged mutations behind explicit service boundaries.

The existing stack is retained: React, TypeScript, Vite, Firebase Hosting, Firebase Authentication, Cloud Firestore, Firebase Cloud Storage, future Cloud Functions, Stripe, Twilio, SendGrid, and GitHub Actions. The only Firebase project is `nurture-12398`. No infrastructure is provisioned by starting the application.

## Three surfaces

1. **Public/acquisition:** marketing, explanation, offers, public experience, referral landing, survey responses, authentication, help, and trust pages. The header's More menu and footer expose the public directory.
2. **Customer:** authenticated personal hub, primary and secondary modules, offers, notifications, feedback, referrals, profile, account, settings, billing, and help.
3. **Organization:** membership- and capability-gated workspace for contacts, lifecycle, follow-ups, templates, surveys, offers, feedback, analytics, team, settings, and billing.

The primary experience crosses the public/customer boundary. Its container renders at `/experience` without requiring authentication, and at `/app/experience` after registration. Starting a guest identity is explicit, not a prerequisite to viewing public content. Linking an anonymous Firebase identity uses `linkWithCredential`, preserving its UID rather than replacing it. Credential collisions produce a recoverable error; accounts are never silently merged.

The module registry describes a module's slot, access mode, title, and next action. It is an installation boundary, not a mechanism for loading arbitrary remote JavaScript. Future module routes and entitlements must be validated by backend authorization as well as the UI.

## Component and dependency structure

```text
main.tsx
  ErrorBoundary / BrowserRouter
    AuthProvider
      CurrentUserProvider
        ReferralProvider
          OrganizationProvider
            NotificationProvider
              App (lazy route modules)
                PublicLayout → public / authentication pages
                RequireAuth → AppShell → customer pages
                RequireOrganization → AppShell → organization pages

pages → shared components + domain models + service interfaces
services → isolated demo repositories OR modular Firebase SDK
functions/src → server-only ports / deliberately unavailable adapters
```

Providers have distinct ownership. Authentication is not the profile document; the profile is not a membership; a membership is not a contact. Async reads are tied to the current identity and scope, and stale results are cancelled or hidden when that scope changes. Firestore reads are bounded; production pagination belongs in the next repository implementation.

`src/domain` contains SDK-independent UI models. `src/services` owns persistence and integrations. Components do not import Stripe, Twilio, SendGrid, Firebase Admin, or server credentials. `functions/src` describes the trusted implementation contract without exporting deployable handlers or making external calls.

## Roles and authorization

Roles are `owner`, `administrator`, `manager`, and `member`. A capability map is the single frontend navigation policy. Owners and administrators have all initial capabilities; managers can operate contacts, outreach, surveys, offers, analytics, and feedback but cannot administer members, organization settings, referrals, or billing. Members see only the customer app. Unknown and inactive roles fail closed.

A verified email, active profile, active organization, active membership, and appropriate capability are required for the admin shell. Route guards are a usability layer only. Firestore Rules enforce the equivalent data boundary; future Cloud Functions must independently validate context because the Admin SDK bypasses those rules.

## Referral loop

`/r/:referralCode` captures a bounded first-touch candidate in session storage for up to 30 days. Registration and onboarding preserve it. It is labelled **pending verification** and is not an organization membership, discount, reward, or trusted conversion.

The future attribution service must resolve the opaque code, validate expiry and campaign, attach an immutable server-side referral, and process qualifying conversions idempotently. No PII is placed in referral URLs. Attribution storage has a clear action under public preferences. Blocking browser storage does not stop navigation; it can prevent attribution persistence.

## Sequences and communication

The sample follow-up occurs on day 0, 2, 7, 21, and 45 **from the triggering experience completion**, not cumulatively after the prior step. The editor states this explicitly. A step carries channel/action, template and resource references, purpose, and skip conditions. A sequence carries version, trigger, quiet hours, IANA time zone, daily limit, stop conditions, draft/published state, and enabled state.

Publishing in demo mode changes a fictional configuration only. Production publishing, enrollment, scheduling, retries, cancellation, and delivery are unavailable. The future dispatcher must re-check consent, suppression, tenant, frequency caps, time zones, and eligibility at dispatch time, not merely at enrollment.

Messages are escaped text previews with template variables; no user-authored HTML is executed. Email and SMS purpose and consent are separate. Contact consent defaults to unknown, never inferred from attendance, import, survey submission, account creation, or invitation acceptance.

## UI and accessibility

The design adapts Apple's hierarchy, clarity, restraint, familiar controls, and progressive disclosure to semantic web controls. It does not impersonate a native Apple app. Shared CSS variables support light, dark, and system themes. Desktop navigation uses a sidebar; mobile navigation exposes three frequent destinations plus a complete More dialog. Controls have visible focus states, approximately 44-pixel targets, labels, keyboard support, and reduced-motion support. Tables have captions, keyboard-accessible overflow, and meaningful empty states. Dialogs use native focus containment and restore focus on closing.

Automated accessibility checks and representative viewport tests are included. They are not an accessibility certification; screen-reader, zoom, reduced-motion, and real-device evaluation remain release requirements.

## Deliberate limits

Demo records are fictional and edits are memory-only. A reload resets edits; session identity and referral candidate can persist within the tab. A production build cannot enable demo mode through URL parameters or stored demo credentials. Public content remains usable with missing Firebase config; authentication shows an actionable configuration error instead of silently signing in a sample identity.

The privacy and terms pages are clearly marked editorial placeholders, not approved legal policies. Contact delivery, data export/deletion, billing, attachments, and advanced analytics are explicitly unavailable where not implemented. No action claims a live message, payment, invite, or upload occurred.

## Guidance consulted

- Apple Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- React documentation: https://react.dev/reference/react
- React Router: https://reactrouter.com/start/declarative/routing
- Official Firebase agent skills: https://github.com/firebase/agent-skills
- Firebase modular Web SDK: https://firebase.google.com/docs/web/setup
- Anonymous account linking: https://firebase.google.com/docs/auth/web/anonymous-auth

See [Firestore architecture](FIRESTORE.md), [security boundaries](SECURITY.md), [route tree](ROUTES.md), and [implementation status](IMPLEMENTATION_STATUS.md).
