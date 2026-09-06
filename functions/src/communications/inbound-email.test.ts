import assert from "node:assert/strict";
import test from "node:test";
import { parseMultipartTextFields } from "./inbound-email.js";

test("Inbound Parse multipart reader extracts text fields and ignores attachment bytes", () => {
  const boundary = "nurture-boundary";
  const body = [
    `--${boundary}\r\nContent-Disposition: form-data; name="from"\r\n\r\nAlice <alice@example.net>\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\nreply@inbound.acme.test\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="subject"\r\n\r\nNeed help\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="text"\r\n\r\nPlease help with week two.\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="attachment1"; filename="private.txt"\r\nContent-Type: text/plain\r\n\r\nattachment-secret\r\n`,
    `--${boundary}--\r\n`,
  ].join("");
  const fields = parseMultipartTextFields(Buffer.from(body, "utf8"), `multipart/form-data; boundary=${boundary}`);
  assert.equal(fields.from, "Alice <alice@example.net>");
  assert.equal(fields.to, "reply@inbound.acme.test");
  assert.equal(fields.subject, "Need help");
  assert.equal(fields.text, "Please help with week two.");
  assert.equal(fields.attachment1, undefined);
});

test("Inbound Parse multipart reader fails closed without a boundary", () => {
  assert.throws(() => parseMultipartTextFields(Buffer.from("invalid"), "text/plain"));
});
