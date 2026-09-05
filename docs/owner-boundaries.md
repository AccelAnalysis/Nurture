# Nurture owner boundary contract

This document reconciles the application-skeleton contracts supplied by the Public / Marketing, Identity / Registration / Onboarding, Participant / End-User, Organization Administration, and Nurture Platform Administration owners.

## Canonical surface boundaries

```text
/                              Public / Marketing
/sign-in                       Identity (canonical; /login redirects here)
/register                      Identity
/forgot-password               Identity
/verify-email                  Identity
/invite/:invitationId          Identity / organization handoff
/onboarding/*                  Identity / Onboarding reserved boundary
/experience                    Participant shell in public/trial mode
/app/*                         Participant authenticated application
/org/:organizationId/admin/*   Organization Administration
/platform/*                    Nurture Platform Administration
```

Legacy `/org/:organizationId/*` skeleton URLs redirect to the canonical `/org/:organizationId/admin/*` namespace so existing review links continue to work.

## Public / Marketing owner

The `PublicShell` owns only public navigation/footer and public route presentation. It must never surface Firebase health, environment state, internal service names, organization-only navigation, or platform controls.

Public routes apply route-aware title, description, canonical URL, and Open Graph metadata. The shell emits explicit browser events for page view, primary CTA, offer handoff, trial-entry handoff, and identity handoff. This is an instrumentation boundary only; the public layer does not become a customer-lifecycle data store.

## Identity, Registration & Onboarding owner

The app-level router treats identity as a replaceable feature boundary. The Identity owner is authoritative for production authentication state, registration/recovery, invitation acceptance behavior, route guards, profile bootstrap, onboarding state, and the guest/public-to-authenticated transition.

The skeleton continues to provide reviewable placeholder forms and Firebase integration points, but should not deepen identity business logic independently. `/onboarding/*` is reserved explicitly for this owner.

Firebase access continues through the existing modular SDK and the `nurture-12398` project. `src/services/firebase/` is the stable client boundary; no parallel identity service is introduced.

## Participant / End-User owner

`ParticipantShell` accepts session/access information as inputs; it does not own registration or authentication workflows. The same shell supports:

- `trial` mode at `/experience`, with intentionally limited navigation; and
- `authenticated` mode under `/app/*`.

The participant feature contract reserves primary and secondary experience slots and models access mode, entitlements, experience progress, current actions, and the standard loading/empty/unavailable/error/permission-limited/completion states.

Future experience modules register into the participant boundary rather than modifying the public marketing layout or identity flows.

## Organization Administration owner

Organization administration is organization-addressable and canonical under `/org/:organizationId/admin/*`.

`OrganizationProvider` models organizations and memberships separately and exposes organization-specific access resolution. UI authorization uses named capabilities (for example `contacts.manage` or `members.manage`) rather than role comparisons scattered through components. Initial roles map to capabilities; capability checks are the extension point for future role definitions.

Protected organization deep links distinguish:

- unauthenticated;
- organization data unavailable;
- organization not found;
- no active membership; and
- insufficient capability.

The shell shows organization identity and explicit organization scope. Participant and platform navigation remain separate.

### Tenant security test gate

No new production Firestore persistence is enabled by this skeleton. Before organization data persistence is implemented, the Firestore database edition/details must be confirmed using the official Firebase tooling/agent guidance, then Security Rules and emulator tests must prove at minimum that a member of Organization A cannot read or mutate Organization B by changing a URL, organization ID, or document ID.

This test is a release gate for tenant persistence; it is intentionally not faked with a client-only unit test while the production Firestore rules have not yet been authored.

## Nurture Platform Administration owner

Platform administration is a separate security domain under `/platform/*`, with its own shell, navigation, role model, and capability checks. It never lives under an organization URL and never inherits authority from organization ownership.

Reserved destinations:

- `/platform` — Overview
- `/platform/organizations`
- `/platform/access`
- `/platform/product`
- `/platform/billing`
- `/platform/communications`
- `/platform/integrations`
- `/platform/operations`
- `/platform/audit`
- `/platform/settings`

The role model reserves Super Administrator, Administrator, Support, Read Only, and future custom roles. Production platform authority must come from Firebase custom claims or an equivalent server-authoritative mechanism. UI hiding is never sufficient authorization.

Privileged platform operations must ultimately emit audit events containing actor, action, target, timestamp, and relevant context.

## Shared rules across owners

- Public, participant, organization, and platform scope must remain visually and programmatically distinguishable.
- Feature owners consume the canonical Nurture brand system instead of creating local design systems.
- Accessibility requirements are structural: semantic landmarks/labels, visible keyboard focus, 44px default touch targets, text reflow, reduced motion/transparency behavior, and light/dark readiness.
- Stripe, Twilio, and SendGrid secrets remain server-side.
- Firebase authorization and Cloud Functions must enforce privileged operations independently of client navigation.
- Cross-owner handoffs should pass minimal typed context (identity/session, organization access, participant entitlement, referral attribution) instead of importing another owner's internal workflow components.
