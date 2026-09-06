# Post-Release 6 — Nurture Mail infrastructure foundation

Status: **stacked draft; do not merge or activate before Release 6 and the current post-R6 branded-communications work are reconciled.**

Dependency order:

1. Release 6 promotion/reconciliation
2. `post-r6/branded-communications` / PR #48
3. this Nurture Mail branch
4. production mail-network provisioning and controlled acceptance

## Decision

Nurture Mail is the platform-owned originating email system. SendGrid becomes a temporary/fallback provider rather than the architectural foundation.

Nurture Mail v1 is **not** a consumer mailbox provider. It does not add POP3/IMAP inbox hosting. Its responsibility starts at trusted Nurture communication admission and ends with direct SMTP transfer to recipient mail systems plus asynchronous bounce/complaint processing.

```text
Nurture lifecycle / communications
        |
        v
Nurture Mail control plane
  admission, identity, immutable message
        |
        v
Durable spool + destination scheduler
        |
        v
Nurture Mail worker network
  DNS/MX -> TCP :25 -> EHLO -> STARTTLS -> SMTP DATA
        |
        v
Recipient MX (Google / Microsoft / Yahoo / other)
        |
        +--> DSN / complaint -> Nurture Mail ingress -> lifecycle/suppression
```

## Why this is stacked instead of replacing PR #48

PR #48 establishes organization-branded sender/domain provisioning and the existing SendGrid/Twilio provider integrations while deliberately waiting for Release 6 reconciliation. This branch uses that work as its base but does not change its live provider path.

The existing `dispatchEmail()` contract treats a successful `EmailIntegrationPort.send()` call as **provider acceptance**. A Nurture Mail submission is asynchronous: successfully placing a message in our own spool is not the same as a remote MX returning `250` after `DATA`. Therefore this branch intentionally does **not** plug Nurture Mail into that port yet. Post-R6 reconciliation must introduce the correct queue/remote-acceptance semantics instead of falsely reporting a locally queued message as provider-accepted.

## Implemented foundation

### Shared mail contracts

`shared/mail/` establishes versioned, provider-independent contracts for:

- immutable Internet message metadata
- SMTP envelope metadata, deliberately distinct from RFC 5322 message headers
- one-recipient-per-delivery records
- delivery state and attempt history
- worker leases with fencing tokens
- sending identities and DNS readiness
- egress pools and IP/hostname identity
- MX routes and per-destination policy
- reputation snapshots
- language-neutral worker jobs/results

### Delivery state model

```text
created
  -> policy_approved
  -> queued
  -> routing
  -> connecting
  -> negotiating
  -> transmitting
       -> accepted
       -> deferred -> queued/routing (scheduled retry)
       -> permanent_failure
       -> acceptance_uncertain
```

Post-accept recipient signals may strengthen state to `bounced`, `complained`, or `unsubscribed`.

`acceptance_uncertain` is a first-class state. If Nurture finishes or may have finished the SMTP `DATA` transaction but loses the connection before observing the remote final response, Nurture **must not blindly retry**. The receiver may already have committed the message.

### Immutable RFC 5322 / MIME compiler

`message-compiler.ts` creates canonical CRLF `message/rfc822` bytes and records a SHA-256 digest and byte length. It supports:

- From / To / Reply-To / Date / Message-ID
- UTF-8 text and HTML multipart/alternative
- attachments as multipart/mixed
- protected-header enforcement
- one-click `List-Unsubscribe` + `List-Unsubscribe-Post` enforcement for marketing mail
- one envelope recipient per compiled delivery

After compilation, the bytes are treated as immutable. Retries transmit the same signed message blob rather than re-rendering a template.

### DKIM

`dkim.ts` contains the reference relaxed/relaxed RSA-SHA256 signer and a `DkimSigningPort` for production key custody. Production private keys must live in KMS/HSM-backed infrastructure and be referenced only by opaque `dkimKeyReference`; raw private keys must never be written into organization documents, logs, worker jobs, or the durable spool.

### Organization sending identity

`identity.ts` builds Nurture-owned sending identity requirements for:

