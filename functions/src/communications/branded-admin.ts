import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "../firebase.js";
import { assertOrganizationCapability } from "../billing/store.js";
import { sendGridApiKey, twilioAccountSid, twilioAuthToken } from "./config.js";
import {
  getBrandedCommunicationInfrastructure,
  getOrganizationA2pRegistration,
  getOrganizationEmailDomain,
  getOrganizationSmsSender,
  saveOrganizationA2pRegistration,
  saveOrganizationEmailDomain,
  saveOrganizationInboundEmail,
  saveOrganizationLinkDomain,
  saveOrganizationSmsSender,
} from "./branded-store.js";
import {
  normalizeCountryCode,
  normalizeDomain,
  type OrganizationA2pRegistration,
  type OrganizationSmsSender,
} from "./branded-types.js";
import {
  provisionSendGridEmailDomain,
  provisionSendGridInboundEmail,
  provisionSendGridLinkDomain,
  validateSendGridEmailDomain,
  validateSendGridInboundEmail,
  validateSendGridLinkDomain,
} from "./sendgrid-provisioning.js";
import {
  attachTwilioAlphaSender,
  getTwilioA2pCampaignStatus,
  initializeTwilioA2pBrandInquiry,
  initializeTwilioA2pCampaignInquiry,
  provisionTwilioSmsNumber,
} from "./twilio-provisioning.js";

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request data must be an object.");
  return value as Record<string, unknown>;
}

function userId(auth: { uid: string } | undefined) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in to continue.");
  return auth.uid;
}

function id(value: unknown, field: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new HttpsError("invalid-argument", `${field} is invalid.`);
  return value;
}

function text(value: unknown, field: string, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new HttpsError("invalid-argument", `${field} is invalid.`);
  return value.trim();
}

function optionalText(value: unknown, max = 2_000) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length > max) throw new HttpsError("invalid-argument", "Optional text value is invalid.");
  return value.trim();
}

function url(value: unknown, field: string) {
  const raw = text(value, field, 2_048);
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new HttpsError("invalid-argument", `${field} must be a valid HTTPS URL.`); }
  if (parsed.protocol !== "https:") throw new HttpsError("invalid-argument", `${field} must use HTTPS.`);
  return parsed.toString();
}

function optionalUrl(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return url(value, field);
}

function asHttpsError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "Communication infrastructure operation failed.");
}

async function requireManage(request: { auth?: { uid: string }; data: unknown }) {
  const data = record(request.data);
  const organizationId = id(data.organizationId, "organizationId");
  const actorUserId = userId(request.auth);
  await assertOrganizationCapability(organizationId, actorUserId, "communications.manage");
  return { data, organizationId, actorUserId };
}

async function organizationName(organizationId: string) {
  const snapshot = await db.collection("organizations").doc(organizationId).get();
  const name = snapshot.data()?.name;
  return typeof name === "string" && name.trim() ? name.trim() : organizationId;
}

export const getBrandedCommunicationInfrastructureAdmin = onCall(async (request) => {
  try {
    const { organizationId } = await requireManage(request);
    return { infrastructure: await getBrandedCommunicationInfrastructure(organizationId) };
  } catch (error) { asHttpsError(error); }
});

export const configureOrganizationEmailDomain = onCall({ secrets: [sendGridApiKey] }, async (request) => {
  try {
    const { data, organizationId, actorUserId } = await requireManage(request);
    const existing = await getOrganizationEmailDomain(organizationId);
    if (existing && existing.status !== "blocked") return { domain: existing, reused: true };
    const domain = await provisionSendGridEmailDomain({
      organizationId,
      rootDomain: normalizeDomain(text(data.rootDomain, "rootDomain", 253)),
      subdomain: text(data.subdomain, "subdomain", 63),
      fromAddress: text(data.fromAddress, "fromAddress", 320),
      fromName: text(data.fromName, "fromName", 128),
      ...(optionalText(data.replyTo, 320) ? { replyTo: optionalText(data.replyTo, 320) } : {}),
    });
    return { domain: await saveOrganizationEmailDomain(domain, actorUserId), reused: false };
  } catch (error) { asHttpsError(error); }
});

