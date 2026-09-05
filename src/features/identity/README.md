# Identity, registration, customer profile, and onboarding boundary

Track C is authoritative for the transition from anonymous/lead state into a registered Nurture customer and completed onboarding. The top-level router/provider composition, shared visual system, participant shell, organization authorization, billing, and Experience capability rules remain outside this feature.

## Implemented Release 1 boundary

- `/sign-in` with `/login` compatibility redirect.
- `/register`, password recovery, `/verify-email`, sign-out, and persistent Firebase Auth sessions through the existing modular Web SDK.
- Anonymous Firebase identity linking when available, so a permitted lead candidate can become a registered identity without throwing away the guest UID.
- A distinct `CustomerProfile` bootstrap. A Firebase `User` is authentication identity; the customer profile is Nurture domain state; `OrganizationMembership` remains a separate authorization concept.
- Identity-owned storage adapters for customer profile, lead candidate, and onboarding progress. When Firebase is not configured, local storage supports non-production skeleton/demo development. A configured Firebase environment does not silently fall back after a Firestore error.
- Versioned, resumable onboarding with profile/preference fields, agreement-version support, optional-step support, incomplete/abandoned state support, and completion gating before `/app/*`.
- Typed browser lifecycle signals for `lead.created`, `registration.started`, `registration.completed`, `identity.verified`, `onboarding.started`, `onboarding.step_completed`, and `onboarding.completed`.

## Cross-track contracts

Other feature owners should import authentication from `features/identity/auth` rather than importing the Firebase client directly. Public/acquisition surfaces may call `captureInitialLead`; Experience/configuration owners extend onboarding through `OnboardingExtension` and `resolveOnboardingDefinition` rather than replacing the flow.

Browser lifecycle signals are observations, not trusted persisted lifecycle events. Track F/the lifecycle ingestion boundary must bind verified organization/customer context and server receipt metadata before persistence. Candidate organization IDs captured during acquisition are deliberately named as candidates and must not confer tenant authority.

Track E must own the Firestore security rules and server-side authorization for the identity collections described in `docs/track-c-identity-onboarding.md`. Track C does not create organization memberships, entitlements, or platform roles.