- DKIM selector/public key
- organization return-path/bounce subdomain
- SPF for that return-path
- bounce MX
- DMARC presence
- egress-pool binding
- allowed traffic classes

An identity cannot be admitted for production delivery until its required DNS checks are verified and its status is `ready`.

### Idempotent control plane

`NurtureMailControlPlane` requires a stable trusted idempotency key. It derives a deterministic delivery UUID from tenant + logical effect, so replaying a Cloud Function or lifecycle effect returns the original mail delivery rather than creating another outbound message.

Admission rechecks:

- organization/identity tenant binding
- identity readiness
- From-domain alignment to the identity
- allowed traffic class
- a separate admission-policy port for consent/suppression/reputation enforcement

The current Communications eligibility/suppression engine remains authoritative upstream; the mail boundary intentionally supports a second enforcement gate so a future caller cannot bypass policy by calling the mail subsystem directly.

### Spool boundary and leasing

`MailSpool` defines the required production durable-spool behavior:

- immutable message record
- delivery queue
- scheduled next-attempt time
- lease acquisition/heartbeat
- lease fencing token
- state transitions
- attempt completion

`InMemoryMailSpool` exists only as a reference/test implementation. **It is not a production queue and must never be deployed as one.** A production multi-worker spool adapter must provide transactional leasing and durable recovery before direct SMTP cutover.

### DNS / MX routing

`mx-routing.ts` implements MX resolution and implicit-MX fallback and recognizes Null MX. MX host A/AAAA addresses are resolved independently from application/business state.

### Direct SMTP protocol + Node reference transport

`NurtureMailWorker`, `smtp-session.ts`, and `node-smtp-connection.ts` implement the direct-delivery reference path for a dedicated long-lived mail worker:

1. resolve recipient route
2. connect to recipient MX on TCP port 25
3. consume `220` greeting
4. send `EHLO`
5. parse ESMTP capabilities
6. negotiate STARTTLS when advertised (or require it by policy)
7. `MAIL FROM` using the Nurture return path
8. `RCPT TO`
9. `DATA`
10. transmit dot-stuffed immutable RFC 5322 bytes
11. observe the remote final reply

The Node network transport is deliberately not exposed as a Firebase callable/background Function. It belongs on dedicated mail egress hosts that permit legitimate server-to-server SMTP, have stable IP identity, and support long-lived connection/queue operations.

### SMTP normalization + retry

Raw SMTP responses are retained in bounded form and normalized into reasons such as:

- destination temporary
- reputation temporary
- mailbox temporary/permanent
- recipient permanent
- policy/authentication permanent
- message too large
- DNS/TLS/connection failures
- acceptance uncertain

Only true temporary outcomes are eligible for automatic retry. The baseline retry schedule starts at 30 minutes, exponentially backs off, honors destination/provider delay hints, and never schedules beyond delivery expiry.

### Destination throttling and reputation

The foundation defines destination-policy and reputation contracts and includes reference policy derivation. Production scheduling must enforce limits across the distributed worker fleet, not merely per process. Reputation is separately attributable to organization, sending domain, egress IP, egress pool, and destination so a bad tenant cannot silently poison every Nurture sender.

Traffic classes are modeled explicitly:

- transactional
- lifecycle
- marketing
- warming

Production pools may use shared or dedicated egress addresses, but addresses must remain stable enough to build reputation. IP rotation must never be used to evade recipient-domain policy or throttling.

### Bounce / DSN ingress

Every envelope return path uses a compact HMAC-authenticated bounce token that maps to a delivery UUID without placing customer identifiers in the address. `dsn.ts` parses structured delivery-status fields first; `NurtureMailIngress` correlates terminal DSNs back to the accepted/uncertain delivery and records a bounce.

Delayed asynchronous DSNs do not reopen an already accepted SMTP transaction for blind retry.

### Events

The mail subsystem emits its own semantic event vocabulary (`mail.delivery.accepted`, `mail.delivery.deferred`, `mail.delivery.acceptance_uncertain`, `mail.bounce.received`, etc.). Post-R6 composition can translate those into canonical Nurture lifecycle events without exposing raw SMTP internals to participant/organization features.

