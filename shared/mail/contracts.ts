export const NURTURE_MAIL_SCHEMA_VERSION = 1 as const;

export const mailPurposes = ["transactional", "marketing"] as const;
export type MailPurpose = (typeof mailPurposes)[number];

export const mailTrafficClasses = ["transactional", "lifecycle", "marketing", "warming"] as const;
export type MailTrafficClass = (typeof mailTrafficClasses)[number];

export const mailDeliveryStates = [
  "created",
  "policy_approved",
  "queued",
  "routing",
  "connecting",
  "negotiating",
  "transmitting",
  "accepted",
  "deferred",
  "permanent_failure",
  "acceptance_uncertain",
  "bounced",
  "complained",
  "unsubscribed",
  "suppressed",
  "expired",
  "cancelled",
] as const;
export type MailDeliveryState = (typeof mailDeliveryStates)[number];

export type MailAttemptOutcome =
  | "accepted"
  | "deferred"
  | "permanent_failure"
  | "acceptance_uncertain";

export type MailSmtpReason =
  | "accepted"
  | "destination-temporary"
  | "mailbox-temporary"
  | "reputation-temporary"
  | "recipient-permanent"
  | "mailbox-permanent"
  | "policy-permanent"
  | "authentication-permanent"
  | "dns-temporary"
  | "dns-permanent"
  | "tls-temporary"
  | "tls-permanent"
  | "connection-temporary"
  | "message-too-large"
  | "unknown-temporary"
  | "unknown-permanent"
  | "acceptance-uncertain";

export interface MailboxAddress {
  address: string;
  name?: string;
}

export interface ImmutableMailBlobReference {
  contentType: "message/rfc822";
  sha256: string;
  byteLength: number;
  storageKey: string;
}

export interface ImmutableMailMessage {
  schemaVersion: typeof NURTURE_MAIL_SCHEMA_VERSION;
  messageId: string;
  organizationId: string;
  /** Existing Nurture communicationMessages/{id} identity, when this originated from Communications. */
  communicationMessageId?: string;
  purpose: MailPurpose;
  from: MailboxAddress;
  replyTo?: MailboxAddress;
  /** Nurture Mail uses one envelope recipient per immutable message/delivery. */
  to: MailboxAddress;
  subject: string;
  messageIdHeader: string;
  blob: ImmutableMailBlobReference;
  createdAt: string;
}

export interface MailEnvelope {
  schemaVersion: typeof NURTURE_MAIL_SCHEMA_VERSION;
  deliveryId: string;
  organizationId: string;
  messageId: string;
  mailFrom: string;
  rcptTo: string;
  recipientDomain: string;
  sendingIdentityId: string;
  egressPoolId: string;
  trafficClass: MailTrafficClass;
  createdAt: string;
}

export interface MailTlsObservation {
  mode: "none" | "opportunistic" | "required";
  negotiated: boolean;
  version?: string;
  cipher?: string;
  peerName?: string;
  policy?: "none" | "mta-sts" | "dane";
}

export interface MailDeliveryAttempt {
  schemaVersion: typeof NURTURE_MAIL_SCHEMA_VERSION;
  attemptId: string;
  attempt: number;
  startedAt: string;
  completedAt?: string;
  mxHost?: string;
  mxPreference?: number;
  sourceIp?: string;
  sourceHostname?: string;
  smtpCode?: number;
  enhancedStatusCode?: string;
  rawResponse?: string;
  normalizedReason?: MailSmtpReason;
  outcome?: MailAttemptOutcome;
  tls?: MailTlsObservation;
  retryAfterMs?: number;
}

export interface MailDeliveryLease {
  /** Fencing token; every lease acquisition receives a fresh opaque token. */
  token: string;
  owner: string;
  acquiredAt: string;
  expiresAt: string;
  heartbeatAt?: string;
}

export interface MailDeliveryRecord {
  schemaVersion: typeof NURTURE_MAIL_SCHEMA_VERSION;
  deliveryId: string;
  organizationId: string;
  messageId: string;
  envelope: MailEnvelope;
  state: MailDeliveryState;
  stateReason?: string;
  attempts: MailDeliveryAttempt[];
  nextAttemptAt?: string;
  expiresAt: string;
  lease?: MailDeliveryLease;
  acceptedAt?: string;
  bouncedAt?: string;
  complainedAt?: string;
  unsubscribedAt?: string;
  updatedAt: string;
}