export const validateOrganizationEmailDomain = onCall({ secrets: [sendGridApiKey] }, async (request) => {
  try {
    const { organizationId, actorUserId } = await requireManage(request);
    const existing = await getOrganizationEmailDomain(organizationId);
    if (!existing) throw new HttpsError("failed-precondition", "Configure an email sending domain first.");
    return { domain: await saveOrganizationEmailDomain(await validateSendGridEmailDomain(existing), actorUserId) };
  } catch (error) { asHttpsError(error); }
});

export const configureOrganizationLinkDomain = onCall({ secrets: [sendGridApiKey] }, async (request) => {
  try {
    const { data, organizationId, actorUserId } = await requireManage(request);
    const current = (await getBrandedCommunicationInfrastructure(organizationId)).linkDomain;
    if (current && current.status !== "blocked") return { domain: current, reused: true };
    const domain = await provisionSendGridLinkDomain({
      organizationId,
      rootDomain: normalizeDomain(text(data.rootDomain, "rootDomain", 253)),
      subdomain: text(data.subdomain, "subdomain", 63),
    });
    return { domain: await saveOrganizationLinkDomain(domain, actorUserId), reused: false };
  } catch (error) { asHttpsError(error); }
});

export const validateOrganizationLinkDomain = onCall({ secrets: [sendGridApiKey] }, async (request) => {
  try {
    const { organizationId, actorUserId } = await requireManage(request);
    const existing = (await getBrandedCommunicationInfrastructure(organizationId)).linkDomain;
    if (!existing) throw new HttpsError("failed-precondition", "Configure a branded link domain first.");
    return { domain: await saveOrganizationLinkDomain(await validateSendGridLinkDomain(existing), actorUserId) };
  } catch (error) { asHttpsError(error); }
});

export const configureOrganizationInboundEmail = onCall({ secrets: [sendGridApiKey] }, async (request) => {
  try {
    const { data, organizationId, actorUserId } = await requireManage(request);
    const current = (await getBrandedCommunicationInfrastructure(organizationId)).inboundEmail;
    if (current && current.status !== "blocked") return { inbound: current, reused: true };
    const inbound = await provisionSendGridInboundEmail({ organizationId, hostname: normalizeDomain(text(data.hostname, "hostname", 253)) });
    return { inbound: await saveOrganizationInboundEmail(inbound, actorUserId), reused: false };
  } catch (error) { asHttpsError(error); }
});

export const validateOrganizationInboundEmail = onCall(async (request) => {
  try {
    const { organizationId, actorUserId } = await requireManage(request);
    const existing = (await getBrandedCommunicationInfrastructure(organizationId)).inboundEmail;
    if (!existing) throw new HttpsError("failed-precondition", "Configure inbound email first.");
    return { inbound: await saveOrganizationInboundEmail(await validateSendGridInboundEmail(existing), actorUserId) };
  } catch (error) { asHttpsError(error); }
});

export const provisionOrganizationSmsNumber = onCall({ secrets: [twilioAccountSid, twilioAuthToken] }, async (request) => {
  try {
    const { data, organizationId, actorUserId } = await requireManage(request);
    const existing = await getOrganizationSmsSender(organizationId);
    if (existing?.phoneNumber && existing.messagingServiceSid && existing.status !== "blocked") return { sender: existing, reused: true };
    const sender = await provisionTwilioSmsNumber({
      organizationId,
      organizationName: await organizationName(organizationId),
      countryCode: normalizeCountryCode(text(data.countryCode, "countryCode", 2)),
      ...(optionalText(data.areaCode, 6) ? { areaCode: optionalText(data.areaCode, 6) } : {}),
    });
    return { sender: await saveOrganizationSmsSender(sender, actorUserId), reused: false };
  } catch (error) { asHttpsError(error); }
});

