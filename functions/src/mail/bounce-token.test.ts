import assert from "node:assert/strict";
import test from "node:test";
import { createBounceAddress, createBounceToken, parseBounceToken } from "./bounce-token.js";
import { parseDeliveryStatusNotification } from "./dsn.js";

const secret = "0123456789abcdef0123456789abcdef";
const deliveryId = "123e4567-e89b-42d3-a456-426614174000";

test("bounce token is compact, authenticated and maps back to the delivery", () => {
  const token = createBounceToken(deliveryId, secret);
  assert.ok(token.length < 64);
  assert.equal(parseBounceToken(token, secret).deliveryId, deliveryId);
  assert.match(createBounceAddress(deliveryId, "bounce.example.com", secret), /^b\+.+@bounce\.example\.com$/);
  assert.throws(() => parseBounceToken(`${token.slice(0, -1)}x`, secret), /signature is invalid|malformed/);
});

test("DSN parser prioritizes structured status fields", () => {
  const dsn = parseDeliveryStatusNotification([
    "Final-Recipient: rfc822; missing@example.net",
    "Action: failed",
    "Status: 5.1.1",
    "Diagnostic-Code: smtp; 550 5.1.1 user unknown",
  ].join("\r\n"));
  assert.equal(dsn.finalRecipient, "missing@example.net");
  assert.equal(dsn.reason, "recipient-permanent");
});
