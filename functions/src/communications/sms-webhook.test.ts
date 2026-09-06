import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { twilioSignaturePayload, verifyTwilioWebhookSignature } from "./sms-webhook.js";

test("Twilio webhook signature payload sorts form keys", () => {
  assert.equal(
    twilioSignaturePayload("https://example.test/twilioInboundSms", { To: "+14045550198", Body: "HELP", From: "+14045550123" }),
    "https://example.test/twilioInboundSmsBodyHELPFrom+14045550123To+14045550198",
  );
});

test("Twilio webhook signature validation rejects payload tampering", () => {
  const authToken = "test-auth-token";
  const url = "https://example.test/twilioInboundSms";
  const params = { Body: "STOP", From: "+14045550123", MessageSid: "SM0123456789abcdef0123456789abcdef", To: "+14045550198" };
  const signature = createHmac("sha1", authToken).update(twilioSignaturePayload(url, params), "utf8").digest("base64");
  assert.equal(verifyTwilioWebhookSignature({ authToken, signature, url, params }), true);
  assert.equal(verifyTwilioWebhookSignature({ authToken, signature, url, params: { ...params, Body: "START" } }), false);
  assert.equal(verifyTwilioWebhookSignature({ authToken, signature: "", url, params }), false);
});

test("Twilio status signature binds the organization route in the callback URL", () => {
  const authToken = "test-auth-token";
  const params = { MessageSid: "SM0123456789abcdef0123456789abcdef", MessageStatus: "delivered" };
  const organizationAUrl = "https://example.test/twilioMessageStatus?organizationId=org-a";
  const organizationBUrl = "https://example.test/twilioMessageStatus?organizationId=org-b";
  const signature = createHmac("sha1", authToken).update(twilioSignaturePayload(organizationAUrl, params), "utf8").digest("base64");
  assert.equal(verifyTwilioWebhookSignature({ authToken, signature, url: organizationAUrl, params }), true);
  assert.equal(verifyTwilioWebhookSignature({ authToken, signature, url: organizationBUrl, params }), false);
});
