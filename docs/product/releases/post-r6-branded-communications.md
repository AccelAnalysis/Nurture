# Post-Release 6 — Branded Communications Infrastructure

Status: implementation branch; hold for reconciliation after Release 6 promotion
Branch: `post-r6/branded-communications`
Draft PR: #48

This track extends Nurture's existing Release 2 email communications foundation so organizations can operate lifecycle communications under their own brand identity across email and SMS.

## Release 6 boundary

This work intentionally does not modify or redefine Release 6-owned ecosystem contracts, host/runtime compatibility, module trust and platform governance, reusable module templates/configuration, registry/installation lifecycle, controlled upgrades/migrations, portability certification, version-aware observability, or R6 finisher acceptance. The branch must be rebased and reconciled after Release 6 lands before merge.

In particular, this branch deliberately avoids editing the existing `CommunicationsAdminPage` or inventing a competing organization-configuration framework while R6 Track C owns reusable templates and organization configuration. It exposes a separate client API seam that the post-R6 composition can place into the accepted R6 organization-admin surface.

## Promise and implementation status

| Promise | Post-R6 branch status |
| --- | --- |
| Client self-service domain onboarding | Server callables and browser client seam implemented; final UI composition held for R6 reconciliation |
| Automated DNS/authentication provisioning | SendGrid Domain Authentication create/validate flow implemented |
| Client branded tracking/link domains | SendGrid Link Branding create/validate flow implemented with non-default tenant domains |
| Reply-To handling | Organization Reply-To persists with sender identity and is emitted by the SendGrid adapter |
| Inbound email conversation handling | Signed SendGrid Inbound Parse provisioning, DNS readiness, tenant routing, text-only persistence and attachment exclusion implemented |
| SMS provider adapter | `TwilioSmsAdapter` implements the existing shared `SmsIntegrationPort` |
| Dedicated client SMS number provisioning | Organization Messaging Service, local number discovery, number purchase and sender-pool association implemented |
| A2P/10DLC client registration | Organization A2P business profile, Compliance Embeddable brand/campaign initialization and campaign status refresh implemented server-side |
| Incoming SMS/reply routing | Signed Twilio inbound webhook and server-only organization sender routes implemented |
| STOP/START/HELP processing | Implemented with organization-scoped transport suppression; START never manufactures lifecycle marketing/service consent |
| International sender-ID strategy | Organization alphanumeric Sender ID registration, optional destination-country activation and Messaging Service sender selection implemented |
| Browser administration | Typed callable client exists; visual composition deliberately held until R6 Track C lands |
| Live provider acceptance | Not claimed; requires production provider credentials, callback origin, DNS, sender resources and Twilio compliance access |

## Existing foundation reused

This work preserves the current organization-scoped communication templates, sender readiness, consent evaluation, suppressions, SendGrid outbound delivery, provider webhooks, lifecycle outbox, audit model and shared integration ports. The new infrastructure plugs into those seams rather than creating a parallel communication engine.

Purpose-specific customer consent remains authoritative outside the carrier transport layer. SMS STOP is an additional hard transport suppression. SMS START only removes that carrier transport suppression and does not grant or recreate service or marketing consent.

## New organization-scoped persistence

Server-managed organization state:

- `organizations/{organizationId}/communicationInfrastructure/emailDomain`
- `organizations/{organizationId}/communicationInfrastructure/linkDomain`
- `organizations/{organizationId}/communicationInfrastructure/inboundEmail`
- `organizations/{organizationId}/communicationInfrastructure/smsSender`
- `organizations/{organizationId}/communicationInfrastructure/smsA2p`
- `organizations/{organizationId}/communicationInboundMessages/{providerMessageHash}`
- `organizations/{organizationId}/communicationSmsPreferences/{recipientHash}`
- `organizations/{organizationId}/communicationProviderStatus/{providerMessageId}`

Trusted routing state:

- `_communicationSmsRoutes/{senderRouteHash}`

The existing `organizations/{organizationId}/communicationSettings/emailSender` remains the canonical Release 2 outbound-email readiness bridge. A verified self-service email domain updates that record instead of creating a second outbound sender model.

Firestore remains fail-closed to browser clients for these collections. All reads and mutations are through server-authorized Functions; this branch does not change R6 Track E's governance boundary.

## Email domain and link branding flow

1. An organization administrator with `communications.manage` requests a sending domain.
2. Nurture creates the SendGrid Domain Authentication resource and persists the required DNS records as pending.
3. The administrator publishes the DNS records through the organization's DNS provider.
4. Nurture revalidates through SendGrid and activates the Release 2 `emailSender` mapping only after verification.
5. A separate Link Branding resource can be provisioned and validated for the organization. It is not configured as a global default, preventing one tenant's brand from being used as another tenant's fallback.
6. The existing SendGrid adapter resolves the organization From identity and Reply-To at delivery time.

## Inbound email flow

1. Nurture creates a SendGrid Inbound Parse security policy with signature verification and an organization-routed HTTPS callback.
2. The organization configures an MX record for its inbound hostname to `mx.sendgrid.net`.
3. Nurture validates DNS before marking inbound email ready.
4. The webhook verifies the SendGrid ECDSA signature against the untouched raw multipart body before parsing.
5. Only text fields are persisted; attachment file parts are ignored by this implementation slice.
6. The recipient domain must match the organization's configured inbound hostname before the message can mutate organization state.

The persisted inbound record is intentionally an infrastructure/conversation fact. Post-R6 composition can project it into whatever accepted customer-conversation/timeline surface R6 leaves available without changing provider routing.

## SMS sender and inbound flow

