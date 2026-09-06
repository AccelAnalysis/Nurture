import assert from "node:assert/strict";
import test from "node:test";
import type { MailSendingIdentity } from "../../../shared/mail/contracts.js";
import { NURTURE_MAIL_SCHEMA_VERSION } from "../../../shared/mail/contracts.js";
import { NurtureMailControlPlane } from "./control-plane.js";
import { InMemoryMailSpool } from "./spool.js";

const identity: MailSendingIdentity = {
  schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
  id: "identity-1",
  organizationId: "org-1",
  fromDomain: "example.com",
  mailFromDomain: "bounce.example.com",
  dkimDomain: "example.com",
  dkimSelector: "nurture1",
  dkimKeyReference: "kms://org-1/dkim",
  egressPoolId: "transactional-1",
  allowedTrafficClasses: ["transactional", "lifecycle", "marketing"],
  status: "ready",
  dnsRequirements: [],
  verifiedAt: "2026-09-06T04:00:00.000Z",
  createdAt: "2026-09-06T04:00:00.000Z",
  updatedAt: "2026-09-06T04:00:00.000Z",
};

function service() {
  const spool = new InMemoryMailSpool();
  return {
    spool,
    control: new NurtureMailControlPlane(
      { async get(id) { return id === identity.id ? identity : null; } },
      { async evaluate() { return { admitted: true as const }; } },
      { async sign(input) { return input.rfc822; } },
      spool,
      spool,
      "0123456789abcdef0123456789abcdef",
    ),
  };
}

test("control plane enforces tenant-bound ready identity and produces an immutable queued delivery", async () => {
  const { control, spool } = service();
  const result = await control.submit({
    organizationId: "org-1",
    idempotencyKey: "effect-1",
    purpose: "transactional",
    trafficClass: "transactional",
    sendingIdentityId: identity.id,
    from: { address: "hello@example.com", name: "Example" },
    to: { address: "person@example.net" },
    subject: "Receipt",
    text: "Thanks",
    html: "<p>Thanks</p>",
    now: new Date("2026-09-06T04:00:00.000Z"),
  });
  assert.equal(result.submitted, true);
  if (!result.submitted) return;
  assert.equal(result.delivery.state, "queued");
  assert.equal(result.delivery.envelope.organizationId, "org-1");
  assert.equal(result.delivery.envelope.recipientDomain, "example.net");
  assert.match(result.delivery.envelope.mailFrom, /^b\+.+@bounce\.example\.com$/);
  const blob = await spool.get(result.message.blob.storageKey);
  assert.equal(blob?.sha256, result.message.blob.sha256);

  const replay = await control.submit({
    organizationId: "org-1", idempotencyKey: "effect-1", purpose: "transactional", trafficClass: "transactional", sendingIdentityId: identity.id,
    from: { address: "hello@example.com" }, to: { address: "person@example.net" }, subject: "ignored replay", text: "ignored", html: "ignored",
  });
  assert.equal(replay.submitted, true);
  if (replay.submitted) assert.equal(replay.delivery.deliveryId, result.delivery.deliveryId);
});

test("control plane rejects cross-tenant and unauthorized From domain use", async () => {
  const { control } = service();
  const wrongTenant = await control.submit({ organizationId: "org-2", idempotencyKey: "wrong-tenant", purpose: "transactional", trafficClass: "transactional", sendingIdentityId: identity.id, from: { address: "hello@example.com" }, to: { address: "person@example.net" }, subject: "x", text: "x", html: "x" });
  assert.deepEqual(wrongTenant, { submitted: false, reason: "sending-identity-tenant-mismatch" });
  const wrongFrom = await control.submit({ organizationId: "org-1", idempotencyKey: "wrong-from", purpose: "transactional", trafficClass: "transactional", sendingIdentityId: identity.id, from: { address: "hello@evil.example" }, to: { address: "person@example.net" }, subject: "x", text: "x", html: "x" });
  assert.deepEqual(wrongFrom, { submitted: false, reason: "from-domain-does-not-match-sending-identity" });
});

test("concurrent idempotent submissions converge on one queued delivery", async () => {
  const { control } = service();
  const input = {
    organizationId: "org-1",
    idempotencyKey: "effect-concurrent",
    purpose: "transactional" as const,
    trafficClass: "transactional" as const,
    sendingIdentityId: identity.id,
    from: { address: "hello@example.com" },
    to: { address: "person@example.net" },
    subject: "Receipt",
    text: "Thanks",
    html: "<p>Thanks</p>",
    now: new Date("2026-09-06T04:00:00.000Z"),
  };
  const [left, right] = await Promise.all([control.submit(input), control.submit(input)]);
  assert.equal(left.submitted, true);
  assert.equal(right.submitted, true);
  if (!left.submitted || !right.submitted) return;
  assert.equal(left.delivery.deliveryId, right.delivery.deliveryId);
  assert.equal(left.delivery.state, "queued");
  assert.equal(right.delivery.state, "queued");
});
