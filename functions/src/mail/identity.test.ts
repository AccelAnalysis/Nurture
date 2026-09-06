import assert from "node:assert/strict";
import test from "node:test";
import { createSendingIdentity, verifySendingIdentity } from "./identity.js";

const identity = createSendingIdentity({
  id: "identity-1",
  organizationId: "org-1",
  fromDomain: "example.com",
  dkimSelector: "nurture1",
  dkimPublicKeyBase64: "QUJDREVGRw==",
  dkimKeyReference: "kms://org-1/dkim",
  egressPoolId: "pool-1",
  egressAddresses: [{ ip: "192.0.2.10", hostname: "mail01.nurture.example", family: 4, status: "ready" }],
  bounceMxHostname: "mx-bounce.nurture.example",
  now: new Date("2026-09-06T04:00:00.000Z"),
});

test("sending identity generates DKIM, return-path SPF/MX and DMARC requirements", () => {
  assert.equal(identity.mailFromDomain, "bounce.example.com");
  assert.deepEqual(identity.dnsRequirements.map((entry) => entry.kind), ["dkim", "return-path-mx", "return-path-spf", "dmarc"]);
  assert.equal(identity.status, "pending");
});

test("sending identity becomes ready only after all required DNS checks verify", async () => {
  const verified = await verifySendingIdentity(identity, {
    async resolveTxt(host) {
      const requirement = identity.dnsRequirements.find((entry) => entry.host === host && entry.recordType === "TXT");
      return requirement ? [requirement.value] : [];
    },
    async resolveMx() { return [{ priority: 10, exchange: "mx-bounce.nurture.example" }]; },
  }, new Date("2026-09-06T04:10:00.000Z"));
  assert.equal(verified.status, "ready");
  assert.ok(verified.verifiedAt);
});
