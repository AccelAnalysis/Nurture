import assert from "node:assert/strict";
import test from "node:test";
import { compileInternetMessage } from "./message-compiler.js";

test("message compiler emits immutable CRLF MIME with one-click unsubscribe for marketing", () => {
  const message = compileInternetMessage({
    organizationId: "org-1",
    purpose: "marketing",
    from: { address: "hello@example.com", name: "Example" },
    to: { address: "person@example.net" },
    subject: "Welcome",
    text: "Hello there",
    html: "<p>Hello there</p>",
    date: new Date("2026-09-06T04:00:00.000Z"),
    messageIdHeader: "<message-1@example.com>",
    listUnsubscribeUrl: "https://unsubscribe.example.com/u/token",
  });
  const raw = Buffer.from(message.rfc822).toString("utf8");
  assert.match(raw, /List-Unsubscribe: <https:\/\/unsubscribe\.example\.com\/u\/token>\r\n/);
  assert.match(raw, /List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n/);
  assert.match(raw, /Content-Type: multipart\/alternative/);
  assert.equal(raw.includes("\n") && !raw.replace(/\r\n/g, "").includes("\n"), true);
  assert.equal(message.sha256.length, 64);
  assert.equal(message.byteLength, message.rfc822.byteLength);
});

test("marketing cannot bypass one-click unsubscribe and protected headers cannot be overridden", () => {
  assert.throws(() => compileInternetMessage({
    organizationId: "org-1",
    purpose: "marketing",
    from: { address: "hello@example.com" },
    to: { address: "person@example.net" },
    subject: "Marketing",
    text: "text",
    html: "<p>text</p>",
  }), /requires a one-click/);

  assert.throws(() => compileInternetMessage({
    organizationId: "org-1",
    purpose: "transactional",
    from: { address: "hello@example.com" },
    to: { address: "person@example.net" },
    subject: "Receipt",
    text: "text",
    html: "<p>text</p>",
    additionalHeaders: { From: "attacker@example.net" },
  }), /Protected header/);
});
