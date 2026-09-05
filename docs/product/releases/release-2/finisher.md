# Nurture Release 2 Finisher Record

**Release:** Customer Lifecycle Foundation  
**Integration PR:** #39  
**Accepted Release 1 base:** `dcd898a731c0146c54ca557134c2ef333a19cb7c`  
**Current main base used for integration:** `22c8958a60a96d6f72dade04916d8ce7496f235b` (includes the canonical supplied N logo)  
**Production project:** `nurture-12398`

## Integrated track history

The finisher assembled the tracks on `release/2-integration` in dependency order rather than merging them independently to `main`:

| Order | Track | PR | Integration merge |
| --- | --- | --- | --- |
| 1 | C — customer/onboarding/consent | #16 | `4a700de9cf3cadd174ad2fe49a4e66303ea830cc` |
| 2 | F — lifecycle event/projection/query contracts | #25 | `222d0e58438ab7af2ae9847e0fa19718082f7b7b` |
| 3 | E — trusted append/acquisition runtime/security contracts | #18 | `d92a54afac4cdb0af7fa0e9d5b90366768579b08` |
| 4 | B — Experience lifecycle API | #15 | `3f0bf2dd587a5b71d2b12fc2dfcad899ab27b27b` |
| 5 | D — communications/templates/provider adapter | #17 | `4dcbd021c8804a21b84cb9e20fd71b571fea940e` |
| 6 | A — customer/lifecycle administration UI | #19 | `f42306d6799784ba8956c00a5c535afd2131249f` |

## Reconciliation completed on the combined branch

- Preserved C as the single consent owner while aligning E/D/A on the canonical `transactional | marketing` email-purpose vocabulary and numeric immutable published template versions.
- Preserved F as the lifecycle projection/query DTO owner and E as the one trusted event append/dedupe boundary.
- Added direct organization/customer binding verification before trusted customer events can enter the canonical append path.
- Closed the D duplicate-provider-send race with an atomic Firestore message claim before crossing the SendGrid boundary.
- Kept provider unknown outcomes distinct from retryable failures; no blind retry follows an ambiguous submission.
- Scoped SendGrid `group_unsubscribe` to organization marketing suppression while retaining provider/account unsubscribe, complaint, and bounce semantics at their appropriate broader suppression scope.
- Persisted final dispatch suppression when recipient or eligibility changes between E's initial admission and D's final recheck.
- Moved E frequency-cap admission into the same atomic durable barrier as provider-submission reservation so concurrent workers cannot oversubscribe the cap.
- Recheck current automation enablement, pause, authoritative state, eligibility, consent/suppression, and commercial stop facts before dispatch.
- Clear provider-frequency reservations only for a known no-send/safe-to-retry outcome; retain the ambiguity barrier for unknown outcomes.
- Prevented Track A stale tenant command results and pagination cursors from leaking across organization switches.
- Read-only lifecycle members see the active published configuration (or inherited defaults), not unpublished draft state.
- Replaced hard-coded validation text color with semantic design tokens for dark/reduced-transparency compatibility.
- Mounted Release 2 customer, lifecycle, and communications routes under the existing organization authorization boundary. No generic `/admin` surface was introduced.
- Preserved the canonical supplied N logo already on `main`.

## Automated combined evidence

The combined PR runs the repository CI, Track E Contract, and Analytics Contract on the same head. The CI gate includes web typecheck, web tests, Experience contract, analytics contract, production build, Functions typecheck/tests, and Chromium production-bundle browser verification.

The Release 2 browser script additionally verifies the new customer/lifecycle/communications and platform-operations routes remain fail-closed behind identity in the production bundle. Evidence is stored under `test-results/release-2`.

A green local/CI contract is necessary but is **not** recorded here as proof of remote Firebase persistence, remote Functions, provider delivery, or Stripe acceptance.

## Release 2 acceptance matrix status

