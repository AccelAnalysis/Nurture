import { httpsCallable } from "firebase/functions";
import { backendUnavailableMessage, releaseBackendReady } from "../../app/release/readiness";
import { firebaseConfigured, functions } from "../../firebase";

export type ProvisioningStatus = "not-configured" | "pending" | "ready" | "blocked";

export interface DnsRecordRequirement {
  type: "CNAME" | "TXT" | "MX";
  host: string;
  value: string;
  valid: boolean;
}

export interface EmailDomainView {
  organizationId: string;
  rootDomain: string;
  subdomain: string;
  domain: string;
  fromAddress: string;
  fromName: string;
  replyTo?: string;
  status: ProvisioningStatus;
  dnsRecords: DnsRecordRequirement[];
  reason?: string;
  verifiedAt?: string;
}

export interface LinkDomainView {
  organizationId: string;
  rootDomain: string;
  subdomain: string;
  domain: string;
  status: ProvisioningStatus;
  dnsRecords: DnsRecordRequirement[];
  reason?: string;
  verifiedAt?: string;
}

export interface InboundEmailView {
  organizationId: string;
  hostname: string;
  status: ProvisioningStatus;
  dnsRecords: DnsRecordRequirement[];
  reason?: string;
  verifiedAt?: string;
}

export interface SmsSenderView {
  organizationId: string;
  senderKind: "long-code" | "toll-free" | "short-code" | "alphanumeric";
  phoneNumber?: string;
  alphaSenderId?: string;
  alphaAllowedCountryCodes?: string[];
  countryCode?: string;
  status: ProvisioningStatus;
  reason?: string;
  verifiedAt?: string;
}

export interface A2pRegistrationView {
  organizationId: string;
  brandName: string;
  countryCode: string;
  status: "not-configured" | "draft" | "submitted" | "in-review" | "approved" | "rejected";
  reason?: string;
}

export interface BrandedCommunicationInfrastructureView {
  emailDomain: EmailDomainView | null;
  linkDomain: LinkDomainView | null;
  inboundEmail: InboundEmailView | null;
  smsSender: SmsSenderView | null;
  smsA2p: A2pRegistrationView | null;
}

export interface ComplianceInquirySession {
  id: string;
  sessionId: string;
  sessionToken: string;
}

function requireFunctions() {
  if (!releaseBackendReady) throw new Error(backendUnavailableMessage);
  if (!firebaseConfigured || !functions) throw new Error("Communications require the configured Nurture Firebase project.");
  return functions;
}

async function call<Input, Output>(name: string, input: Input) {
  const callable = httpsCallable<Input, Output>(requireFunctions(), name);
  const result = await callable(input);
  return result.data;
}

export async function getBrandedCommunicationInfrastructure(organizationId: string) {
  const result = await call<{ organizationId: string }, { infrastructure: BrandedCommunicationInfrastructureView }>(
    "getBrandedCommunicationInfrastructureAdmin",
    { organizationId },
  );
  return result.infrastructure;
}

export async function configureEmailDomain(input: { organizationId: string; rootDomain: string; subdomain: string; fromAddress: string; fromName: string; replyTo?: string }) {
  return call<typeof input, { domain: EmailDomainView; reused: boolean }>("configureOrganizationEmailDomain", input);
}

export async function validateEmailDomain(organizationId: string) {
  return call<{ organizationId: string }, { domain: EmailDomainView }>("validateOrganizationEmailDomain", { organizationId });
}

export async function configureLinkDomain(input: { organizationId: string; rootDomain: string; subdomain: string }) {
  return call<typeof input, { domain: LinkDomainView; reused: boolean }>("configureOrganizationLinkDomain", input);
}

export async function validateLinkDomain(organizationId: string) {
  return call<{ organizationId: string }, { domain: LinkDomainView }>("validateOrganizationLinkDomain", { organizationId });
}

export async function configureInboundEmail(input: { organizationId: string; hostname: string }) {
  return call<typeof input, { inbound: InboundEmailView; reused: boolean }>("configureOrganizationInboundEmail", input);
}

export async function validateInboundEmail(organizationId: string) {
  return call<{ organizationId: string }, { inbound: InboundEmailView }>("validateOrganizationInboundEmail", { organizationId });
}

export async function provisionSmsNumber(input: { organizationId: string; countryCode: string; areaCode?: string; confirmPurchase: true }) {
  return call<typeof input, { sender: SmsSenderView; reused: boolean; purchased: boolean }>("provisionOrganizationSmsNumber", input);
}

export async function configureAlphaSender(input: { organizationId: string; alphaSenderId: string; destinationCountryCode?: string }) {
  return call<typeof input, { sender: SmsSenderView }>("configureOrganizationAlphaSender", input);
}

export interface A2pDraftInput {
  organizationId: string;
  legalBusinessName: string;
  brandName: string;
  website: string;
  privacyPolicyUrl?: string;
  termsAndConditionsUrl?: string;
  countryCode: string;
  businessRegistrationId?: string;
  businessRegistrationType?: string;
  businessType?: string;
  businessIndustry?: string;
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
}

export async function saveA2pRegistrationDraft(input: A2pDraftInput) {
  return call<A2pDraftInput, { registration: A2pRegistrationView }>("saveOrganizationA2pRegistrationDraft", input);
}

export async function beginA2pBrandInquiry(organizationId: string, brandType: "STANDARD" | "SOLE_PROPRIETOR") {
  const result = await call<{ organizationId: string; brandType: string }, { inquiry: ComplianceInquirySession }>("beginOrganizationA2pBrandInquiry", { organizationId, brandType });
  return result.inquiry;
}

export async function beginA2pCampaignInquiry(organizationId: string, a2pBrandRegistrationSid: string) {
  const result = await call<{ organizationId: string; a2pBrandRegistrationSid: string }, { inquiry: ComplianceInquirySession }>("beginOrganizationA2pCampaignInquiry", { organizationId, a2pBrandRegistrationSid });
  return result.inquiry;
}

export async function refreshA2pCampaignStatus(organizationId: string) {
  return call<{ organizationId: string }, { providerStatus: string; registration: A2pRegistrationView; sender: SmsSenderView }>("refreshOrganizationA2pCampaignStatus", { organizationId });
}
