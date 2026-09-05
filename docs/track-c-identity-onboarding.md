# Track C — Identity + Customer Onboarding

**Release:** 1  
**Requirements:** NUR-10, initial NUR-11, NUR-12  
**Branch:** `track-c/identity-onboarding`

Track C owns the transition **Anonymous Visitor → Lead Candidate → Registered Identity → Customer Profile → Onboarding → Participant**. It extends the existing React/Firebase chassis and does not create a second identity service.

## 1. Domain boundaries

| Concept | Track C meaning | Authority / owner boundary |
| --- | --- | --- |
| Firebase `User` | Authentication identity and session. May be anonymous before registration. | Firebase Auth / Track C |
| `CustomerProfile` | Stable Nurture customer-domain record linked to one identity. | Track C |
| Lead candidate | Identity-scoped acquisition record with optional claimed organization/offer/referral handoff. | Track C capture; trusted tenant linking belongs to lifecycle/backend boundary |
| `OrganizationMembership` | Staff/member authorization for an organization. | Track E; never created by customer profile bootstrap |
| Entitlement | Commercial/Experience access. | Tracks D/B; never inferred from registration or onboarding |
| Onboarding definition/progress | Versioned setup requirements and resumable customer state. | Track C framework; Track A/Track B may provide validated extensions |

The implementation deliberately does **not** treat `Firebase User = Customer = Organization Member`.

## 2. Identity-owned persistence contract

The client uses the existing modular Firestore instance exposed by `src/firebase.ts`; Track C does not provision or change the Firestore database itself.

- `identityCustomers/{identityUid}` — customer profile keyed to the authenticated Firebase UID, with immutable `identityId` and stable namespaced `customerId`.
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

`firebase.json` declares the Release 1 Auth provider contract: email/password and anonymous Auth are enabled, with localhost plus the existing Firebase Hosting and `nurture.accelanalysis.com` domains authorized. This is repository configuration only; this branch does not claim the project-side Auth configuration has been deployed.

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

Progress persists after every completed step. Reopening `/onboarding` resumes the first incomplete step. Definition reconciliation preserves matching completed steps, adds new steps, and reopens a required agreement step when its version changes. The repository also supports optional-step skipping and explicit abandoned/incomplete state.

## 8. Lifecycle instrumentation handoff to Track F

Track C emits typed browser signals on `window` using the `nurture:lifecycle-signal` event name:

- `lead.created`
- `registration.started`
- `registration.completed`
- `identity.verified`
- `onboarding.started`
- `onboarding.step_completed`
- `onboarding.completed`

Signals include a signal ID, schema version, browser occurrence time, session correlation ID, applicable identity/customer/lead IDs, and bounded non-PII properties. They are deliberately labeled `source: "browser"` and are **not** stored as authoritative lifecycle events by Track C. Track F/the trusted lifecycle service must bind verified organization scope, `receivedAt`, trust/source classification, idempotency semantics, and any server-validation result before persistence.

## 9. Cross-track handoffs

**Track A — Configuration + Public Shell:** Public CTAs may pass `entryPoint`, `organizationId`, `offerId`, `referralCode`, `source`, and a validated `returnTo` into registration. Track A may call `captureInitialLead` for a permitted lead form. It must not write customer profiles directly.

**Track B — Experience Architecture:** Consume the provider-neutral customer/session boundary and supply minimal setup requirements through `OnboardingExtension`. Do not import Firebase Auth inside an Experience module. Do not use onboarding completion as an entitlement grant.

**Track D — Billing:** Registration/onboarding never manufactures subscription state or entitlement. A checkout return can land in onboarding, but paid capability still follows the trusted billing → entitlement path.

**Track E — Platform/Security:** Own Firestore rules, server-side authorization, audit policy, and organization membership. The identity collections above are the explicit rule handoff.

**Track F — Analytics:** Listen for/ingest the typed lifecycle signals through the common event envelope. Browser signals may describe activity but cannot establish payment, tenant authority, or privileged state.

## 10. Release 1 acceptance evidence

Track C is ready for integration when the combined environment can demonstrate:

1. a public visitor enters registration with handoff context;
2. registration creates/links a Firebase identity and a stable, separate customer profile;
3. sign-in/sign-out/recovery and verification states function against the existing Firebase project configuration;
4. `/app/*` rejects anonymous/unregistered state;
5. onboarding saves each step, survives reload, resumes correctly, and records completion;
6. the completed customer reaches the participant application in authenticated state;
7. Track E rules prevent another authenticated UID from reading or mutating these identity-owned records;
8. Track F receives the required lifecycle signals without treating browser-origin claims as trusted authority.

CI typecheck/build and the integrated Release 1 E2E test remain the merge gates; this branch does not claim Firebase rule deployment or production verification that belongs to the horizontal tracks.
