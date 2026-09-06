import { getCommunicationWebhookBaseUrl } from "./config.js";
import {
  isValidAlphaSenderId,
  normalizeCountryCode,
  normalizeE164,
  type OrganizationA2pRegistration,
  type OrganizationSmsSender,
} from "./branded-types.js";
import {
  getTwilioCredentials,
  objectRecord,
  requireTwilioSid,
  twilioForm,
  twilioJson,
  twilioRequest,
} from "./twilio-client.js";

export async function provisionTwilioSmsNumber(input: {
  organizationId: string;
  organizationName: string;
  countryCode: string;
  areaCode?: string;
}): Promise<OrganizationSmsSender> {
  const { accountSid } = getTwilioCredentials();
  const countryCode = normalizeCountryCode(input.countryCode);
  const webhookBase = getCommunicationWebhookBaseUrl();
  const friendlyName = `${input.organizationName.trim() || input.organizationId} via Nurture`.slice(0, 64);

  const { data: service } = await twilioForm("https://messaging.twilio.com/v1/Services", {
    FriendlyName: friendlyName,
    InboundRequestUrl: `${webhookBase}/twilioInboundSms`,
    InboundMethod: "POST",
    StatusCallback: `${webhookBase}/twilioMessageStatus?organizationId=${encodeURIComponent(input.organizationId)}`,
    StickySender: true,
    SmartEncoding: true,
  });
  const messagingServiceSid = requireTwilioSid(service.sid, "MG", "Messaging Service SID");

  const params = new URLSearchParams({ SmsEnabled: "true", PageSize: "20" });
  if (input.areaCode?.trim()) {
    if (!/^\d{3,6}$/.test(input.areaCode.trim())) throw new Error("Area code is invalid.");
    params.set("AreaCode", input.areaCode.trim());
  }
  const { data: available } = await twilioRequest(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/${countryCode}/Local.json?${params.toString()}`,
    { method: "GET" },
  );
  const candidates = Array.isArray(available.available_phone_numbers) ? available.available_phone_numbers : [];
  const first = candidates.map(objectRecord).find((candidate) => typeof candidate.phone_number === "string");
  if (!first || typeof first.phone_number !== "string") throw new Error(`Twilio has no SMS-capable local number available for ${countryCode}.`);
  const phoneNumber = normalizeE164(first.phone_number);

  const { data: purchased } = await twilioForm(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
    { PhoneNumber: phoneNumber, FriendlyName: friendlyName },
  );
  const phoneNumberSid = requireTwilioSid(purchased.sid, "PN", "phone-number SID");

  await twilioForm(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}/PhoneNumbers`, {
    PhoneNumberSid: phoneNumberSid,
  });

  const at = new Date().toISOString();
  const reason = countryCode === "US"
    ? "US long-code outbound messaging remains blocked until organization A2P 10DLC registration is approved."
    : `The ${countryCode} number is provisioned, but outbound messaging remains blocked until country-specific regulatory requirements are verified.`;
  return {
    organizationId: input.organizationId,
    provider: "twilio",
    senderKind: "long-code",
    messagingServiceSid,
    phoneNumberSid,
    phoneNumber,
    countryCode,
    status: "pending",
    reason,
    updatedAt: at,
  };
}

export async function attachTwilioAlphaSender(input: {
  current: OrganizationSmsSender;
  alphaSenderId: string;
  destinationCountryCode?: string;
}): Promise<OrganizationSmsSender> {
  if (!input.current.messagingServiceSid) throw new Error("Configure an organization Messaging Service before adding an alphanumeric sender.");
  const alphaSenderId = input.alphaSenderId.trim();
  if (!isValidAlphaSenderId(alphaSenderId)) throw new Error("Alphanumeric Sender ID must be 1–11 supported characters and contain a letter.");
  const destinationCountryCode = input.destinationCountryCode ? normalizeCountryCode(input.destinationCountryCode) : undefined;
  const serviceSid = input.current.messagingServiceSid;
  if (destinationCountryCode) {
    await twilioForm(`https://messaging.twilio.com/v1/Services/${serviceSid}/DestinationAlphaSenders`, {
      AlphaSender: alphaSenderId,
      IsoCountryCode: destinationCountryCode,
    });
  } else {
    await twilioForm(`https://messaging.twilio.com/v1/Services/${serviceSid}/AlphaSenders`, { AlphaSender: alphaSenderId });
  }
  const at = new Date().toISOString();
  const countries = new Set(input.current.alphaAllowedCountryCodes ?? []);
  if (destinationCountryCode) countries.add(destinationCountryCode);
  return {
    ...input.current,
    alphaSenderId,
    alphaAllowedCountryCodes: [...countries].sort(),
    updatedAt: at,
  };
}

export interface ComplianceInquiry {
  id: string;
  sessionId: string;
  sessionToken: string;
}