## Security / tenancy requirements

Nurture Mail must obey the same global-vs-organization separation required by the application skeleton:

- every sending identity, message, envelope, delivery, attempt, and reputation fact has an organization binding where appropriate
- a worker result cannot complete a delivery for another organization
- lease fencing prevents a stale worker result from overwriting a newer lease
- private DKIM material is never a Firestore/document field
- bounce addresses contain authenticated opaque delivery identity, not customer PII
- raw SMTP responses are bounded before persistence
- direct SMTP workers are not public application endpoints
- platform operators manage fleet/pool/reputation controls at platform scope; organization administrators manage only their organization sender/domain readiness
- privileged infrastructure actions must emit audit events when the post-R6 authorization/audit contracts are reconciled

## Production components deliberately not activated in this branch

This branch establishes executable software seams but does **not** claim production Internet-mail readiness. Activation requires infrastructure that cannot safely be guessed into source code:

1. dedicated egress environment that permits legitimate outbound TCP/25
2. stable IPv4/IPv6 addresses and controlled PTR/rDNS
3. forward A/AAAA matching worker EHLO hostnames
4. production TLS certificates/policy
5. distributed durable spool and lease authority
6. KMS/HSM implementation of `DkimSigningPort`
7. production sending-identity persistence + audited admin surface
8. bounce MX hosts and Internet-facing SMTP ingress
9. complaint/feedback-loop integrations where receiving networks provide them
10. global distributed destination concurrency/rate gate
11. IP/domain warm-up controls
12. MTA-STS/DANE/TLS-report policy resolvers
13. operational abuse/postmaster processes
14. delivery search, queue controls, incident drains and reputation dashboards under `/platform/*`

## Required post-R6 reconciliation

After Release 6 and PR #48 land:

1. rebase this branch on the promoted R6/main state
2. reconcile shared versioning/host/runtime/trust contracts with R6 rather than duplicating them
3. migrate PR #48 `OrganizationEmailDomain` readiness into/alongside `MailSendingIdentity` without losing provider state
4. introduce an asynchronous Communications -> Nurture Mail submission contract; do not reuse `MessageSendResult.acceptedAt` for local queue admission
5. map `mail.delivery.accepted` to the canonical communication/lifecycle event only after the recipient MX returns final SMTP acceptance
6. preserve SendGrid as a controlled fallback while the Nurture Mail network warms
7. compose organization domain-readiness UI into the R6 organization workspace and fleet/reputation controls into the R6 platform Communications/Operations surfaces
8. run tenant-isolation, audit, crash-recovery, queue, browser/admin, and combined release regression tests

## First direct-delivery acceptance gate

Do not switch production traffic merely because a worker can open port 25. The first controlled acceptance sequence is:

1. provision one dedicated mail egress host + one stable IP
2. establish forward DNS and PTR symmetry for its EHLO hostname
3. establish a non-production Nurture-owned sending domain and return-path domain
4. create a KMS-backed DKIM key and publish the generated identity DNS requirements
5. verify the sending identity through the resolver seam
6. install a durable spool adapter
7. send only controlled internal/test recipients
8. confirm remote `250` acceptance, headers, SPF/DKIM/DMARC alignment, TLS observation, bounce correlation, DSN handling and logs
9. repeat controlled acceptance against multiple major receiver networks
10. warm volume gradually and observe deferrals/complaints before any organization is eligible for direct delivery

Until those gates pass, SendGrid remains the live transport and Nurture Mail remains dark infrastructure.

## Tests in this branch

Focused tests cover:

- legal delivery-state transitions and no-blind-retry semantics
- SMTP response normalization
- RFC 5322/MIME compilation and marketing unsubscribe enforcement
- bounce-token authentication + DSN classification
- STARTTLS SMTP session and post-DATA uncertain acceptance
- tenant-bound/idempotent control-plane submission
- queue leasing, state progression and delayed retry
- DNS sending-identity readiness
- DKIM signing

The branch test command includes these tests in the normal Functions suite.
