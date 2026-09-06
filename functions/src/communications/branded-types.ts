export type CommunicationChannel = "email" | "sms";
export type CommunicationPurpose = "service" | "marketing";

export type ProvisioningStatus = "not-configured" | "pending" | "ready" | "blocked";

export interface DnsRecordRequirement {
  type: "CNAME" | "TXT" | "MX";
  host: string;
  value: string;
  valid: boolean;
}

export interface OrganizationEmailDomain {
  organizationId: string;
  provider: "sendgrid";
  rootDomain: string;
  subdomain: string;
  domain: string;
  fromAddress: string;
  fromName: string;
  replyTo?: string;
  authenticatedDomain?: string;
  providerDomainId?: string;
  status: ProvisioningStatus;
  dnsRecords: DnsRecordRequirement[];
  verifiedAt?: string;
  reason?: string;
  updatedAt: string;
}

export interface OrganizationLinkDomain {
  organizationId: string;
  provider: "sendgrid";
  rootDomain: string;
  subdomain: string;
  domain: string;
  providerLinkBrandId?: string;
  status: ProvisioningStatus;
  dnsRecords: DnsRecordRequirement[];
  verifiedAt?: string;
  reason?: string;
  updatedAt: string;
}

export interface OrganizationInboundEmail {
  organizationId: string;
  provider: "sendgrid";
  hostname: string;
  webhookUrl: string;
  providerSecurityPolicyId?: string;
  providerPublicKey?: string;
  status: ProvisioningStatus;
  dnsRecords: DnsRecordRequirement[];
  verifiedAt?: string;
  reason?: string;
  updatedAt: string;
}

export type SmsSenderKind = "long-code" | "toll-free" | "short-code" | "alphanumeric";

export interface OrganizationSmsSender {
  organizationId: string;
  provider: "twilio";
  senderKind: SmsSenderKind;
  messagingServiceSid?: string;
  phoneNumberSid?: string;
  phoneNumber?: string;
  alphaSenderId?: string;
  /** Explicit ISO-3166-1 alpha-2 destinations for organization-managed alpha sender activation. */
  alphaAllowedCountryCodes?: string[];
  countryCode?: string;
  status: ProvisioningStatus;
  verifiedAt?: string;
  reason?: string;
  updatedAt: string;
}

export type A2pRegistrationStatus = "not-configured" | "draft" | "submitted" | "in-review" | "approved" | "rejected";

export interface OrganizationA2pRegistration {
  organizationId: string;
  provider: "twilio";
  legalBusinessName: string;
  brandName: string;
  businessIdentityType?: string;
  businessRegistrationId?: string;
  businessRegistrationType?: string;
  businessType?: string;
  businessIndustry?: string;
  website: string;
  privacyPolicyUrl?: string;
  termsAndConditionsUrl?: string;
  countryCode: string;
  contactEmail?: string;
  contactPhone?: string;
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  messagingUseCase?: string;
  optInDescription?: string;
  sampleMessages?: string[];
  helpMessageSample?: string;
  optOutMessageSample?: string;
  providerCustomerProfileSid?: string;
  providerTrustProductSid?: string;
  providerBrandSid?: string;
  providerCampaignSid?: string;
  status: A2pRegistrationStatus;
  reason?: string;
  updatedAt: string;
}

export interface InboundCommunicationRoute {
  organizationId: string;
  channel: CommunicationChannel;
  senderIdentity: string;
  recipientIdentity: string;
  providerMessageId: string;
  body: string;
  receivedAt: string;
}

export interface SmsCarrierPreference {
  organizationId: string;
  recipientHash: string;
  carrierOptOut: boolean;
  source: "STOP" | "START" | "provider" | "admin";
  updatedAt: string;
}

export type SmsComplianceKeyword = "STOP" | "START" | "HELP" | "NONE";

export function classifySmsComplianceKeyword(body: string): SmsComplianceKeyword {
  const keyword = body.trim().toUpperCase().split(/\s+/)[0] ?? "";
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(keyword)) return "STOP";
  if (["START", "UNSTOP", "YES"].includes(keyword)) return "START";
  if (["HELP", "INFO"].includes(keyword)) return "HELP";
  return "NONE";
}

export function isValidAlphaSenderId(value: string) {
  return /^[A-Za-z0-9 +_&-]{1,11}$/.test(value) && /[A-Za-z]/.test(value);
}

export function normalizeE164(value: string) {
  const normalized = value.replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("Phone number must be valid E.164.");
  return normalized;
}

export function normalizeCountryCode(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) throw new Error("Country code must be ISO-3166-1 alpha-2.");
  return normalized;
}

export function normalizeDomain(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");
  if (normalized.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized)) {
    throw new Error("Domain is invalid.");
  }
  return normalized;
}

export function normalizeDomainLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) throw new Error("Domain label is invalid.");
  return normalized;
}

export function composeSubdomain(rootDomain: string, subdomain: string) {
  return `${normalizeDomainLabel(subdomain)}.${normalizeDomain(rootDomain)}`;
}
