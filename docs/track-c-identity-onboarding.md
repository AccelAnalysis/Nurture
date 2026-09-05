# Track C — Identity + Customer Onboarding

**Release:** 1  
**Requirements:** NUR-10, initial NUR-11, NUR-12  
**Branch:** `track-c/identity-onboarding`

Track C owns the transition **Anonymous Visitor → Lead Candidate → Registered Identity → Customer Profile → Onboarding → Participant**. It extends the existing React/Firebase chassis and does not create a second identity service.

## 1. Domain boundaries

| Concept | Track C meaning | Authority / owner boundary |
| --- | --- | --- |
| Firebase `User` | Authentication identity and session. May be anonymous before registration. | Firebase Auth / Track C |
| `CustomerProfile` | Stable Nurture customer-domain record linked to one identity, including a stable `customerId`. | Track C |
| Lead candidate | Identity-scoped acquisition record with optional claimed organization/offer/referral handoff. | Track C capture; trusted tenant linking belongs to lifecycle/backend boundary |
| `OrganizationMembership` | Staff/member authorization for an organization. | Track E; never created by customer profile bootstrap |
| Entitlement | Organization/customer-scoped commercial/Experience access. | Tracks D/B; never inferred from registration or onboarding |
| Onboarding definition/progress | Versioned setup requirements and resumable customer state. | Track C framework; Track A/Track B may provide validated extensions |

The implementation deliberately does **not** treat `Firebase User = Customer = Organization Member`. A stable Customer identifier also does not establish organization authority: organization scope remains explicit on billing, entitlement, data, and authorization records.

## 2. Identity-owned persistence contract

The client uses the existing modular Firestore instance exposed by `src/firebase.ts`; Track C does not provision or change the Firestore database itself.

- `identityCustomers/{identityUid}` — Nurture account/customer profile keyed to the authenticated Firebase UID, with immutable `identityId` and stable namespaced `customerId`.
- `identityLeadCandidates/{identityUid}` — one Release 1 progressive lead candidate for the identity. `organizationIdCandidate` is input context, not tenant authority.
- `identityOnboarding/{identityUid}` — current versioned onboarding progress, answers, and versioned agreement acceptances.

When Firebase is intentionally unconfigured, the same repository interfaces use browser local storage so static/skeleton development remains usable. When Firebase **is** configured, Firestore errors are surfaced; the app does not downgrade silently to local persistence.

### Track E security-rule handoff

Track C intentionally does not add or deploy Firestore rules because organization/tenant security is owned horizontally by Track E and no rules file exists on `main` at this branch's base commit. Track E should authorize these identity-owned documents with server-authoritative identity checks, at minimum:

- only `request.auth.uid == identityUid` can read/write the customer, lead-candidate, and onboarding documents through the client;
- `identityId` must equal the path/auth UID;
- `customerId` and `identityId` are immutable after customer-profile creation;
- customer documents cannot set organization role, platform role, entitlement, subscription, or other privilege-bearing fields;
- claimed `organizationIdCandidate`, offer, and referral values are re-bound/validated before they become trusted lifecycle or tenant state;
- server/admin operations use explicit trusted handlers rather than broadening client rules.

These rules must be covered by Track E's cross-tenant/direct-request negative tests before Release 1 is declared complete.

## 3. Firebase Auth configuration

`firebase.json` declares the Release 1 Auth provider contract: email/password and anonymous Auth. Current Firebase CLI Authentication configuration supports these provider flags; custom authorized-domain state is not encoded here and must be verified separately in the existing project before production authentication is accepted. This is repository configuration only; this branch does not claim the Auth configuration has been deployed.

## 4. Registration and anonymous-to-known transition

`registerAccount` emits `registration.started`, tries to establish/reuse an anonymous Firebase session, captures an identity-scoped lead candidate, and then links email/password credentials to that anonymous identity. Firebase credential linking preserves the UID when anonymous Auth is enabled.

Some Firebase environments may intentionally disable anonymous Auth. In that case, registration still creates the normal email/password account, then creates the lead candidate under the registered UID using the original registration-start timestamp. No parallel local authentication identity is created.

After registration, `customerProfileRepository.getOrCreate` bootstraps a separate customer record. The customer ID is namespaced from the identity UID for deterministic, idempotent Release 1 bootstrap, but the two concepts remain distinct contracts.

## 5. Session and protected-route behavior

`AuthProvider` exposes:

- `firebaseUser` — raw Firebase identity for identity-owned flows only;
- `identity` — provider-neutral session representation;
- `customerProfile` — stable Nurture customer state;
- `currentUser` — compatibility presentation model derived from the customer profile;
- `refreshCustomerProfile` / `updateCustomerProfile` — profile lifecycle methods.

Anonymous Firebase users do not satisfy `AuthenticatedRoute`. `/onboarding/*` requires a registered customer. `/app/*` additionally uses `OnboardingCompleteRoute`, while organization/platform administration retain their independent authorization boundaries.

### Customer scope handoff to Tracks B and D

`CustomerScopeSource` / `customerScopeSource` matches Track B's `ExperienceCustomerSource` request/result shape. It resolves the stable Track C `customerId` even when an `organizationId` is supplied because the completed Track D implementation also consumes that same stored identifier from `identityCustomers/{identityUid}`.

The supplied `organizationId` remains **context, not authority**. Returning a stable `customerId` does not prove organization membership, subscription, entitlement, or data access. Track D stores billing state under explicit organization scope and Track B's entitlement resolver independently checks organization/customer/Experience scope. Track E remains responsible for trusted tenant and capability enforcement.