export const configureOrganizationAlphaSender = onCall({ secrets: [twilioAccountSid, twilioAuthToken] }, async (request) => {
  try {
    const { data, organizationId, actorUserId } = await requireManage(request);
    const current = await getOrganizationSmsSender(organizationId);
    if (!current) throw new HttpsError("failed-precondition", "Provision the organization SMS sender first.");
    const sender = await attachTwilioAlphaSender({
      current,
      alphaSenderId: text(data.alphaSenderId, "alphaSenderId", 11),
      ...(optionalText(data.destinationCountryCode, 2) ? { destinationCountryCode: optionalText(data.destinationCountryCode, 2) } : {}),
    });
    return { sender: await saveOrganizationSmsSender(sender, actorUserId) };
  } catch (error) { asHttpsError(error); }
});

function a2pDraft(data: Record<string, unknown>, organizationId: string): OrganizationA2pRegistration {
  const samples = Array.isArray(data.sampleMessages) ? data.sampleMessages.map((value) => text(value, "sampleMessage", 1_600)).slice(0, 5) : [];
  const now = new Date().toISOString();
  return {
    organizationId,
    provider: "twilio",
    legalBusinessName: text(data.legalBusinessName, "legalBusinessName", 256),
    brandName: text(data.brandName, "brandName", 128),
    website: url(data.website, "website"),
    countryCode: normalizeCountryCode(text(data.countryCode, "countryCode", 2)),
    ...(optionalText(data.businessIdentityType, 64) ? { businessIdentityType: optionalText(data.businessIdentityType, 64) } : {}),
    ...(optionalText(data.businessRegistrationId, 128) ? { businessRegistrationId: optionalText(data.businessRegistrationId, 128) } : {}),
    ...(optionalText(data.businessRegistrationType, 128) ? { businessRegistrationType: optionalText(data.businessRegistrationType, 128) } : {}),
    ...(optionalText(data.businessType, 128) ? { businessType: optionalText(data.businessType, 128) } : {}),
    ...(optionalText(data.businessIndustry, 128) ? { businessIndustry: optionalText(data.businessIndustry, 128) } : {}),
    ...(optionalUrl(data.privacyPolicyUrl, "privacyPolicyUrl") ? { privacyPolicyUrl: optionalUrl(data.privacyPolicyUrl, "privacyPolicyUrl") } : {}),
    ...(optionalUrl(data.termsAndConditionsUrl, "termsAndConditionsUrl") ? { termsAndConditionsUrl: optionalUrl(data.termsAndConditionsUrl, "termsAndConditionsUrl") } : {}),
    ...(optionalText(data.contactEmail, 320) ? { contactEmail: optionalText(data.contactEmail, 320) } : {}),
    ...(optionalText(data.contactPhone, 32) ? { contactPhone: optionalText(data.contactPhone, 32) } : {}),
    ...(optionalText(data.street, 256) ? { street: optionalText(data.street, 256) } : {}),
    ...(optionalText(data.city, 128) ? { city: optionalText(data.city, 128) } : {}),
    ...(optionalText(data.region, 128) ? { region: optionalText(data.region, 128) } : {}),
    ...(optionalText(data.postalCode, 32) ? { postalCode: optionalText(data.postalCode, 32) } : {}),
    ...(optionalText(data.messagingUseCase, 2_000) ? { messagingUseCase: optionalText(data.messagingUseCase, 2_000) } : {}),
    ...(optionalText(data.optInDescription, 2_000) ? { optInDescription: optionalText(data.optInDescription, 2_000) } : {}),
    ...(optionalText(data.helpMessageSample, 1_600) ? { helpMessageSample: optionalText(data.helpMessageSample, 1_600) } : {}),
    ...(optionalText(data.optOutMessageSample, 1_600) ? { optOutMessageSample: optionalText(data.optOutMessageSample, 1_600) } : {}),
    ...(samples.length ? { sampleMessages: samples } : {}),
    status: "draft",
    updatedAt: now,
  };
}

