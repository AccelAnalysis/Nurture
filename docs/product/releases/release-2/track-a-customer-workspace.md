# Release 2 Track A — Customer Workspace and Lifecycle Configuration

## Status

Track A implementation branch: `release-2/track-a-customer-workspace`.

Provisional dependency base: `2e06f3615e37471f3b484ca1ae73490e42b42b95`, the current head of `release/1-integration` / PR #13 when Track A was created. PR #13 is still an open Release 1 integration PR and its own finisher record explicitly says it is not full Release 1 product acceptance. This Track A handoff therefore does **not** claim an accepted `R1_BASE_SHA`; the Release 2 finisher must rebase/retarget if the Release 1 finisher names a different accepted commit.

No deployment, Firebase rules/index change, live outreach activation, Stripe mode change, provider send, or production data migration is performed by Track A.

## Owned implementation

Track A owns the presentation and bounded configuration files added under:

- `src/features/customer-workspace/*`
- `src/features/lifecycle-admin/*`
- `src/features/configuration/extensions.ts`
- `src/features/release2-track-a/integration.ts`
- this handoff document

Track A deliberately does not modify finisher-owned `AppRouter.tsx`, shared shell/navigation composition, root dependencies/lockfiles, Firebase deployment files, Functions export entrypoint, or shared CI.

## Customer workspace

`CustomerWorkspacePort` is the Track A composition boundary. The pages never write lifecycle state, consent, subscription state, entitlement, event history, communication status, or automation state directly. The final authoritative adapter must compose:

- Track C: `OrganizationCustomerRelationship`, `OrganizationCustomerProfile`, organization-scoped onboarding progress, and consent facts.
- Track F: tenant-scoped lifecycle summary and timeline projection/query contracts once F lands them.
- Track D: email eligibility/readiness and `MessageDeliveryRecord` summaries.
- Track E: acquisition enrollment/job explanation summaries.
- Release 1 trusted billing: offer/subscription summary only; customer access continues to come from the accepted commercial/entitlement path.

The list supports bounded pagination (default 25, hard maximum 50), supported name/email/customer-ID search, and filters for identity, onboarding, commercial, Experience, and communication dimensions. Unknown and unavailable are first-class values. Detail shows customer/contact fields, trusted billing summary, onboarding progress, Experience first use/milestones, communication eligibility/history, acquisition enrollment/next action/reason, and a filterable tenant-scoped timeline. Surveys and referrals are explicitly unavailable in Release 2; no pretend responses or rewards are generated.

The local fixture includes the same fictional email/identity in two organizations with different organization-customer state. The adapter test proves a changed organization/customer ID cannot read the other fixture relationship or timeline.

## Lifecycle configuration

`LifecycleAutomationPort` is an async command/query boundary for Track E-owned automation validation/execution. Track A does not implement the durable worker, event enrollment, dispatch admission, provider send, or pause security.

The UI is intentionally bounded to the six Release 2 catalog IDs:

- `R2-WELCOME`
- `R2-LEAD`
- `R2-ACTIVATE`
- `R2-ONBOARD`
- `R2-TRIAL`
- `R2-CHECKOUT`

After Track E began implementation, Track A reconciled its fixture projection to E's canonical `ACQUISITION_CATALOG`: the predicate keys, required stop rules, trigger/source wording, and schedule kinds now mirror E's `shared/acquisition/catalog.ts`. E's `validateAcquisitionDefinition` remains authoritative; Track A's `validateLifecycleDraft` exists only for immediate bounded UX feedback.

Track D's current template IDs are also used by the fixture: `registration-welcome`, `lead-follow-up`, `activation-invitation`, `onboarding-reminder`, `trial-conversion`, and `checkout-recovery`. The integration adapter must map D's `transactional` purpose to E/A `service`, and D's `marketing` purpose to E/A `promotional`; the UI must not let a template-purpose mismatch bypass eligibility.

Defaults are all disabled. Draft saving and publication are separate async operations. A new saved draft does not mutate the currently published immutable snapshot in the demo adapter. No success notice is rendered until the awaited command returns successfully. Read-only membership disables editing/publishing in the UI, while the real E adapter must independently authorize every command server-side.

Final sender readiness, current consent, provider suppression, organization/platform/automation pause, customer existence, commercial eligibility, frequency/expiry, and current purchase/onboarding/activation state are shown as non-removable D/E runtime safety. Track A does not turn those checks into optional browser predicates.