export type MailDnsRequirementKind =
  | "dkim"
  | "spf"
  | "dmarc"
  | "return-path-mx"
  | "return-path-spf";

export interface MailDnsRequirement {
  kind: MailDnsRequirementKind;
  recordType: "TXT" | "MX" | "CNAME";
  host: string;
  value: string;
  status: "pending" | "verified" | "failed";
  observedValues?: string[];
  checkedAt?: string;
  required: boolean;
}

export type MailSendingIdentityStatus = "draft" | "pending" | "ready" | "blocked";

export interface MailSendingIdentity {
  schemaVersion: typeof NURTURE_MAIL_SCHEMA_VERSION;
  id: string;
  organizationId: string;
  fromDomain: string;
  mailFromDomain: string;
  dkimDomain: string;
  dkimSelector: string;
  /** Opaque KMS/HSM key identifier. Raw private key material must never be persisted here. */
  dkimKeyReference: string;
  egressPoolId: string;
  allowedTrafficClasses: MailTrafficClass[];
  status: MailSendingIdentityStatus;
  dnsRequirements: MailDnsRequirement[];
  verifiedAt?: string;
  reason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MailEgressAddress {
  ip: string;
  hostname: string;
  family: 4 | 6;
  status: "warming" | "ready" | "draining" | "blocked";
}

export interface MailEgressPool {
  schemaVersion: typeof NURTURE_MAIL_SCHEMA_VERSION;
  id: string;
  trafficClass: MailTrafficClass;
  addresses: MailEgressAddress[];
  status: "warming" | "ready" | "degraded" | "blocked";
  maxConnectionsPerDestination: number;
  maxMessagesPerMinutePerDestination: number;
  updatedAt: string;
}

export interface MailMxTarget {
  host: string;
  preference: number;
  addresses: string[];
}

export interface MailRoute {
  recipientDomain: string;
  targets: MailMxTarget[];
  resolvedAt: string;
  expiresAt?: string;
  nullMx: boolean;
}

export interface MailDestinationPolicy {
  recipientDomain: string;
  maxConcurrentConnections: number;
  maxMessagesPerMinute: number;
  backoffUntil?: string;
  reason?: string;
  updatedAt: string;
}

export interface MailSmtpObservation {
  code: number;
  enhancedStatusCode?: string;
  rawResponse: string;
  reason: MailSmtpReason;
  retryable: boolean;
  accepted: boolean;
}

export type MailReputationScope = "organization" | "sending-domain" | "egress-ip" | "egress-pool" | "destination";

export interface MailReputationSnapshot {
  schemaVersion: typeof NURTURE_MAIL_SCHEMA_VERSION;
  scope: MailReputationScope;
  scopeId: string;
  windowStartedAt: string;
  windowEndedAt: string;
  attempted: number;
  accepted: number;
  deferred: number;
  permanentFailures: number;
  bounced: number;
  complaints: number;
  unsubscribes: number;
  health: "healthy" | "watch" | "degraded" | "blocked";
  updatedAt: string;
}

export interface MailWorkerJob {
  schemaVersion: typeof NURTURE_MAIL_SCHEMA_VERSION;
  jobId: string;
  delivery: MailDeliveryRecord;
  messageBlob: ImmutableMailBlobReference;
  route: MailRoute;
  destinationPolicy: MailDestinationPolicy;
  lease: MailDeliveryLease;
  issuedAt: string;
}

export interface MailWorkerResult {
  schemaVersion: typeof NURTURE_MAIL_SCHEMA_VERSION;
  jobId: string;
  deliveryId: string;
  organizationId: string;
  leaseToken: string;
  leaseOwner: string;
  /** Furthest protocol phase reached; scheduler persists intermediate states before the outcome. */
  phase: "routing" | "connecting" | "negotiating" | "transmitting";
  attempt: MailDeliveryAttempt;
  outcome: MailAttemptOutcome;
  completedAt: string;
}
