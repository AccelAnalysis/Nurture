import assert from "node:assert/strict";
import test from "node:test";
import type { SmtpWireConnection } from "./smtp-session.js";
import { executeSmtpDelivery } from "./smtp-session.js";

class FakeConnection implements SmtpWireConnection {
  readonly writes: string[] = [];
  private readonly responses: string[];
  constructor(responses: string[], private readonly failFinalRead = false) { this.responses = [...responses]; }
  async readResponse() {
    if (this.failFinalRead && this.responses.length === 0) throw new Error("socket closed after DATA");
    const response = this.responses.shift();
    if (!response) throw new Error("unexpected SMTP read");
    return response;
  }
  async writeLine(line: string) { this.writes.push(line); }
  async writeData(data: Uint8Array) { this.writes.push(Buffer.from(data).toString("binary")); }
  async startTls(serverName: string) { this.writes.push(`TLS:${serverName}`); return { version: "TLSv1.3" }; }
  close() {}
}

const envelope = {
  schemaVersion: 1 as const,
  deliveryId: "delivery",
  organizationId: "org",
  messageId: "message",
  mailFrom: "b+token@bounce.example.com",
  rcptTo: "person@example.net",
  recipientDomain: "example.net",
  sendingIdentityId: "identity",
  egressPoolId: "pool",
  trafficClass: "transactional" as const,
  createdAt: "2026-09-06T04:00:00.000Z",
};

test("SMTP session negotiates STARTTLS and records remote DATA acceptance", async () => {
  const connection = new FakeConnection([
    "220 mx.example.net ESMTP ready",
    "250-mx.example.net\r\n250-STARTTLS\r\n250 PIPELINING",
    "220 2.0.0 Ready to start TLS",
    "250-mx.example.net\r\n250 PIPELINING",
    "250 2.1.0 Sender OK",
    "250 2.1.5 Recipient OK",
    "354 Start mail input",
    "250 2.0.0 queued",
  ]);
  const result = await executeSmtpDelivery({ connection, mxHost: "mx.example.net", heloName: "mail01.nurture.example", envelope, rfc822: Buffer.from("From: x@example.com\r\n\r\n.body\r\n"), tlsMode: "opportunistic" });
  assert.equal(result.observation.accepted, true);
  assert.equal(result.tls.negotiated, true);
  assert.deepEqual(connection.writes.slice(0, 4), ["EHLO mail01.nurture.example", "STARTTLS", "TLS:mx.example.net", "EHLO mail01.nurture.example"]);
  assert.match(connection.writes.at(-1) ?? "", /\.\.body/);
});

test("loss after DATA becomes acceptance_uncertain rather than retryable", async () => {
  const connection = new FakeConnection([
    "220 mx.example.net ESMTP ready",
    "250 mx.example.net",
    "250 sender ok",
    "250 recipient ok",
    "354 data",
  ], true);
  const result = await executeSmtpDelivery({ connection, mxHost: "mx.example.net", heloName: "mail01.nurture.example", envelope, rfc822: Buffer.from("From: x@example.com\r\n\r\nbody\r\n"), tlsMode: "opportunistic" });
  assert.equal(result.observation.reason, "acceptance-uncertain");
  assert.equal(result.observation.retryable, false);
});