1. Nurture creates an organization-specific Twilio Messaging Service.
2. Nurture discovers and purchases an SMS-capable local number and attaches it to that service.
3. Nurture persists number/service routing server-side so inbound STOP/START/HELP remains routable even while US outbound use is still pending A2P approval.
4. The outbound `TwilioSmsAdapter` requires `sender.status == ready`, trusted organization context and no carrier-level opt-out before submission.
5. Twilio inbound callbacks are HMAC-signature verified before tenant routing.
6. STOP creates an organization-scoped carrier transport suppression. START clears only that transport suppression. HELP returns organization-branded support guidance.
7. Normal inbound replies are persisted under the resolved organization for later customer/conversation projection.

## US A2P/10DLC flow

US long-code number acquisition does not make the sender ready. Nurture stores the sender as `pending` until the organization's A2P campaign is approved.

The branch provides server endpoints to:

- persist the organization's A2P business/compliance draft;
- initialize a white-label Twilio Compliance Embeddable brand inquiry;
- initialize a campaign inquiry bound to the organization's Messaging Service;
- refresh the Messaging Service's campaign status;
- mark the US sender `ready` only after provider approval, or `blocked` after rejection.

The short-lived Compliance Embeddable session token is returned to the authenticated organization administrator and is not stored as a long-lived Nurture credential.

Twilio's browser embed package is intentionally not added while Release 6 is active. After R6 reconciliation, the accepted organization configuration surface can render the provider's embedded compliance component using the server-created session. This also avoids introducing a package-lock conflict into the active R6 build.

Nurture's Twilio account must itself have the provider's required ISV/Reseller Trust Hub access before this can be accepted against real businesses.

## International sender strategy

An organization can attach an alphanumeric Sender ID to its Messaging Service and optionally activate it for specific destination countries. Nurture records the explicitly configured destination-country scope and continues submitting through the organization's Messaging Service so provider sender selection can choose an eligible sender from that organization's pool.

This is not treated as a universal SMS identity: countries that do not support alphanumeric senders, including US long-code traffic, continue using the organization's number/compliance path.

## Server configuration

Existing:

- `SENDGRID_API_KEY`
- `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY`
- `SENDGRID_TEST_ALLOWLIST`
- `COMMUNICATION_TRUSTED_LINK_ORIGINS`

Added by this branch:

- Firebase Secret: `TWILIO_ACCOUNT_SID`
- Firebase Secret: `TWILIO_AUTH_TOKEN`
- Functions parameter: `COMMUNICATION_WEBHOOK_BASE_URL`

`COMMUNICATION_WEBHOOK_BASE_URL` must be the actual public HTTPS Functions/callback origin used when provider webhook signatures are generated and verified.

## Exported server surface

Organization-admin callables:

- `getBrandedCommunicationInfrastructureAdmin`
- `configureOrganizationEmailDomain`
- `validateOrganizationEmailDomain`
- `configureOrganizationLinkDomain`
- `validateOrganizationLinkDomain`
- `configureOrganizationInboundEmail`
- `validateOrganizationInboundEmail`
- `provisionOrganizationSmsNumber`
- `configureOrganizationAlphaSender`
- `saveOrganizationA2pRegistrationDraft`
- `beginOrganizationA2pBrandInquiry`
- `beginOrganizationA2pCampaignInquiry`
- `refreshOrganizationA2pCampaignStatus`

Provider webhooks:

- `sendGridInboundEmail`
- `twilioInboundSms`
- `twilioMessageStatus`

Trusted adapter:

- `TwilioSmsAdapter` / `getTwilioSmsAdapter()`

## Tests added

The Functions gate now covers:

- canonical STOP/START/HELP classification;
- E.164, country and domain normalization;
- alphanumeric sender validation;
- Twilio signature payload construction and tamper rejection;
- SendGrid inbound multipart text-field parsing;
- attachment file-part exclusion from the inbound text persistence path.

The existing SendGrid signature, delivery-state, suppression, rendering, consent and outbox tests remain unchanged and continue to run.

## Reconciliation after Release 6

Before merging this PR after R6 lands:

1. rebase on the promoted R6 main branch;
2. map the new communication-infrastructure client into the accepted R6 organization configuration/admin surface rather than restoring a competing page architecture;
3. review any R6 changes to capability/governance contracts and keep all provider mutations server-authoritative;
4. review any R6 observability standard and adapt provider health/status reporting without creating a parallel telemetry model;
5. review any R6 configuration/versioning standard that should wrap this organization infrastructure while preserving the provider identifiers and verification state built here;
6. retain the existing shared email/SMS integration ports unless R6 has intentionally versioned/replaced them;
7. run combined CI/Firestore/browser acceptance after reconciliation;
8. perform controlled real-provider acceptance only after the provider prerequisites below are available.

## Real-provider acceptance prerequisites

A green unit/build pipeline is not proof that a client can yet send live branded traffic. Controlled provider acceptance requires:

- production `SENDGRID_API_KEY` with Domain Authentication, Link Branding and Inbound Parse permissions;
- production `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`;
- deployed `COMMUNICATION_WEBHOOK_BASE_URL` matching callback signature validation;
- client-owned DNS records for sending, link and inbound domains;
- Twilio ISV/Reseller Trust Hub eligibility for Compliance Embeddable;
- a test organization with approved A2P registration for US 10DLC traffic;
- explicit test recipients/phone numbers and no assumption that provider acceptance equals human delivery or engagement.

## Pre-merge hardening note

External resource creation and local Firestore persistence cannot be one atomic transaction. The admin entry points avoid ordinary duplicate provisioning by reusing stored provider resources, but a process failure after a provider resource is created and before its identifiers are persisted can leave an orphaned resource. Before enabling unrestricted self-service number/domain purchase in production, reconciliation should add provider-resource discovery/recovery or a durable provisioning-intent workflow around these external side effects. This is intentionally documented rather than hidden as a solved crash-consistency guarantee.
