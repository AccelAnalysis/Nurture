import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySmsComplianceKeyword,
  composeSubdomain,
  isValidAlphaSenderId,
  normalizeCountryCode,
  normalizeDomain,
  normalizeE164,
} from "./branded-types.js";

test("SMS compliance keywords require exact reserved messages", () => {
  assert.equal(classifySmsComplianceKeyword(" stop "), "STOP");
  assert.equal(classifySmsComplianceKeyword("UNSUBSCRIBE"), "STOP");
  assert.equal(classifySmsComplianceKeyword("REVOKE"), "STOP");
  assert.equal(classifySmsComplianceKeyword("OPTOUT"), "STOP");
  assert.equal(classifySmsComplianceKeyword("UNSUBSCRIBE please"), "NONE");
  assert.equal(classifySmsComplianceKeyword("start"), "START");
  assert.equal(classifySmsComplianceKeyword("help"), "HELP");
  assert.equal(classifySmsComplianceKeyword("help me"), "NONE");
  assert.equal(classifySmsComplianceKeyword("How is my order?"), "NONE");
});

test("organization communication domains and phone numbers normalize safely", () => {
  assert.equal(normalizeDomain("Example.COM."), "example.com");
  assert.equal(composeSubdomain("example.com", "email"), "email.example.com");
  assert.equal(normalizeE164("+1 (404) 555-0198"), "+14045550198");
  assert.equal(normalizeCountryCode("us"), "US");
  assert.throws(() => normalizeDomain("not a domain"));
  assert.throws(() => normalizeE164("404-555-0198"));
});

test("alphanumeric sender validation matches supported sender characters", () => {
  assert.equal(isValidAlphaSenderId("ACME-HEALTH"), true);
  assert.equal(isValidAlphaSenderId("ACME & CO"), true);
  assert.equal(isValidAlphaSenderId("123456"), false);
  assert.equal(isValidAlphaSenderId("TOO-LONG-ACME"), false);
  assert.equal(isValidAlphaSenderId("ACME!"), false);
});