## Configuration extension coordination

Track A extends the existing opaque configuration map only through generic set/remove helpers that preserve every sibling extension. It consumes Track C's actual key exactly as defined on C's branch:

- `onboarding:customer-foundation`, namespace `nurture.onboarding`, schema version `2`.

Track A owns `lifecycle:acquisition` / `nurture.lifecycle.acquisition` schema version `1` as its UI draft representation. Track D had not defined a configuration-extension key at the time of this handoff, so Track A intentionally does not invent one; the generic extension map test proves an arbitrary D-owned extension survives lifecycle writes/removal unchanged.

## Integration requirements for the Release 2 finisher

Wire these destinations in the finisher-owned router/navigation after the authoritative adapters are available:

- `/org/:organizationId/admin/customers` → `CustomerWorkspaceListPage`
- `/org/:organizationId/admin/customers/:customerId` → `CustomerWorkspaceDetailPage`
- `/org/:organizationId/admin/lifecycle` → `LifecycleConfigurationPage`
- optional `/org/:organizationId/admin/lifecycle/runs` → the same lifecycle page with `initialTab="Run history"`

Recommended compatibility redirects after the old demo surfaces are retired:

- `/org/:organizationId/admin/contacts` → `/org/:organizationId/admin/customers`
- `/org/:organizationId/admin/sequences` → `/org/:organizationId/admin/lifecycle`

Use canonical capabilities already present in `shared/platform/authorization.ts`:

- customer list/detail: `customers.view`
- lifecycle read: `lifecycle.view`
- lifecycle draft/publish controls: `lifecycle.manage`

Pass `canManage={access.can("lifecycle.manage")}` to `LifecycleConfigurationPage`, but do not treat that UI flag as authorization. The production `LifecycleAutomationPort` must call E's authorized server commands. Install real adapters once during application composition with `installAuthoritativeCustomerWorkspacePort(...)` and `installAuthoritativeLifecycleAutomationPort(...)`.

## Actual cross-track state observed during implementation

- Track B PR #15 is open and uses the same provisional Release 1 base. It supplies typed Experience activity/milestone evidence and expects E/F/C composition.
- Track C PR #16 is open and supplies customer/onboarding/consent domain contracts and server persistence code. Its PR notes production definition reading still needs A's durable published-configuration reader.
- Track D branch is ahead of Release 1 and supplies communication template IDs, eligibility/readiness, delivery records, SendGrid adapter/webhook, and server admin primitives.
- Track E branch is ahead of Release 1 and supplies the canonical bounded acquisition catalog/runtime contracts and trusted event append primitives.
- Track F branch had no commits beyond Release 1 when checked, so the final `CustomerLifecycleSummary`/timeline projection query is still an integration blocker for a real customer workspace adapter.

## Demo versus real behavior

Local Vite demo mode (`import.meta.env.DEV && VITE_ENABLE_DEMO=true`) may use Track A's fictional customer and lifecycle fixtures so the UI and boundary tests are reviewable before all other tracks merge. Outside local demo mode both Track A ports fail closed until authoritative adapters are installed. Production does not fall back to the Release 1 `demoContacts`, localStorage, sessionStorage, or an A-owned customer/event collection.

## Schema, migration, indexes, external configuration

Track A adds no Firestore collection, rule, index, Function, secret, scheduler, provider configuration, or migration. C/F/D/E own those domains. The Release 1 backend provisioning blockers documented by PR #13 remain external prerequisites for real persistence/provider acceptance.

## Tests and runnable acceptance scenario

Track-owned automated checks:

```bash
npm test -- src/features/configuration/extensions.test.ts src/features/customer-workspace/port.test.ts src/features/lifecycle-admin/port.test.ts
npm run typecheck
npm run build
```

The focused test scenario proves:

1. the same fictional identity can have separate customer state in two organizations without cross-tenant reads;
2. search/filter/pagination remain bounded and tenant-scoped;
3. lifecycle drafts cannot remove required E predicates or inject unsupported predicates;
4. saving a draft does not mutate the published version;
5. stale draft commands are rejected;
6. an onboarding extension and a D-owned communications extension survive lifecycle extension writes/removal.

Combined UI acceptance remains dependent on the finisher-owned route wiring and the real C/F/D/E adapters. Track A must not be reported as production-complete solely from the local fixtures or green isolated tests.
