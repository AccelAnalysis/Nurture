# Release 1 cross-track convergence — Track E review

**Reviewed:** Tracks A (PR #7), B (PR #6), C (PR #11), D (PR #10), F (PR #9)  
**Purpose:** record the concrete integration findings after neighboring Release 1 tracks completed their implementation work.

Track E remains the horizontal owner for tenant binding, staff/platform authorization, audit, trusted provider boundaries, and secure persistence. This review does not transfer feature ownership from the neighboring tracks.

## Shared server-consumable contracts

Track D now contains real Cloud Functions, which makes a frontend-only Track E contract location insufficient. Track E therefore publishes pure TypeScript contracts under `shared/platform/`:

- `authorization.ts` — canonical organization/platform roles, capabilities, presets, and pure capability resolution;
- `audit.ts` — canonical audit request/record schema plus bounded redaction helpers;
- `integrations.ts` — provider-neutral payment/email/SMS/media/event/auth ports and standard result/error/health conventions;
- `tenant-binding.ts` — trusted organization ↔ Customer ↔ identity binding contract.

The existing `src/security/authorization.ts`, `src/platform/audit.ts`, and `src/platform/integrations.ts` remain compatibility entry points for browser code and re-export the shared source of truth.

After branch integration, Cloud Functions must consume `shared/platform/*` rather than copy role maps, audit shapes, or integration error conventions into a feature package.

## Track A — Configuration + Public Shell

Track A correctly separates draft, published versions, and publication pointers, and exposes a replaceable `ConfigurationStore`. Its current store contract is synchronous, however:

```ts
saveDraft(...): OrganizationConfigurationRecord
publish(...): OrganizationConfigurationRecord
```

A trusted Firebase/Cloud Function mutation cannot truthfully implement that interface synchronously. Track E will not create a fake adapter that reports success before authorization/persistence/publish completes.

**Required convergence change:** the production persistence seam must become promise-based (or Track A must introduce a separate async command/repository port while retaining the synchronous browser demo store). The trusted implementation must:

1. verify authenticated organization membership and the appropriate `brand.manage` / `brand.publish` capability;
2. bind the requested organization rather than trust arbitrary client scope;
3. atomically preserve the previous published version when a publish fails;
4. write the canonical Track E audit record for material draft/publish actions; and
5. emit Track F's trusted `configuration.published` event only after successful authoritative publication.

Track A continues to own configuration records, inheritance, versioning, preview, and public rendering.

## Track B — Experience Architecture

Track B correctly distinguishes staff permissions from customer entitlements and fails closed when trusted entitlement state is unavailable.

Its `ExperienceCustomerSource` requires an organization-scoped Customer when an organization is present. Track E's `OrganizationCustomerBindingPort` is the trusted backend seam that can satisfy that scope after Track C identity is known.

Protected Experience operations must independently resolve:

```text
verified identity
  + trusted organization context
  + exactly one active organization Customer binding
  + server-derived entitlement
  => capability decision
```

The browser entitlement presentation snapshot remains presentation-only.

## Track C — Identity + Onboarding

Track C now owns these client-visible identity paths:

- `identityCustomers/{identityUid}`
- `identityLeadCandidates/{identityUid}`
- `identityOnboarding/{identityUid}`

The first Firestore rules suite must enforce Track C's explicit handoff:

- `request.auth.uid == identityUid` for self-service client access;
- immutable `identityId` and stable `customerId` after profile creation;
- no privilege-bearing organization role, platform role, entitlement, subscription, or equivalent client fields;
- candidate organization/offer/referral values remain hints until trusted rebinding; and
- server/admin operations use trusted handlers rather than broader client rules.

A Track C `CustomerProfile` is a global/account-level customer identity record. It is **not** the organization-scoped Customer relationship in the canonical Nurture model.

## Track D — Offers + Billing

Track D now supplies the first real trusted server boundary, including Stripe test-mode checkout/webhook reconciliation and idempotency. Its domain model remains Track D-owned.

Three implementation details must converge with Track E before the integrated Release 1 acceptance path is considered secure:

### 1. Capability duplication

`functions/src/billing/store.ts` currently re-declares the role→capability mapping for offers/billing. After integration it must import the pure mapping from `shared/platform/authorization.ts` so staff authorization has one source of truth.

### 2. Audit shape duplication

Track D currently writes a smaller feature-local audit document. Material Offer/billing administration must persist the canonical `AuditRecord` from `shared/platform/audit.ts`, with trusted actor/source/time, scope, target, safe change/context data, and correlation/idempotency metadata where available.

### 3. Organization-Customer binding

The current checkout resolver reads `identityCustomers/{identityUid}` and uses its stable `customerId` under the browser-requested `organizationId`. That establishes identity, but it does not establish the canonical organization-scoped Customer relationship.

Before checkout, portal access, subscription lookup, entitlement projection, or protected Experience use, the trusted server must resolve exactly one active organization Customer linked to the verified identity. `shared/platform/tenant-binding.ts` defines this fail-closed handoff. Ambiguous, missing, inactive, or mismatched links deny the operation.

Track D should not create the global Track C profile and Track E does not own Offer/Subscription DTOs.

## Track F — Analytics Instrumentation

Track F owns the event catalog, submission/envelope shape, allowed-source matrix, payload validation, and namespaced Experience events. Track E does not duplicate these concepts.

Track E owns the trusted ingestion/persistence boundary. Therefore:

- browser `organizationIdHint`, identity/customer hints, and browser source claims are never persisted as authority;
- the trusted boundary resolves tenant/customer/actor context first;
- source must satisfy Track F's event-specific allowed-source matrix;
- `receivedAt` is server-assigned;
- idempotency must prevent duplicate durable events; and
- provider-backed commercial events use Track D provider/server provenance.

Track D currently writes lifecycle envelopes directly from its trusted store. During integration that write should be routed through the Track F validation + Track E persistence boundary (or a server adapter implementing exactly those two contracts) so event validation/source policy has one implementation.

For server packages, Track F's pure event contracts should be available through a server-consumable shared path rather than requiring Functions to import browser feature implementation code.

## Firestore rules convergence matrix

Edition verification remains required before Track E authors edition-specific rule/index implementation. Once verified, the rule/emulator suite must cover the now-concrete Release 1 paths:

| Area | Required rule posture |
| --- | --- |
| Track C identity records | self-scoped with immutable identity/customer IDs and privilege-field rejection |
| `organizations/{orgId}` | exact-tenant active membership required for private reads |
| organization configuration | read/manage/publish distinction; browser cannot manufacture publication authority |
| organization Customers | exact organization scope; client cannot self-link into another tenant |
| Offers | published projection may be public; administrative writes require offers capability |
| subscriptions/billing mappings/provider events | browser writes denied; trusted server only |
| entitlements | browser writes denied; trusted server-derived |
| lifecycle events | durable trusted write boundary; client hints not authority |
| audit | browser writes denied; appropriate organization/platform reviewers only |
| `/platform` backing data | platform claims independently required; organization ownership is irrelevant |

Cross-tenant emulator tests must include crafted organization IDs/document IDs, membership revocation, role/capability escalation attempts, identity path substitution, organization-Customer link substitution, direct billing/entitlement/audit writes, and update-bypass attempts.

## Merge order / convergence gate

Because the tracks were developed from the same main baseline, individual green CI is necessary but not sufficient. A safe integration order is:

1. merge the shared horizontal Track E contracts or otherwise preserve them during conflict resolution;
2. merge Track C identity and Track A configuration contracts;
3. merge Track D Functions and replace its duplicated authorization/audit/customer-binding adapters with the shared contracts;
4. merge Track F event contract and connect server ingestion;
5. merge Track B host/runtime against the resolved Customer + entitlement sources;
6. implement edition-confirmed Firestore rules and emulator tests against the merged data model;
7. run the full Release 1 vertical slice.

The integrated acceptance test must prove organization setup/publish → anonymous acquisition → registration/profile → trusted organization-Customer binding → Stripe test subscription → entitlement → Experience capability, while verifying tenant isolation, staff/platform authorization, audit, and trusted lifecycle events throughout.
