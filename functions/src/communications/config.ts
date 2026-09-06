import { defineSecret, defineString } from "firebase-functions/params";

export const sendGridApiKey = defineSecret("SENDGRID_API_KEY");

/** SendGrid's Event Webhook verification public key is public configuration, not a browser setting. */
export const sendGridEventWebhookPublicKey = defineString("SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY", { default: "" });

/** Comma-separated addresses used only for explicit controlled provider tests. */
export const sendGridTestAllowlist = defineString("SENDGRID_TEST_ALLOWLIST", { default: "" });

/**
 * Public HTTPS base URL for provider callbacks. This is server deployment
 * configuration, not an organization-controlled redirect target.
 */
export const communicationWebhookBaseUrl = defineString("COMMUNICATION_WEBHOOK_BASE_URL", { default: "" });

/** Twilio credentials are server-only and must be bound only to Functions that use them. */
export const twilioAccountSid = defineSecret("TWILIO_ACCOUNT_SID");
export const twilioAuthToken = defineSecret("TWILIO_AUTH_TOKEN");

/**
 * Server-authoritative origins that templates may link to. Track A can replace
 * this deploy-time bridge with its trusted published public-site query during
 * Release 2 composition without changing the renderer or provider adapter.
 */
export const communicationTrustedLinkOrigins = defineString("COMMUNICATION_TRUSTED_LINK_ORIGINS", {
  default: "https://nurture.accelanalysis.com,https://nurture-12398.web.app",
});

export function getControlledTestAllowlist() {
  return new Set(
    sendGridTestAllowlist.value().split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
}

export function getCommunicationTrustedOrigins() {
  return communicationTrustedLinkOrigins.value().split(",").map((value) => value.trim()).filter(Boolean).map((value) => new URL(value).origin);
}

export function getCommunicationWebhookBaseUrl() {
  const value = communicationWebhookBaseUrl.value().trim();
  if (!value) throw new Error("COMMUNICATION_WEBHOOK_BASE_URL is not configured.");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("COMMUNICATION_WEBHOOK_BASE_URL must use HTTPS.");
  return url.origin;
}