| Gate | Status before backend activation | Evidence / limitation |
| --- | --- | --- |
| R2-ACC-01 lead/customer linking | Code/contract evidence only | C domain and negative fixtures exist; remote Firestore proof blocked. |
| R2-ACC-02 scoped onboarding | Code/contract evidence only | Tenant/version model exists; remote cross-device persistence blocked. |
| R2-ACC-03 trusted event path | Combined unit/contract pass | E binding + F validation reject forged privileged/customer scope. |
| R2-ACC-04 projection correctness | Combined unit/contract pass | F duplicate/out-of-order/checkpoint behavior tested in contract store; no remote checkpoint store yet. |
| R2-ACC-05 durable delay | Contract-store pass only | Restart/lease behavior tested; concrete Firestore runtime store and scheduled worker are not deployed. |
| R2-ACC-06 conversion during delay | Contract-store pass only | Current-state stop logic tested; real Stripe test purchase suppression not performed. |
| R2-ACC-07 opt-out/pause during delay | Combined unit/contract pass | C/D/E eligibility and pause logic tested; no remote worker run. |
| R2-ACC-08 email provider proof | **Blocked / not performed** | Requires verified sender, SendGrid secrets, allowlist, deployed Function/webhook and controlled recipient. |
| R2-ACC-09 ambiguous send | Combined unit/contract pass | Ambiguity barrier/no-blind-retry behavior tested; controlled real timeout/reconciliation not performed. |
| R2-ACC-10 security/permissions | Partial | Authorization/binding negative tests pass; edition-appropriate Firestore rules/emulator proof is blocked. |
| R2-ACC-11 draft/default inheritance | Code/browser evidence only | UI/configuration semantics exist; durable publication store remains blocked. |
| R2-ACC-12 migration/replay | Combined unit/contract pass | Projection-only replay is side-effect free in tests; remote migration not run. |
| R2-ACC-13 usability | Fail-closed production-bundle browser pass | Public/mobile/N logo/auth-boundary behavior verified; authenticated admin remote flow blocked. |
| R2-ACC-14 R1 regression | Partial | Public/Experience/browser regression is checked; real Auth/Stripe/entitlement regression remains blocked by Release 1 activation gates. |

## Production infrastructure status

Release 1 issue #12 remains the prerequisite infrastructure record. Its latest verified state reports:

- Firestore API disabled.
- Cloud Functions API disabled.
- Auth readiness not established.
- Database edition/location unconfirmed.
- No deployed production Firestore rules or Functions.

Accordingly, the following Release 2 activation work is **not** complete and must not be represented as deployed functionality:

1. Concrete Firestore implementations for E's event/dedupe/outbox/runtime store and F's projection/checkpoint/timeline query store.
2. Edition-appropriate Firestore rules/indexes plus emulator tenant/capability/forged-event tests.
3. Scheduled acquisition worker Function and durable due-job drain.
4. B trusted milestone callable composition through E/F persistence.
5. D communication outbox drain into the E/F canonical event path.
6. C/B/R1 authoritative current-state adapters required by the acquisition worker.
7. Real Auth/provider configuration and staff/customer context loading.
8. Controlled SendGrid sender/secret/webhook proof.
9. Real Stripe test checkout/webhook/entitlement regression required by the inherited Release 1 gate.

## Deployment authorization and safety

The existing production workflow is intentionally Hosting-only. For Release 2 it records `release: "2-integration"` and `backendActivated: false` in `release.json` and refuses to verify a build that claims otherwise.

Therefore the finisher may merge the reconciled source and deploy the verified **fail-closed frontend Hosting build** when the final combined CI head is green. That action does not activate or claim the Release 2 backend.

Outbound campaigns remain disabled. Preview/demo/development never send. Controlled test delivery remains unavailable until the required provider and Firebase backend gates are satisfied. No live Stripe mode change or unsolicited outreach is authorized.

## Rollback boundary

If the Hosting release must be rolled back, keep backend/outbound activation false. A Hosting rollback does not undo durable events or sent email; this release intentionally has no new production worker/provider activation to unwind. When backend activation is later authorized, pause dispatch first and record backend, rules/index, worker, migration, and provider versions separately from Hosting.
