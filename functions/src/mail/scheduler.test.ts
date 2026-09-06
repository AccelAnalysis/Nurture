import assert from "node:assert/strict";
import test from "node:test";
import type { ImmutableMailMessage, MailDeliveryRecord, MailWorkerResult } from "../../../shared/mail/contracts.js";
import { NURTURE_MAIL_SCHEMA_VERSION } from "../../../shared/mail/contracts.js";
import { NurtureMailScheduler } from "./scheduler.js";
import { InMemoryMailSpool } from "./spool.js";

function fixtures() {
  const now = "2026-09-06T04:00:00.000Z";
  const message: ImmutableMailMessage = {
    schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
    messageId: "message-1",
    organizationId: "org-1",
    purpose: "transactional",
    from: { address: "hello@example.com" },
    to: { address: "person@example.net" },
    subject: "x",
    messageIdHeader: "<m@example.com>",
    blob: { contentType: "message/rfc822", sha256: "a".repeat(64), byteLength: 3, storageKey: "mail/blob" },
    createdAt: now,
  };
  const delivery: MailDeliveryRecord = {
    schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
    deliveryId: "delivery-1",
    organizationId: "org-1",
    messageId: message.messageId,
    envelope: { schemaVersion: NURTURE_MAIL_SCHEMA_VERSION, deliveryId: "delivery-1", organizationId: "org-1", messageId: message.messageId, mailFrom: "b+x@bounce.example.com", rcptTo: "person@example.net", recipientDomain: "example.net", sendingIdentityId: "identity", egressPoolId: "pool", trafficClass: "transactional", createdAt: now },
    state: "queued",
    attempts: [],
    nextAttemptAt: now,
    expiresAt: "2026-09-11T04:00:00.000Z",
    updatedAt: now,
  };
  return { message, delivery };
}

async function schedulerFixture() {
  const spool = new InMemoryMailSpool();
  const { message, delivery } = fixtures();
  await spool.putMessage(message);
  await spool.enqueue(delivery);
  const scheduler = new NurtureMailScheduler(spool,
    { async resolve(domain) { return { recipientDomain: domain, targets: [{ host: "mx.example.net", preference: 10, addresses: ["192.0.2.1"] }], nullMx: false, resolvedAt: "2026-09-06T04:00:00.000Z" }; } },
    { async get(domain) { return { recipientDomain: domain, maxConcurrentConnections: 4, maxMessagesPerMinute: 60, updatedAt: "2026-09-06T04:00:00.000Z" }; } },
  );
  return { spool, scheduler };
}

test("scheduler leases work and advances the durable state trail before acceptance", async () => {
  const { spool, scheduler } = await schedulerFixture();
  const jobs = await scheduler.leaseJobs({ owner: "worker-1", now: new Date("2026-09-06T04:00:00.000Z"), leaseMs: 60_000, limit: 10 });
  assert.equal(jobs.length, 1);
  const result: MailWorkerResult = {
    schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
    jobId: jobs[0]!.jobId,
    deliveryId: "delivery-1",
    organizationId: "org-1",
    leaseToken: jobs[0]!.lease.token,
    leaseOwner: jobs[0]!.lease.owner,
    phase: "transmitting",
    outcome: "accepted",
    completedAt: "2026-09-06T04:00:03.000Z",
    attempt: { schemaVersion: NURTURE_MAIL_SCHEMA_VERSION, attemptId: "attempt-1", attempt: 1, startedAt: "2026-09-06T04:00:01.000Z", completedAt: "2026-09-06T04:00:03.000Z", smtpCode: 250, normalizedReason: "accepted", outcome: "accepted" },
  };
  const completed = await scheduler.applyWorkerResult(result);
  assert.equal(completed.state, "accepted");
  assert.equal(completed.attempts.length, 1);
  assert.equal(completed.lease, undefined);
  assert.equal((await spool.getDelivery("delivery-1"))?.state, "accepted");
});

test("temporary failures are deferred with a future retry, not immediately replayed", async () => {
  const { scheduler } = await schedulerFixture();
  const jobs = await scheduler.leaseJobs({ owner: "worker-1", now: new Date("2026-09-06T04:00:00.000Z"), leaseMs: 60_000, limit: 10 });
  const result: MailWorkerResult = {
    schemaVersion: NURTURE_MAIL_SCHEMA_VERSION,
    jobId: jobs[0]!.jobId,
    deliveryId: "delivery-1",
    organizationId: "org-1",
    leaseToken: jobs[0]!.lease.token,
    leaseOwner: jobs[0]!.lease.owner,
    phase: "negotiating",
    outcome: "deferred",
    completedAt: "2026-09-06T04:00:03.000Z",
    attempt: { schemaVersion: NURTURE_MAIL_SCHEMA_VERSION, attemptId: "attempt-1", attempt: 1, startedAt: "2026-09-06T04:00:01.000Z", completedAt: "2026-09-06T04:00:03.000Z", smtpCode: 421, normalizedReason: "reputation-temporary", outcome: "deferred" },
  };
  const completed = await scheduler.applyWorkerResult(result);
  assert.equal(completed.state, "deferred");
  assert.equal(completed.nextAttemptAt, "2026-09-06T04:30:03.000Z");
});
