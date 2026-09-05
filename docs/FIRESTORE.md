# Firestore data architecture

These are proposed paths and TypeScript contracts, not collections automatically seeded into production. Demo fixtures never call Firebase. Existing database edition and instance configuration must be confirmed with authorized access before enabling production writes; they were not verified against the live project during this skeleton implementation.

## Paths, ownership, and access

| Path                                                | Purpose                                               | Read boundary                            | Writer                                                     |
| --------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `users/{uid}`                                       | Private profile and personal preferences              | That user only                           | Own validated profile fields; protected fields server-only |
| `users/{uid}/notifications/{id}`                    | Personal inbox                                        | That user                                | Server; demo mark-read only for now                        |
| `users/{uid}/subscriptions/{id}`                    | Personal billing projection                           | That user                                | Verified billing backend                                   |
| `users/{uid}/feedback/{id}`                         | Personal feedback                                     | That user                                | Future validated submission service                        |
| `organizationMemberships/{orgId}_{uid}`             | Canonical role and status                             | That user or organization administrator  | Trusted provisioning/invitation service                    |
| `organizations/{orgId}`                             | Organization identity and settings                    | Active members                           | Trusted organization service                               |
| `organizations/{orgId}/contacts/{id}`               | Non-auth participant/contact relationships            | Owner/admin/manager in this organization | Future validated contact service                           |
| `organizations/{orgId}/segments/{id}`               | Saved contact filters                                 | Owner/admin/manager                      | Future validated contact service                           |
| `organizations/{orgId}/sequences/{id}`              | Versioned follow-up definitions                       | Owner/admin/manager                      | Future validated outreach service                          |
| `organizations/{orgId}/sequenceEnrollments/{id}`    | Contact enrollment, cursor, cancellation, idempotency | Owner/admin/manager                      | Scheduler only                                             |
| `organizations/{orgId}/messageTemplates/{id}`       | Email/SMS templates                                   | Owner/admin/manager                      | Future validated template service                          |
| `organizations/{orgId}/surveys/{id}`                | Private survey source and version                     | Owner/admin/manager                      | Future validated survey service                            |
| `organizations/{orgId}/surveys/{id}/responses/{id}` | Private response records                              | Owner/admin/manager                      | Future validated public/auth submission service            |
| `organizations/{orgId}/offers/{id}`                 | Organization offer definitions                        | Owner/admin/manager                      | Future validated offer service                             |
| `organizations/{orgId}/feedback/{id}`               | Organization feedback and triage                      | Owner/admin/manager                      | Future validated submission/review service                 |
| `organizations/{orgId}/analytics/{id}`              | Small aggregate pipeline projections                  | Owner/admin/manager                      | Event processor                                            |
| `organizations/{orgId}/invitations/{id}`            | Private invitation metadata                           | Owner/admin only                         | Invitation service                                         |
| `organizations/{orgId}/referrals/{id}`              | Verified organization attribution                     | Owner/admin only                         | Attribution service                                        |
| `organizations/{orgId}/referralRewards/{id}`        | Earned/pending/reversed benefits                      | Owner/admin only                         | Reward ledger service                                      |
| `organizations/{orgId}/subscriptions/{id}`          | Organization billing projection                       | Owner/admin only                         | Billing backend                                            |
| `organizations/{orgId}/auditEvents/{id}`            | Append-only privileged action audit                   | Owner/admin only                         | Trusted services                                           |
| `publicOffers/{id}`                                 | Sanitized published public offer projection           | Public only when published and public    | Publishing backend                                         |
| `publicSurveys/{id}`                                | Sanitized published public question projection        | Public only when published and public    | Publishing backend                                         |

Everything else is denied by the prototype rules. Proposed future token lookup and referral resolution documents must remain server-only. No global collection of readable contact PII is introduced.

## Why these boundaries

Memberships are top-level so a user's memberships can be fetched in one bounded query without knowing organization IDs. Authorization always checks the stored organization and user IDs as well as the deterministic document key; a constructed key alone is not trusted. A future migration to a different key format must migrate the rules and lookup helper together.

Organization-owned operational records use subcollections so tenant scope is unavoidable in repository methods. The repository rejects path separators in IDs. Contacts can have a `linkedUserId` but linking never grants membership, changes authentication, or authorizes cross-organization reads. Account matching and deduplication require verified ownership, not email-string equality alone.

Public projections intentionally duplicate only a small publication-safe subset. Firestore rules protect entire documents, not selected fields. Internal responses, invitation emails, notes, member details, consent evidence, and billing secrets must not be mixed into a publicly readable document. `publicSurveys/{id}` can contain questions and completion text, but never responses.

## Timestamps and serialization

Domain interfaces use ISO strings for UI transport and demo fixtures. Firestore persists actual `Timestamp` values for creation, update, enrollment, expiry, consent events, and conversion times. `decode` converts snapshots at the repository boundary. Own profile writes use `serverTimestamp()` and rules require `request.time`; privileged timestamps are server-owned.

Before turning on more writes, add per-entity runtime schema validation and explicit Firestore converters. TypeScript interfaces are not runtime validation, and the current read adapter must not be mistaken for a fully validated production ingestion layer.

## Queries and indexes

The current reads are intentionally simple: own profile lookup, own memberships with `where('userId', '==', uid)`, organization member lookup with `where('organizationId', '==', orgId)`, tenant subcollection lists, individual documents, and public offers constrained to `status == published` and `visibility == public`.

Lists are capped at 100 documents; the current contact search/filter/segments operate on this loaded page only. Before enabling large production lists, add cursor pagination, indexed server-side filters, and explicit count handling. Do not imply this client-side filter searches an entire production CRM. A proposed public offer composite index is included. Add more indexes only for concrete queries, and test the same query predicates against Rules.

Contact participation and communication histories are small embedded demo arrays. Production histories must move into paginated contact subcollections or events once they grow, to avoid unbounded documents and contention. Add matching rules before doing so. Survey definitions similarly need bounded questions and immutable published versions.

## Next data work

Implement emulator-tested, idempotent organization provisioning; verified single-use invitation acceptance; profile/contact linking with an audit trail; schema-validated tenant mutations; safe public projection publishing; and response submission with abuse protection. Add data retention, deletion/export, consent evidence, suppression, and audit requirements before collecting real participant data.
