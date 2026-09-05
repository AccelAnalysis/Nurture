# Release 5 — analytics implementation and integration gate

**Requirements:** NUR-25 / NUR-26; NUR-27, NUR-32, NUR-33 boundaries.  
**Development base:** `dcd898a731c0146c54ca557134c2ef333a19cb7c` (accepted R1 integration, NOT Release 4).  
**Status:** implementation across A–F with controlled tests; blocked on accepted R4 source contracts and combined acceptance. Not a production release or a claim that every item in the larger plan is finished.

Read the [product specification](nurture-product-spec.md), [lifecycle model](lifecycle-model.md), [delivery gates](delivery-and-acceptance.md), and canonical [brand guide](../../brand/README.md). The Experience can be anything. Analytics measures the surrounding lifecycle; it does not become the customer product or grant access.

## Implemented composition

| Track | Code | Implemented scope |
| --- | --- | --- |
| A | `src/features/analytics/workspace/` | Authorized organization route, seven-stage internal view, family/date/mode/currency/version controls, definitions, lineage, quality states, responsive cards, stale response suppression |
| B | `shared/analytics/measurement/registry.ts` | First meaningful activation, namespaced reference deep dive, active participants, secondary Experience, module/version selectors |
| C | Registry and engine | Scoped visitor/lead/customer distinctions, acquisition and onboarding counts, lead linking input contract, entry cohorts, maturity handling, median completion duration |
| D | Registry and engine | Trusted purchase/subscription metrics, collected/refunded/net cash, current fixed-base MRR, as-of opening-base churn/retention |
| E | `functions/src/analytics/` | Server membership/capability checks, strict requests, App Check, bounded canonical event/subscription readers, release gate, derived-only transactional rebuild plus audit |
| F | Registry and engine | Versioned definition/result contracts, 57 metrics, delivery vs outcome, NPS, service recovery, referrals/reversals, win-back, freshness, replay/deduplication |

The route is `/org/:organizationId/admin/analytics`, composed inside the existing organization authorization boundary and shell. Platform administrators do not get implicit customer analytics access. Customer identities, event envelopes, subscriptions, and roles are imported from their canonical contracts, not copied into a competing data model.

## Measurement policy implemented here

All dates are UTC and ranges are half-open `[from,to)`. Entry range is at most 93 days; follow-up is 1–90 days. A cohort uses the first qualifying event per subject **within the selected entry window**, not an asserted lifetime-first event. Outcomes must occur on or after entry and before its observation deadline. Immature rates are null, not deceptively low final rates. Median completion time describes observed completers only.

Counts explicitly name their unit: events, customer keys, sessions/visitor keys, invitations, referrals, runs, messages, ledger entries or subscriptions. A visitor/session key is not a claim to uniquely identify a human across devices. Verified tenant/mode-scoped link input can join a lead to a customer; email equality never does. Unsupported filters and raw customer/PII filters are rejected, not silently ignored.

Only trusted domain/provider sources count for protected milestones or commercial facts. Browser redirect success cannot become paid conversion. Unknown/missing source coverage yields `unavailable` with null value; complete empty history is a genuine zero. Unknown denominators yield null. Partial, stale, duplicate, conflicting and read-limit conditions are explicit.

Cash comes from a reviewed ledger mapping, never from a subscription price or checkout URL. Amounts use safe integer minor units, one currency per query, and no implicit foreign exchange. Refunds subtract from cash in the refund period without deleting earlier receipts. Current base-plan MRR is the active fixed-price base amount (monthly plus annual/12), rounded only after summation. It is explicitly before discounts/taxes/usage/proration and **not accounting revenue**. Trials and past-due are excluded under this version's stated definition. Opening-base subscription churn/retention requires complete as-of opening and closing snapshots; scheduled cancellation counts alone cannot substitute. Reactivated opening subscriptions active at close are retained; new entrants do not change the opening denominator.

NPS uses only the accepted NPS question mapping and valid integer answers 0–10, once per invitation; no private answer text is returned. Referral qualification, issued rewards, and reversals remain distinct. Post-delivery purchase association is not a causal lift estimate.

## Prerequisites, not fabricated source implementations

A newly created R4 branch is not an accepted R4 release. `shared/analytics/measurement/release.ts` deliberately has:

```ts
R4_BASE_SHA = null;
R5_SOURCE_BINDINGS_ACCEPTED = false;
RELEASE5_ENABLED = false;
```

The callable authorizes membership before returning unavailable results. While closed it reads no analytics sources; rebuild refuses to write. The client separately respects the repository's backend-readiness flag. This change does not open live campaigns, enable billing, issue incentives, provision credentials, or modify a production deployment workflow.

These source adapters must be reconciled to the accepted combined R4 SHA before activation:

