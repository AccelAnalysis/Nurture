import { getCommunicationWebhookBaseUrl, twilioAccountSid, twilioAuthToken } from "./config.js";
import {
  isValidAlphaSenderId,
  normalizeCountryCode,
  normalizeE164,
  type OrganizationA2pRegistration,
  type OrganizationSmsSender,
} from "./branded-types.js";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function credentials() {
  const accountSid = twilioAccountSid.value().trim();
  const authToken = twilioAuthToken.value().trim();
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !authToken) throw new Error("Twilio server credentials are not configured.");
  return { accountSid, authToken };
}

function authorization() {
  const { accountSid, authToken } = credentials();
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`, "utf8").toString("base64")}`;
}

async function twilioRequest(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: authorization(), ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 500) }; }
  }
  if (!response.ok) {
    const record = object(data);
    const message = typeof record.message === "string" ? record.message : `Twilio request failed (${response.status}).`;
    throw new Error(`Twilio: ${message}`);
  }
  return object(data);
}

async function twilioForm(url: string, values: Record<string, string | number | boolean | undefined>, method = "POST") {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) body.set(key, String(value));
  return twilioRequest(url, {
    method,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function twilioJson(url: string, value: unknown, method = "POST") {
  return twilioRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

function requireSid(value: unknown, prefix: string, field: string) {
  if (typeof value !== "string" || !new RegExp(`^${prefix}[0-9a-fA-F]{32}$`).test(value)) throw new Error(`Twilio did not return a valid ${field}.`);
  return value;
}

export async function provisionTwilioSmsNumber(input: {
  organizationId: string;
  organizationName: string;
  countryCode: string;
  areaCode?: string;
}): Promise<OrganizationSmsSender> {
  const { accountSid } = credentials();
  const countryCode = normalizeCountryCode(input.countryCode);
  const webhookBase = getCommunicationWebhookBaseUrl();
  const friendlyName = `${input.organizationName.trim() || input.organizationId} via Nurture`.slice(0, 64);

  const service = await twilioForm("https://messaging.twilio.com/v1/Services", {
    FriendlyName: friendlyName,
    InboundRequestUrl: `${webhookBase}/twilioInboundSms`,
    InboundMethod: "POST",
    StatusCallback: `${webhookBase}/twilioMessageStatus`,
    StickySender: true,
    SmartEncoding: true,
  });
  const messagingServiceSid = requireSid(service.sid, "MG", "Messaging Service SID");

  const params = new URLSearchParams({ SmsEnabled: "true", PageSize: "20" });
  if (input.areaCode?.trim()) {
    if (!/^\d{3,6}$/.test(input.areaCode.trim())) throw new Error("Area code is invalid.");
    params.set("AreaCode", input.areaCode.trim());
  }
  const available = await twilioRequest(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/${countryCode}/Local.json?${params.toString()}`,
    { method: "GET" },
  );
  const candidates = Array.isArray(available.available_phone_numbers) ? available.available_phone_numbers : [];
  const first = candidates.map(object).find((candidate) => typeof candidate.phone_number === "string");
  if (!first || typeof first.phone_number !== "string") throw new Error(`Twilio has no SMS-capable local number available for ${countryCode}.`);
  const phoneNumber = normalizeE164(first.phone_number);

  const purchased = await twilioForm(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
    { PhoneNumber: phoneNumber, FriendlyName: friendlyName },
  );
  const phoneNumberSid = requireSid(purchased.sid, "PN", "phone-number SID");

  await twilioForm(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}/PhoneNumbers`, {
    PhoneNumberSid: phoneNumberSid,
  });

  const at = new Date().toISOString();
  const usLongCode = countryCode === "US";
  return {
    organizationId: input.organizationId,
    provider: "twilio",
    senderKind: "long-code",
    messagingServiceSid,
    phoneNumberSid,
    phoneNumber,
    countryCode,
    status: usLongCode ? "pending" : "ready",
    ...(usLongCode ? { reason: "US long-code outbound messaging remains blocked until organization A2P 10DLC registration is approved." } : { verifiedAt: at }),
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
  const body: Record<string, string> = {
    brandType: input.brandType,
    friendlyName: value.brandName,
    notificationEmail: value.contactEmail,
    businessName: value.legalBusinessName,
    businessWebsite: value.website,
    businessRegistrationCountry: normalizeCountryCode(value.countryCode),
  };
  if (value.businessRegistrationType) body.businessRegistrationAuthority = value.businessRegistrationType;
  if (value.businessRegistrationId) body.businessRegistrationNumber = value.businessRegistrationId;
  if (value.businessIndustry) body.businessIndustry = value.businessIndustry;
  if (value.businessType) body.businessType = value.businessType;
  return complianceInquiry(await twilioJson("https://trusthub.twilio.com/v1/A2PBrandRegistrations", body));
}

export async function initializeTwilioA2pCampaignInquiry(input: {
  registration: OrganizationA2pRegistration;
  sender: OrganizationSmsSender;
  a2pBrandRegistrationSid: string;
}) {
  if (!input.sender.messagingServiceSid) throw new Error("A2P campaign registration requires an organization Messaging Service.");
  const value = input.registration;
  const samples = (value.sampleMessages ?? []).filter(Boolean).slice(0, 5);
  const body: Record<string, string> = {
    a2pBrandRegistrationSid: input.a2pBrandRegistrationSid,
    messagingServiceSid: input.sender.messagingServiceSid,
    useCaseDescription: value.messagingUseCase ?? "Organization customer lifecycle and account communications managed through Nurture.",
    optInWorkflowDescription: value.optInDescription ?? "Customers grant purpose-specific SMS consent in the organization's Nurture-powered registration or preference experience.",
    optOutKeywords: "STOP,STOPALL,UNSUBSCRIBE,CANCEL,END,QUIT",
    optOutMessage: value.optOutMessageSample ?? `${value.brandName}: You are unsubscribed from SMS. Reply START to resume where permitted.`,
    helpKeywords: "HELP,INFO",
    helpMessage: value.helpMessageSample ?? `${value.brandName}: Reply STOP to opt out. Contact the organization for support.`,
  };
  if (value.privacyPolicyUrl) body.privacyPolicyUrl = value.privacyPolicyUrl;
  if (value.termsAndConditionsUrl) body.termsAndConditionsUrl = value.termsAndConditionsUrl;
  samples.forEach((sample, index) => { body[`useCaseSampleMessage${index + 1}`] = sample; });
  return complianceInquiry(await twilioJson("https://trusthub.twilio.com/v1/A2PCampaignRegistrations", body));
}

export async function getTwilioA2pCampaignStatus(messagingServiceSid: string) {
  requireSid(messagingServiceSid, "MG", "Messaging Service SID");
  const response = await twilioRequest(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}/Compliance/Usa2p`, { method: "GET" });
  const status = typeof response.campaign_status === "string" ? response.campaign_status.toUpperCase() : "UNKNOWN";
  const registrationStatus: OrganizationA2pRegistration["status"] =
    status === "VERIFIED" || status === "APPROVED" ? "approved" :
      status === "FAILED" || status === "REJECTED" ? "rejected" :
        status === "IN_PROGRESS" || status === "IN_REVIEW" ? "in-review" : "submitted";
  return { providerStatus: status, registrationStatus, response };
}
