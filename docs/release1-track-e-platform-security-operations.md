# Release 1 Track E — Platform, Security + Operations

**Requirements:** NUR-27, NUR-28 boundary, NUR-32, NUR-33  
**Owner:** Track E  
**Scope:** Horizontal guardrails used by Tracks A–D and F

Track E does not own the business implementation of brand publishing, Experiences, onboarding, Stripe billing, or analytics. It owns the security, audit, tenant, and provider contracts those features must use.

## Implemented on this branch

### Organization authorization contract — NUR-27

`src/security/authorization.ts` now exposes Release 1 capability names for:

- brand/site: `brand.view`, `brand.manage`, `brand.publish`
- offers: `offers.view`, `offers.manage`, `offers.publish`
- Experience: `experience.view`, `experience.manage`, `experience.publish`
- onboarding: `onboarding.view`, `onboarding.manage`, `onboarding.publish`
- customers: `customers.view`, `customers.manage`, `customers.export`
- lifecycle and communications
- surveys and referrals
- analytics
- billing
- team/access
- audit
- settings

The existing skeleton capability names remain as compatibility aliases while routes migrate. Role presets map Owner/Administrator/Manager/Member to capabilities. Feature code should call `can("capability.name")`; it should not compare role strings.

Client capability checks are usability only. Protected reads/mutations are not production-ready until the same organization and capability boundary is enforced by trusted backend logic and Firestore Security Rules.

### Platform authorization boundary — NUR-28

The existing `/platform/*` namespace and platform shell are preserved.

For real Firebase-authenticated accounts, `PlatformProvider` now resolves authority from Firebase ID-token custom claims:

- `nurturePlatformRole`
- `nurturePlatformCapabilities` for future `custom:*` roles

Known Release 1 roles are:

- `super-administrator`
- `administrator`
- `support`
- `read-only`

Organization ownership does not produce a platform role.

The old demo-role behavior is constrained so a platform demo role cannot overlay a real Firebase-authenticated session. Demo platform authority is usable only with the explicit skeleton demo identity. Platform routes wait for claim resolution and fail closed when claims are absent or invalid.

These browser checks do not authorize privileged server operations. Cloud Functions / Security Rules must independently verify server-issued claims.

### Canonical audit contract — NUR-32

`src/platform/audit.ts` defines:

- platform vs organization scope
- actor
- action
- target
- authoritative occurrence/source fields
- reason
- safe before/after change representation
- correlation/idempotency metadata
- a trusted `AuditWriter` interface

Feature code constructs `AuditWriteRequest`; it does **not** choose the final actor or timestamp. Trusted server code derives those fields and persists `AuditRecord`.

The shared sanitizer bounds object depth, array/object size, and string length and redacts common secret/credential/payment keys. This is defense in depth; raw secrets must never be sent to the audit pipeline.

### Integration layer — NUR-33

`src/platform/integrations.ts` defines a common result/error/health convention and typed application ports for:

- payments
- email
- SMS
- media/storage
- events/analytics
- authentication verification

Provider SDKs remain behind these ports. Stripe, SendGrid, Twilio, Firebase Storage, and Firebase Authentication are implementations, not Nurture domain models.

Important repeated operations carry a correlation ID and optional idempotency key. Errors distinguish retryable vs non-retryable failures and expose only safe details.

## Cross-track handoff

| Track | Track E contract to consume | Track E does not own |
| --- | --- | --- |
| A — Configuration + Public Shell | `brand.*` capabilities; organization scope; `AuditWriteRequest`; media port | Brand/site configuration and publish implementation |
| B — Experience Architecture | `experience.*` capabilities; organization scope; provider ports where needed | Experience/module/entitlement behavior |
| C — Identity + Onboarding | `onboarding.*` capabilities where admin configuration is exposed; platform-claim contract remains separate from identity | Registration, profile bootstrap, onboarding flow |
| D — Offers + Billing | `offers.*`, `billing.*`; payment port; audit/idempotency conventions | Stripe adapter, checkout, subscription state |
| F — Analytics Instrumentation | generic `EventIntegrationPort<TEvent>` | Event envelope and event vocabulary |

Tracks should import these contracts rather than copy them. If a missing capability or provider operation is discovered, extend the Track E contract rather than introduce a parallel authorization or integration model.

## Firebase Security Rules gate

The repository intentionally has no production Firestore rules yet. The canonical architecture requires the database edition/details to be confirmed before edition-specific rule/index implementation.

The official Firebase Firestore agent skill requires this sequence:

```bash
npx -y firebase-tools@latest firestore:databases:list --project nurture-12398
npx -y firebase-tools@latest firestore:databases:get <database-id> --project nurture-12398
```

This execution environment cannot reach the Firebase CLI, so the edition could not be verified safely. Track E therefore does **not** guess an edition or commit a ruleset that may be wrong for the existing project.

Once the edition is confirmed, the first rules/emulator suite must prove at minimum:

1. Organization A cannot read or mutate Organization B by changing organization/document IDs.
2. Membership must be active for the exact organization.
3. Management, publish, export, billing, and team writes require the required trusted capability/role.
4. Organization role/owner authority cannot be self-assigned through `request.resource.data`.
5. Create/update validation prevents update-bypass escalation.
6. Platform collections require server-authoritative platform claims independent of organization membership.
7. Billing state, provider mappings, audit records, and similar trusted records are not browser-writable.
8. Sensitive fields have type/size/field validation appropriate to the confirmed Firestore edition.

This rules/emulator gate remains required before enabling organization persistence. Client authorization tests are not a substitute.

## Audit persistence gate

The canonical audit model is implemented, but durable material audit writes require the trusted backend operation that performs the mutation. Feature tracks must wire audit persistence at the same server boundary as the privileged change; a browser-only audit write is not acceptable.

Until the first privileged Cloud Function is introduced, this branch deliberately avoids a fake client audit sink that would imply tamper resistance.

## Release 1 Track E acceptance status

- **Organization capability model:** implemented at application-contract level.
- **Platform route/security boundary:** implemented; real-user platform UI authority resolves from server-issued Firebase claims.
- **Client demo privilege separation:** implemented.
- **Canonical audit contract/redaction:** implemented.
- **Typed provider abstraction:** implemented.
- **Cross-tenant Firestore rules + emulator evidence:** blocked on required Firestore edition verification; still a release gate.
- **Durable audit persistence:** to be attached to the first trusted mutation/Cloud Function; still a release gate.
- **Provider-specific implementations:** owned by the corresponding feature track behind Track E ports.

Track E should not be declared Release 1 complete until the two remaining trusted-backend gates above are evidenced.
