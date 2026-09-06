import type { MailEnvelope, MailSmtpObservation, MailTlsObservation } from "../../../shared/mail/contracts.js";
import { acceptanceUncertainObservation, parseSmtpResponse } from "./smtp-response.js";

export interface SmtpWireConnection {
  readResponse(): Promise<string>;
  writeLine(line: string): Promise<void>;
  /** Writes dot-stuffed RFC 5321 DATA bytes and the terminating <CRLF>.<CRLF>. */
  writeData(data: Uint8Array): Promise<void>;
  startTls(serverName: string): Promise<{ version?: string; cipher?: string; peerName?: string }>;
  close(): Promise<void> | void;
}

export interface SmtpConnectionFactory {
  connect(input: { host: string; address: string; port: 25; timeoutMs: number; sourceIp?: string }): Promise<SmtpWireConnection>;
}

export interface SmtpDeliveryInput {
  connection: SmtpWireConnection;
  mxHost: string;
  heloName: string;
  envelope: MailEnvelope;
  rfc822: Uint8Array;
  tlsMode: "opportunistic" | "required";
}

export interface SmtpDeliveryResult {
  phase: "negotiating" | "transmitting";
  observation: MailSmtpObservation;
  tls: MailTlsObservation;
  capabilities: string[];
}

function capabilities(raw: string) {
  return raw.replace(/\r?\n/g, "\n").split("\n").slice(1).map((line) => line.replace(/^\d{3}[- ]?/, "").trim().split(/\s+/, 1)[0]?.toUpperCase()).filter((value): value is string => Boolean(value));
}

async function command(connection: SmtpWireConnection, line: string) {
  await connection.writeLine(line);
  return parseSmtpResponse(await connection.readResponse());
}

function dotStuff(input: Uint8Array) {
  let raw = Buffer.from(input).toString("binary").replace(/\r?\n/g, "\r\n");
  if (!raw.endsWith("\r\n")) raw += "\r\n";
  raw = raw.replace(/(^|\r\n)\./g, "$1..");
  return Buffer.from(`${raw}.\r\n`, "binary");
}

function smtpPath(address: string) {
  if (/\r|\n|[<>]/.test(address)) throw new Error("SMTP path is invalid.");
  return `<${address}>`;
}

export async function executeSmtpDelivery(input: SmtpDeliveryInput): Promise<SmtpDeliveryResult> {
  let tls: MailTlsObservation = { mode: input.tlsMode, negotiated: false, policy: "none" };
  const greeting = parseSmtpResponse(await input.connection.readResponse());
  if (greeting.code !== 220) return { phase: "negotiating", observation: greeting, tls, capabilities: [] };

  let ehlo = await command(input.connection, `EHLO ${input.heloName}`);
  if (!ehlo.accepted) return { phase: "negotiating", observation: ehlo, tls, capabilities: [] };
  let advertised = capabilities(ehlo.rawResponse);
  const startTls = advertised.includes("STARTTLS");
  if (startTls) {
    const start = await command(input.connection, "STARTTLS");
    if (start.code !== 220) {
      return { phase: "negotiating", observation: { ...start, reason: start.retryable ? "tls-temporary" : "tls-permanent" }, tls, capabilities: advertised };
    }
    try {
      const negotiated = await input.connection.startTls(input.mxHost);
      tls = { mode: input.tlsMode, negotiated: true, policy: "none", ...negotiated };
    } catch (error) {
      return {
        phase: "negotiating",
        observation: {
          code: 0,
          rawResponse: error instanceof Error ? error.message : "TLS negotiation failed.",
          reason: input.tlsMode === "required" ? "tls-permanent" : "tls-temporary",
          retryable: input.tlsMode !== "required",
          accepted: false,
        },
        tls,
        capabilities: advertised,
      };
    }
    ehlo = await command(input.connection, `EHLO ${input.heloName}`);
    if (!ehlo.accepted) return { phase: "negotiating", observation: ehlo, tls, capabilities: advertised };
    advertised = capabilities(ehlo.rawResponse);
  } else if (input.tlsMode === "required") {
    return {
      phase: "negotiating",
      observation: { code: 0, rawResponse: "Remote MX did not advertise STARTTLS.", reason: "tls-permanent", retryable: false, accepted: false },
      tls,
      capabilities: advertised,
    };
  }

  const mailFrom = await command(input.connection, `MAIL FROM:${smtpPath(input.envelope.mailFrom)}`);
  if (!mailFrom.accepted) return { phase: "negotiating", observation: mailFrom, tls, capabilities: advertised };
  const rcptTo = await command(input.connection, `RCPT TO:${smtpPath(input.envelope.rcptTo)}`);
  if (!rcptTo.accepted) return { phase: "negotiating", observation: rcptTo, tls, capabilities: advertised };
  const data = await command(input.connection, "DATA");
  if (data.code !== 354) return { phase: "transmitting", observation: data, tls, capabilities: advertised };

  try {
    await input.connection.writeData(dotStuff(input.rfc822));
  } catch (error) {
    return { phase: "transmitting", observation: acceptanceUncertainObservation(error instanceof Error ? error.message : undefined), tls, capabilities: advertised };
  }
  try {
    const final = parseSmtpResponse(await input.connection.readResponse());
    return { phase: "transmitting", observation: final, tls, capabilities: advertised };
  } catch (error) {
    return { phase: "transmitting", observation: acceptanceUncertainObservation(error instanceof Error ? error.message : undefined), tls, capabilities: advertised };
  }
}
