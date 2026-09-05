# Release 6 — Experience Ecosystem implementation status

**Release:** 6 — Experience Ecosystem  
**Status:** Staged implementation complete on provisional pre-R5 base; final acceptance/deployment blocked on accepted Release 5 integration  
**Repository:** `AccelAnalysis/Nurture`  
**Prepared:** 2026-09-05

## Baseline gate

`R5_BASE_SHA` is **PENDING**. At the time this Release 6 build was staged, `main` still pointed to the accepted Release 1 integration `dcd898a731c0146c54ca557134c2ef333a19cb7c`, Release 2 work was active, Release 3/4 branches existed, and no accepted Release 5 integration branch/SHA was available.

Release 6 was therefore built on an isolated `release-6/integration` staging line rooted at the accepted Release 1 commit. This is deliberate parallel work, not a claim that Release 6 can bypass Releases 2–5. **Do not merge this release to `main`, deploy it, register live module versions, or run production migrations until a Release 5 finisher has produced the accepted `R5_BASE_SHA` and the Release 6 finisher has reconciled this staging line onto that exact commit.**

## Contract and track PRs

| Work | PR | Accepted track head | Result on staging |
| --- | --- | --- | --- |
| Ecosystem contract gate | #20 | `612ef80ab03300b36f35cd4e00113cea15a289f0` | Merged; green CI/browser gates |
| Track B — host contract/runtime compatibility | #21 | `e50ea7158677dae4c80675ded76c1eafe0585c45` | Merged; green CI/browser gates |
| Track E — trust/isolation/governance | #22 | `659572d3b3b8ce2607782a9e490b8def9334ccad` | Reconciled with B; merged; green gates |
| Track C — templates/configuration | #23 | `2102cdebf9d61cb1009e36cdbe320bca232c4d6a` | Reconciled with B/E; merged; green gates |
| Track A — registry/install lifecycle | #30 | `f433612baf30c984d0233b72ecfcfd7004e5877b` | Reconciled with B/C/E; merged; green gates |
| Track D — upgrades/migrations | #34 | `c93670fda6b76455a2f359f993e8253f9d6c3e0c` | Merged; green gates |
| Track F — portability/observability | #35 | `11da161747264919abf6f02bbdfbeea54219a017` | Merged; green gates |

After the six track merges, the provisional combined Release 6 staging SHA is `1782df2190af05dd5c79344e362f75933da9da91` before the finisher acceptance additions in this folder.

## Implemented Release 6 contracts

The staged release now has one canonical additive ecosystem vocabulary under `shared/experience/ecosystem/` for:

- module/manifest/host-contract versions;
- trust and availability decisions;
- registry entries and organization installation state/history;
- configuration and template versions;
- capability/Offer and onboarding mappings;
- compatibility decisions;
- configuration/data migration runs and checkpoints;
- controlled upgrade/rollback state;
- module event provenance and release-mode separation;
- module conformance and portability certification;
- version-aware ecosystem operational observations.

Configuration is data, not executable code. Manifest/configuration validation rejects secret-bearing fields, arbitrary executable HTML/JavaScript forms, cross-scope routes, undeclared capabilities, malformed events, and incompatible host contracts.

## Track handoff summary

### A — Registry + installation lifecycle

Implements trusted/compatible/available install gating, exact organization scope, one current installation per organization/module, no silent version activation, disable/enable/uninstall history, controlled-upgrade activation handoff, and emergency disable for an exact revoked version. The persistence contract is expressed as `ExperienceRegistryStore`; the current deterministic store used by track tests is not the final Release 5-connected Firestore implementation.

### B — Host contract + runtime compatibility

Implements versioned manifest validation, host-contract/minimum-host compatibility, participant route containment, validated return paths, minimized host context, declared event-property validation, and host-bound module/version/installation/configuration provenance.

### C — Templates + organization configuration

Implements schema-validated configuration, default → template → organization override resolution, immutable template versions, draft/publish/supersede behavior, deliberate template adoption, and declared capability/Offer and onboarding mappings. Cross-organization and cross-module-version writes fail closed.

### D — Upgrades + migrations

Implements explicit upgrade preflight, required configuration/data migration descriptors, persisted migration/upgrade run state, checkpoints, idempotent retry behavior, final trust/compatibility/availability rechecks before activation, failure that leaves the prior version active, and bounded rollback only when every migration declares a safe rollback path.

### E — Trust + isolation + governance

Implements distinct platform versus organization authority, governed module trust transitions, reviewed-artifact/digest binding, independent approval, terminal revocation, exact organization mutation scope, installability only for trusted versions, and bounded audit-context redaction.

### F — Portability + observability

Implements a bridge from the original trusted Experience manifest into the Release 6 version-aware contract, conformance/portability certification, real two-domain evidence using `nurture.reference-assessment` and `nurture.reference-checklist`, and module/version/installation/configuration/event-schema observations that exclude preview/test/demo/development activity from live summaries.

## Known prerequisite seams before final acceptance

The accepted Release 1 baseline still uses demo organization membership/context for organization administration and its original Experience Function explicitly supports only the Release 1 default registry. Release 6 must **not** invent a private substitute for whatever authoritative organization/customer/lifecycle/analytics persistence and authorization model Release 5 ultimately accepts.

Therefore the following items are intentionally final-integration prerequisites rather than falsely marked complete now:

1. Bind `ExperienceRegistryStore`, configuration publication, migration state, and ecosystem observation ports to the **accepted Release 5 Firestore/server model**.
2. Bind organization install/configure/upgrade/uninstall commands to Release 5's authoritative organization membership/capability resolver and platform trust commands to the accepted platform custom-claim/server authorization path.
3. Compose organization/platform admin registry/configuration/upgrade surfaces onto the accepted R5 application state without reintroducing demo authority.
4. Extend the accepted R5 lifecycle/analytics event store with the R6 module/version/install/config/event-schema dimensions rather than creating a second event store.
5. Run the real two-organization negative security tests against the accepted rules/Functions implementation.
6. Run the combined Release 1–5 regression matrix and Release 6 `R6-ACC-01` through `R6-ACC-19` on the final reconciled SHA.
7. Record the actual `R5_BASE_SHA`, final R6 integration SHA, deployed Function/Hosting versions, module versions, configuration/template versions, trust decisions, and migration evidence.

These seams are explicit blockers to a production-complete claim. The current staged implementation is intended to make the R5 reconciliation additive and bounded rather than forcing Release 6 tracks to fork missing prior-release authority.

## Deployment rule

Production deployment remains disabled for this staging line. When Release 5 is accepted:

1. capture the exact `R5_BASE_SHA` from the accepted Release 5 integration/`main` state;
2. reconcile/rebase the Release 6 staging implementation onto that SHA, resolving shared contracts rather than duplicating them;
3. bind the R6 persistence/authorization/event ports to the accepted Release 5 services;
4. run the named Release 6 gate plus the repository's full CI/browser and Release 1–5 regression gates;
5. create/use a dedicated final Release 6 integration PR to `main`;
6. merge only if compatible and passing;
7. deploy with the repository's existing authorized Firebase/GitHub production workflow for `nurture-12398`;
8. keep arbitrary third-party executable modules disabled unless a separately approved policy changes that scope.

A Hosting rollback does not undo module data migrations or external lifecycle effects. A module-version rollback does not cancel subscriptions, unsend communications, reverse rewards, or rewrite historical event provenance.
