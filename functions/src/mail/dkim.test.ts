import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { signDkimRsaSha256 } from "./dkim.js";
import { compileInternetMessage } from "./message-compiler.js";

test("DKIM signer adds an rsa-sha256 relaxed signature without mutating the unsigned body", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const message = compileInternetMessage({ organizationId: "org-1", purpose: "transactional", from: { address: "hello@example.com" }, to: { address: "person@example.net" }, subject: "Receipt", text: "text", html: "<p>text</p>", messageIdHeader: "<m@example.com>", date: new Date("2026-09-06T04:00:00.000Z") });
  const signed = Buffer.from(signDkimRsaSha256({ rfc822: message.rfc822, domain: "example.com", selector: "nurture1", privateKeyPem: privateKey, timestamp: 1_788_688_800 })).toString("utf8");
  assert.match(signed, /^DKIM-Signature: v=1; a=rsa-sha256; c=relaxed\/relaxed; d=example\.com; s=nurture1;/);
  assert.match(signed, /; bh=[A-Za-z0-9+/=]+; b=[A-Za-z0-9+/=]+\r\nDate:/);
  assert.match(signed, /\r\n\r\n--nurture-alt-/);
});