| Source family | Required contract evidence / owner |
| --- | --- |
| R1/R2 lifecycle events | Actual canonical persisted envelope, mode, occurrence/receipt and deduplication contracts; lifecycle F + platform E |
| Progressive identity | Verified subject-to-customer mapping, privacy/deletion behavior and tenant/mode scope; identity C. Reader currently intentionally unavailable |
| Experience | Declared meaningful milestone and module/instance/version/slot semantics; Experience B. Missing fields remain partial/unavailable |
| Money | Immutable ledger event IDs, amounts/currency and trusted provider source, explicit mode; commercial D. Proposed `payment.collected/refunded` measurement names are not new producer authority |
| Current subscriptions | Explicit trusted live/test mode on canonical snapshots. Old mode-less records are not guessed live |
| Historical subscriptions | Complete opening/closing as-of read sets from canonical commercial history; D. Reader currently intentionally unavailable |
| Automation/communications | Actual accepted run/message IDs, attempt/send/delivery/failure/outcome vocabulary, immutable template/rule versions; lifecycle E/F and communications D |
| Survey | Versioned invitation/response/NPS mapping and private-answer capability; R4 survey owner |
| Referral | Attribution/qualification/reward/reversal mapping with stable referral/ledger IDs and program versions; R4 referral/commercial owners |
| Retention | Accepted renewal/recovery/reactivation/win-back vocabulary and effective-time policy; R3/R4 lifecycle owners |

Names and payload fields for future releases in the measurement registry are **proposed calculation bindings exercised by fixtures**, not silently invented canonical events. The real reader still calls `validateLifecycleEventEnvelope`; unregistered/invalid records are rejected. This PR does not extend the canonical event catalog to pretend future producers exist.

## Persistence and operational boundaries

There is no second raw event store. Queries use the existing scoped `lifecycleEvents` collection. Reads are bounded at 10,000 events and 2,000 subscriptions; reaching the cap marks the result partial and prevents a complete rebuild. This is a bounded initial implementation, not a large-tenant performance claim or a warehouse.

`_analyticsControls/{organizationId}` is server-managed configuration. Its accepted R4 SHA and registry version must match code. Each selected mode has `coverage[source]` with organization, mode, bindingVersion, from, through, checkedAt, and complete. Coverage must derive from validated source readiness/checkpoints, not be a hand-entered assurance that data exists. A sample document is not seeded because no source family has been accepted here.

`_analyticsMaterializations/{organizationId}/results/{queryHash}` holds derived reports only. Rebuild receipts are keyed by user/request ID. A transaction records the derived result, receipt and canonical audit record together. Same request ID + different query is rejected; an older computation cannot overwrite a newer result. No raw event, customer, subscription, message, reward or automation-run write port exists in the analytics service. Rebuild cannot send messages or replay financial effects.

Direct browser reads/writes to controls/materializations must be denied in the **accepted combined Firestore rules**, with emulator negative tests. This branch does not replace the incomplete R1 rule configuration or override security work owned by earlier release tracks. App Check is enforced on new callables; authorized web App Check initialization must be verified before activation. Existing organization membership lookup enforces active organization, active scoped membership and canonical role capability. Financial outcome metrics also require billing access, even when displayed under automation/retention.

Automatic scheduled materialization, distributed large-history backfill checkpoints, cached-result serving, customer-level exports/drill-down, comparison-period trends and fully configurable Experience metric installation are not implemented by this PR. Synchronous bounded replay plus explicit authorized rebuild is implemented. These remaining items must be assessed against the final R5 acceptance scope rather than described as shipped.

## Verification commands

```sh
npm install --no-audit --no-fund
npx tsc -p tsconfig.release-5.json
node scripts/verify-release-5.mjs
npm run typecheck && npm test && npm run build
npm install --prefix functions --no-audit --no-fund
npm --prefix functions run typecheck
npx playwright install --with-deps chromium
node scripts/verify-release-5-browser.mjs
```

The measurement checks exercise deterministic fixtures, incorrect tenants/modes/permissions, malformed query input, duplicate/late/out-of-order data, immature cohorts, financial distinctions, NPS privacy, referral reversal and side-effect-free rebuilds. The browser harness lives outside the production import graph at `tests/release5/`; it injects controlled results into the real presentation component and tests source-unavailable states, permission visibility, delayed tenant switching, demo isolation, keyboard and reflow behavior. It does not fake a signed-in identity on production routes.

The dedicated CI workflow preserves browser screenshots and a result manifest. Full project CI remains required. Isolated tests are not evidence of live Firebase Auth/App Check, production security rules, Stripe, provider delivery, accepted R4 source mappings, or the entire R1–R4 customer journey.

## Merge, deploy, and rollback gate

Do not merge this PR into `main` while R4 is unaccepted: main has an automatic Firebase Hosting deployment workflow. Do not enable auto-merge. First record the accepted R4 SHA, reconcile the integration branch and canonical source adapters, complete direct-access/rules and real callable tests, reconcile controlled lifecycle data with expected values, and rerun prior-release regressions on one combined commit. Only the accepted combined build may be activated and deployed via the existing authorized Firebase/GitHub mechanism for `nurture-12398`.

A Hosting-only deployment is not a backend deployment. The existing workflow must have authorized Functions/rules deployment support and evidence before claiming the analytics backend live. Keep outbound campaigns disabled throughout analytics acceptance.

Rollback can close analytics activation and stop serving new results; it must not roll back customer identity, subscriptions, events, rewards or communications. No operational feature depends on this analytics layer. Retention/deletion controls for derived snapshots must follow the accepted product/privacy policy, and deletion/reconciliation must never restore deleted personal event history.