function complianceInquiry(response: Record<string, unknown>): ComplianceInquiry {
  const id = typeof response.id === "string" ? response.id : "";
  const sessionId = typeof response.sessionId === "string" ? response.sessionId : typeof response.session_id === "string" ? response.session_id : "";
  const sessionToken = typeof response.sessionToken === "string" ? response.sessionToken : typeof response.session_token === "string" ? response.session_token : "";
  if (!id || !sessionId || !sessionToken) throw new Error("Twilio did not return a usable Compliance Embeddable inquiry.");
  return { id, sessionId, sessionToken };
}

export async function initializeTwilioA2pBrandInquiry(input: { registration: OrganizationA2pRegistration; brandType: "STANDARD" | "SOLE_PROPRIETOR" }) {
  const value = input.registration;
  if (!value.contactEmail) throw new Error("A2P registration requires a notification email.");
  const body: Record<string, unknown> = {
    brandType: input.brandType,
    friendlyName: value.brandName,
    notificationEmail: value.contactEmail,
    businessName: value.legalBusinessName,
    businessWebsite: value.website,
    businessCountry: normalizeCountryCode(value.countryCode),
  };
  if (value.businessRegistrationType) body.businessRegistrationAuthority = value.businessRegistrationType;
  if (value.businessRegistrationId) body.businessRegistrationNumber = value.businessRegistrationId;
  if (value.businessIndustry) body.businessIndustry = value.businessIndustry;
  if (value.businessType) body.businessType = value.businessType;
  if (value.street) body.businessStreetAddress = value.street;
  if (value.city) body.businessCity = value.city;
  if (value.region) body.businessStateProvinceRegion = value.region;
  if (value.postalCode) body.businessPostalCode = value.postalCode;
  if (value.contactEmail) body.businessContactEmail = value.contactEmail;
  if (value.contactPhone) body.businessContactPhone = normalizeE164(value.contactPhone);
  const { data } = await twilioJson("https://trusthub.twilio.com/v1/A2PBrandRegistrations", body);
  return complianceInquiry(data);
}

export async function initializeTwilioA2pCampaignInquiry(input: {
  registration: OrganizationA2pRegistration;
  sender: OrganizationSmsSender;
  a2pBrandRegistrationSid: string;
}) {
  if (!input.sender.messagingServiceSid) throw new Error("A2P campaign registration requires an organization Messaging Service.");
  const value = input.registration;
  if (!value.privacyPolicyUrl || !value.termsAndConditionsUrl) {
    throw new Error("A2P campaign registration requires public HTTPS Privacy Policy and Terms & Conditions URLs.");
  }
  const brandRegistrationSid = requireTwilioSid(input.a2pBrandRegistrationSid, "BN", "A2P Brand Registration SID");
  const samples = (value.sampleMessages ?? []).filter(Boolean).slice(0, 5);
  const body: Record<string, unknown> = {
    a2pBrandRegistrationSid: brandRegistrationSid,
    messagingServiceSid: input.sender.messagingServiceSid,
    useCaseDescription: value.messagingUseCase ?? "Organization customer lifecycle and account communications managed through Nurture.",
    useCaseOptInTypes: ["WEB_FORM"],
    useCaseOptInDescription: value.optInDescription ?? "Customers grant purpose-specific SMS consent in the organization's Nurture-powered registration or preference experience before any promotional messaging is sent.",
    optInKeywords: ["START", "SUBSCRIBE"],
    optInMessageSample: `${value.brandName}: SMS transport is enabled. Your communication consent settings still apply. Reply STOP to opt out.`,
    optOutKeywords: ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"],
    optOutMessageSample: value.optOutMessageSample ?? `${value.brandName}: You are unsubscribed from SMS. Reply START to resume where permitted.`,
    helpKeywords: ["HELP", "INFO"],
    helpMessageSample: value.helpMessageSample ?? `${value.brandName}: Reply STOP to opt out. Contact the organization for support.`,
    privacyPolicyUrl: value.privacyPolicyUrl,
    termsAndConditionsUrl: value.termsAndConditionsUrl,
  };
  samples.forEach((sample, index) => { body[`useCaseSampleMessage${index + 1}`] = sample.slice(0, 1_024); });
  const { data } = await twilioJson("https://trusthub.twilio.com/v1/A2PCampaignRegistrations", body);
  return complianceInquiry(data);
}

export async function getTwilioA2pCampaignStatus(messagingServiceSid: string) {
  requireTwilioSid(messagingServiceSid, "MG", "Messaging Service SID");
  const { data } = await twilioRequest(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}/Compliance/Usa2p`, { method: "GET" });
  const compliance = Array.isArray(data.compliance) ? data.compliance.map(objectRecord) : [];
  const current = compliance.find((item) => typeof item.campaign_status === "string") ?? data;
  const status = typeof current.campaign_status === "string" ? current.campaign_status.toUpperCase() : "UNKNOWN";
  const registrationStatus: OrganizationA2pRegistration["status"] =
    status === "VERIFIED" || status === "APPROVED" ? "approved" :
      status === "FAILED" || status === "REJECTED" || status === "SUSPENDED" ? "rejected" :
        status === "IN_PROGRESS" || status === "IN_REVIEW" ? "in-review" : "submitted";
  return { providerStatus: status, registrationStatus, response: current };
}
