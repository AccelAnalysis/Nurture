# Identity, registration, and onboarding boundary

This directory is the application-skeleton handoff to the Identity, Registration & Onboarding owner.

The skeleton owns only the top-level router/provider composition, generic loading/error presentation, shared brand system, and the existing Firebase client initialization. The Identity owner is authoritative for the authentication state model, production AuthProvider behavior, route guards, registration/recovery flows, profile bootstrap, onboarding model, and guest-to-account transition.

Canonical routes reserved for this feature are:

- `/sign-in` (`/login` remains a compatibility redirect)
- `/register`
- `/forgot-password`
- `/verify-email`
- `/invite/:invitationId`
- `/onboarding/*`

The current forms are reviewable skeleton states, not a finalized identity UX. High-focus forms should remain comparatively quiet/opaque; glass belongs primarily to surrounding chrome and overlays. The shared Nurture brand requirements for 44px touch targets, visible focus, semantic labels, text resizing, reduced motion/transparency, and light/dark behavior apply here from the start.

Feature implementations must continue using the existing `nurture-12398` Firebase project and modular Web SDK through the shared Firebase service boundary. Do not introduce a parallel identity service or enable external providers without project configuration.
