import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { shouldApplyProviderTransition } from "./delivery-state.js";
import { mapSendGridEvent, verifySendGridEventWebhookSignature } from "./webhook.js";

function signedFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const rawBody = Buffer.from('[{"event":"delivered","sg_message_id":"abc.123","email":"test@example.com"}]');
  const timestamp = "1788614400";
  const signed = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);
  const signature = sign("sha256", signed, privateKey).toString("base64");
  const publicKeyBase64 = (publicKey.export({ format: "der", type: "spki" }) as Buffer).toString("base64");
  return { rawBody, timestamp, signature, publicKeyBase64 };
}

test("SendGrid signature verification uses timestamp plus raw body", () => {
  const fixture = signedFixture();
  assert.equal(verifySendGridEventWebhookSignature({ ...fixture, signatureBase64: fixture.signature }), true);
  assert.equal(verifySendGridEventWebhookSignature({ ...fixture, signatureBase64: fixture.signature, rawBody: Buffer.from("[]") }), false);
});

test("provider events map to distinct delivery outcomes and suppression scopes", () => {
  assert.equal(mapSendGridEvent("delivered").nextStatus, "delivered");
  assert.equal(mapSendGridEvent("bounce").nextStatus, "bounced");
  assert.equal(mapSendGridEvent("dropped").nextStatus, "dropped");
  assert.equal(mapSendGridEvent("spamreport").nextStatus, "complained");
  assert.equal(mapSendGridEvent("unsubscribe").nextStatus, "unsubscribed");
  assert.equal(mapSendGridEvent("deferred").nextStatus, "deferred");
  assert.equal(mapSendGridEvent("processed").nextStatus, undefined);

  const unsubscribe = mapSendGridEvent("unsubscribe");
  assert.equal(unsubscribe.suppressGlobally, true);
  assert.equal(unsubscribe.suppressOrganizationMarketing, false);

  const group = mapSendGridEvent("group_unsubscribe");
  assert.equal(group.nextStatus, "unsubscribed");
  assert.equal(group.suppressGlobally, false);
  assert.equal(group.suppressOrganizationMarketing, true);
});

test("late provider callbacks cannot regress stronger delivery knowledge", () => {
  assert.equal(shouldApplyProviderTransition("delivered", "deferred"), false);
  assert.equal(shouldApplyProviderTransition("delivered", "bounced"), false);
  assert.equal(shouldApplyProviderTransition("delivered", "complained"), true);
  assert.equal(shouldApplyProviderTransition("complained", "delivered"), false);
  assert.equal(shouldApplyProviderTransition("accepted", "delivered"), true);
});
