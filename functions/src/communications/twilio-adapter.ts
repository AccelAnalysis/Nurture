import {
  integrationFailure,
  integrationSuccess,
  type IntegrationHealth,
  type IntegrationMeta,
  type IntegrationRequestContext,
  type SmsIntegrationPort,
  type SmsSendRequest,
} from "../../../shared/platform/integrations.js";
import { getOrganizationSmsSender, getSmsCarrierPreference, hashPhoneNumber } from "./branded-store.js";
import { normalizeE164 } from "./branded-types.js";
import { getTwilioCredentials, twilioForm } from "./twilio-client.js";

function meta(context: IntegrationRequestContext, providerRequestId?: string): IntegrationMeta {
  return { integration: "sms", provider: "twilio", correlationId: context.correlationId, providerRequestId, attempts: 1 };
}

function providerError(error: unknown) {
  const value = error as Error & { status?: number; providerCode?: string };
  return {
    status: typeof value?.status === "number" ? value.status : undefined,
    providerCode: typeof value?.providerCode === "string" ? value.providerCode : undefined,
    message: value instanceof Error ? value.message : "Twilio request failed.",
  };
}

export class TwilioSmsAdapter implements SmsIntegrationPort {
  async send(request: SmsSendRequest, context: IntegrationRequestContext) {
    try {
      if (!context.organizationId || request.organizationId !== context.organizationId) {
        return integrationFailure({ code: "unauthorized", message: "SMS request organization does not match trusted context.", retryable: false }, meta(context));
      }
      if (!request.body || request.body.length > 1_600) {
        return integrationFailure({ code: "invalid-request", message: "SMS body is required and must be 1,600 characters or fewer.", retryable: false }, meta(context));
      }
      const to = normalizeE164(request.to);
      const sender = await getOrganizationSmsSender(request.organizationId);
      if (!sender || sender.status !== "ready") {
        return integrationFailure({ code: "not-configured", message: sender?.reason ?? "Organization SMS sender is not ready.", retryable: false }, meta(context));
      }
      if (!sender.messagingServiceSid && !sender.phoneNumber) {
        return integrationFailure({ code: "not-configured", message: "Organization SMS sender has no usable provider identity.", retryable: false }, meta(context));
      }
      const carrierPreference = await getSmsCarrierPreference(request.organizationId, hashPhoneNumber(to));
      if (carrierPreference?.carrierOptOut) {
        return integrationFailure({ code: "forbidden", message: "Recipient has opted out of SMS at the carrier messaging layer.", retryable: false }, meta(context));
      }

      const { accountSid } = getTwilioCredentials();
      const { data } = await twilioForm(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        To: to,
        Body: request.body,
        ...(sender.messagingServiceSid ? { MessagingServiceSid: sender.messagingServiceSid } : sender.phoneNumber ? { From: normalizeE164(sender.phoneNumber) } : {}),
      });
      const providerRequestId = typeof data.sid === "string" ? data.sid : undefined;
      if (!providerRequestId) {
        return integrationFailure({ code: "unknown", message: "Twilio accepted an SMS request without returning a message identifier.", retryable: false }, meta(context));
      }
      return integrationSuccess({ messageId: providerRequestId, acceptedAt: new Date().toISOString() }, meta(context, providerRequestId));
    } catch (error) {
      const provider = providerError(error);
      if (provider.status === 429) {
        return integrationFailure({ code: "rate-limited", message: provider.message, retryable: true, ...(provider.providerCode ? { providerCode: provider.providerCode } : {}) }, meta(context));
      }
      if (provider.status && provider.status >= 500) {
        return integrationFailure({ code: "unavailable", message: provider.message, retryable: true, ...(provider.providerCode ? { providerCode: provider.providerCode } : {}) }, meta(context));
      }
      if (provider.status && provider.status >= 400) {
        return integrationFailure({ code: "provider-rejected", message: provider.message, retryable: false, ...(provider.providerCode ? { providerCode: provider.providerCode } : {}) }, meta(context));
      }
      return integrationFailure({ code: "unavailable", message: provider.message, retryable: false, ...(provider.providerCode ? { providerCode: provider.providerCode } : {}), safeDetails: { outcome: "unknown" } }, meta(context));
    }
  }

  async health(): Promise<IntegrationHealth> {
    try {
      getTwilioCredentials();
      return { integration: "sms", provider: "twilio", status: "ready", checkedAt: new Date().toISOString(), message: "Twilio server credentials are configured; organization sender and compliance readiness are evaluated separately." };
    } catch {
      return { integration: "sms", provider: "twilio", status: "not-configured", checkedAt: new Date().toISOString(), message: "Twilio server credentials are not configured." };
    }
  }
}

export function getTwilioSmsAdapter() {
  return new TwilioSmsAdapter();
}