This convergence avoids inventing a second per-organization customer identity while preserving the required distinction between authentication, customer identity, membership, and entitlement.

## 6. Verification and recovery

Password recovery uses Firebase's reset-email boundary and intentionally does not confirm whether an email exists. `/verify-email` supports resend and explicit status refresh via Firebase `reload`.

Release 1 makes verification available without inventing a universal blocking policy. `identityPolicy.requireEmailVerificationBeforeOnboarding` is `false` by default; an approved organization/Experience policy can make verification a gate through the onboarding contract later.

## 7. Configurable, resumable onboarding

`OnboardingDefinition` supports:

- versioned definitions;
- welcome content;
- required/optional steps;
- typed profile/setup fields;
- profile and account-preference bindings;
- required/optional versioned agreements;
- organization/Experience extensions;
- verification gating;
- completion criteria based on required steps.

The Release 1 default contains Profile → Preferences → Ready. `resolveOnboardingDefinition` accepts namespaced `OnboardingExtension` values from organization configuration or Experience manifests. This keeps Track A and Track B additive and prevents either from replacing the onboarding engine.

Track B integration is now concrete rather than only a type seam:

- `experienceRequirementsToOnboardingExtension` converts a module's declared onboarding requirements into namespaced Track C steps;
- `createExperienceOnboardingBridge` is structurally compatible with Track B's `ExperienceOnboardingBridge`;
- module completion is accepted only for the calling module's declared **current** step;
- undeclared result fields are rejected and only Track C-supported field values are persisted;
- agreement acceptance cannot be asserted by Experience module code and must remain a Nurture/human action;
- step and overall completion emit the same Track C lifecycle signals and update the stable customer profile.

Progress persists after every completed step. Reopening `/onboarding` resumes the first incomplete step. Definition reconciliation preserves matching completed steps, adds new steps, and reopens a required agreement step when its version changes. The repository also supports optional-step skipping and explicit abandoned/incomplete state.

## 8. Lifecycle instrumentation handoff to Track F

Track C emits these lifecycle signals after the corresponding owned action succeeds:

- `lead.created`
- `registration.started`
- `registration.completed`
- `identity.verified`
- `onboarding.started`
- `onboarding.step_completed`
- `onboarding.completed`

Signals include an event ID, schema version, browser occurrence time, correlation/idempotency IDs, identity/customer/lead **hints**, and bounded non-PII payload. They are deliberately labeled `transport: "browser"` and `trust: "client-observed"`; Track C does not assign the persisted lifecycle `source`.

The default `IdentityLifecycleSink` preserves the existing `nurture:lifecycle-signal` compatibility hook. For final composition, `setIdentityLifecycleSink(createIdentityAnalyticsSink(trackAnalyticsEvent))` can bind Track C directly to Track F's completed `trackAnalyticsEvent` API without either feature importing the other's implementation branch. Track F/Track E still bind verified organization scope, `receivedAt`, trusted source, subject, and customer context before persistence.

Instrumentation failure is deliberately non-blocking for registration/onboarding behavior.

## 9. Cross-track handoffs after completed-track review

**Track A — Configuration + Public Shell (PR #7):** Public CTAs may pass `entryPoint`, `organizationId`, `offerId`, `referralCode`, `source`, and a validated `returnTo` into registration. Track A may call `captureInitialLead` for a permitted lead form. It must not write customer profiles directly. No additional Track C change is needed for Track A's published configuration boundary.

**Track B — Experience Architecture (PR #6):** `customerScopeSource` now supplies the stable Customer identifier Track B expects while organization scope remains independent. Track C also supplies the concrete module-requirement adapter and `ExperienceOnboardingBridge`. Experience code never imports Firebase Auth, writes onboarding state directly, accepts agreements, or uses onboarding completion as an entitlement grant.

**Track D — Offers + Billing (PR #10):** Track D now reads `identityCustomers/{identityUid}` and consumes the stored stable `customerId`; Track C therefore does not create a competing organization-Customer record. Billing remains organization-scoped and server-trusted. Registration/onboarding never manufactures subscription state or entitlement, and a checkout return URL cannot grant paid capability.

**Track E — Platform/Security (PR #8):** Track E owns Firestore rules, server-side authorization, audit policy, organization membership, provider ports, and trusted event/auth verification. The identity collections above are the explicit security-rule handoff; Track C does not widen tenant authority to make client persistence convenient.

**Track F — Analytics (PR #9):** Track C exposes a direct structural sink adapter for Track F's `trackAnalyticsEvent`, preserving event/correlation/idempotency IDs and untrusted subject hints. Browser transport cannot establish tenant authority, payment, entitlement, or privileged state.

## 10. Release 1 acceptance evidence

Track C is ready for integration when the combined environment can demonstrate:

1. a public visitor enters registration with handoff context;
2. registration creates/links a Firebase identity and a stable, separate customer profile;
3. sign-in/sign-out/recovery and verification states function against the existing Firebase project configuration;
4. `/app/*` rejects anonymous/unregistered state;
5. onboarding saves each step, survives reload, resumes correctly, and records completion;
6. a declared Experience onboarding requirement can complete only through the Track C bridge and only when it is the current step;
7. the completed customer reaches the participant application in authenticated state;
8. Track D can resolve the same stable customer ID without equating it to the Firebase UID;
9. Track E rules prevent another authenticated UID from reading or mutating these identity-owned records;
10. Track F receives the required lifecycle submissions without treating browser-origin claims as trusted authority.

CI typecheck/build and the integrated Release 1 E2E test remain the merge gates; this branch does not claim Firebase rule deployment or production verification that belongs to the horizontal tracks.
