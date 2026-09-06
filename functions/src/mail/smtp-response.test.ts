import assert from "node:assert/strict";
import test from "node:test";
import { parseSmtpResponse } from "./smtp-response.js";

test("SMTP responses normalize success, temporary reputation deferrals and permanent recipients", () => {
  const accepted = parseSmtpResponse("250 2.0.0 OK queued");
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.reason, "accepted");

  const deferred = parseSmtpResponse("421 4.7.0 Temporary rate limit; try again later");
  assert.equal(deferred.retryable, true);
  assert.equal(deferred.reason, "reputation-temporary");

  const badRecipient = parseSmtpResponse("550 5.1.1 User unknown");
  assert.equal(badRecipient.retryable, false);
  assert.equal(badRecipient.reason, "recipient-permanent");
});