export const saveOrganizationA2pRegistrationDraft = onCall(async (request) => {
  try {
    const { data, organizationId, actorUserId } = await requireManage(request);
    return { registration: await saveOrganizationA2pRegistration(a2pDraft(data, organizationId), actorUserId) };
  } catch (error) { asHttpsError(error); }
});

export const beginOrganizationA2pBrandInquiry = onCall({ secrets: [twilioAccountSid, twilioAuthToken] }, async (request) => {
  try {
    const { data, organizationId } = await requireManage(request);
    const registration = await getOrganizationA2pRegistration(organizationId);
    if (!registration) throw new HttpsError("failed-precondition", "Save the organization A2P business profile first.");
    const brandType = data.brandType === "SOLE_PROPRIETOR" ? "SOLE_PROPRIETOR" : "STANDARD";
    return { inquiry: await initializeTwilioA2pBrandInquiry({ registration, brandType }) };
  } catch (error) { asHttpsError(error); }
});

export const beginOrganizationA2pCampaignInquiry = onCall({ secrets: [twilioAccountSid, twilioAuthToken] }, async (request) => {
  try {
    const { data, organizationId } = await requireManage(request);
    const [registration, sender] = await Promise.all([getOrganizationA2pRegistration(organizationId), getOrganizationSmsSender(organizationId)]);
    if (!registration || !sender) throw new HttpsError("failed-precondition", "A2P business profile and SMS sender are required.");
    const brandSid = text(data.a2pBrandRegistrationSid, "a2pBrandRegistrationSid", 64);
    return { inquiry: await initializeTwilioA2pCampaignInquiry({ registration, sender, a2pBrandRegistrationSid: brandSid }) };
  } catch (error) { asHttpsError(error); }
});

function withoutReason<T extends { reason?: string }>(value: T): Omit<T, "reason"> {
  const { reason: _reason, ...rest } = value;
  return rest;
}

export const refreshOrganizationA2pCampaignStatus = onCall({ secrets: [twilioAccountSid, twilioAuthToken] }, async (request) => {
  try {
    const { organizationId, actorUserId } = await requireManage(request);
    const [registration, sender] = await Promise.all([getOrganizationA2pRegistration(organizationId), getOrganizationSmsSender(organizationId)]);
    if (!registration || !sender?.messagingServiceSid) throw new HttpsError("failed-precondition", "A2P registration and Messaging Service are required.");
    const status = await getTwilioA2pCampaignStatus(sender.messagingServiceSid);
    const now = new Date().toISOString();
    const registrationBase = withoutReason(registration);
    const updatedRegistration = await saveOrganizationA2pRegistration({
      ...registrationBase,
      status: status.registrationStatus,
      ...(status.registrationStatus === "rejected" ? { reason: `Twilio campaign status: ${status.providerStatus}` } : {}),
      updatedAt: now,
    }, actorUserId);
    let updatedSender: OrganizationSmsSender = sender;
    if (sender.countryCode === "US" && status.registrationStatus === "approved") {
      const senderBase = withoutReason(sender);
      updatedSender = await saveOrganizationSmsSender({ ...senderBase, status: "ready", verifiedAt: now, updatedAt: now }, actorUserId);
    } else if (sender.countryCode === "US" && status.registrationStatus === "rejected") {
      updatedSender = await saveOrganizationSmsSender({ ...sender, status: "blocked", reason: "Organization A2P 10DLC campaign was rejected.", updatedAt: now }, actorUserId);
    }
    return { providerStatus: status.providerStatus, registration: updatedRegistration, sender: updatedSender };
  } catch (error) { asHttpsError(error); }
});
