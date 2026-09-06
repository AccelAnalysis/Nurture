import { createHash, createSign } from "node:crypto";
import { normalizeHeaderText } from "./address.js";

export interface DkimSignInput {
  rfc822: Uint8Array;
  domain: string;
  selector: string;
  privateKeyPem: string;
  timestamp?: number;
  headers?: readonly string[];
}

function splitMessage(bytes: Uint8Array) {
  const raw = Buffer.from(bytes).toString("utf8").replace(/\r?\n/g, "\r\n");
  const split = raw.indexOf("\r\n\r\n");
  if (split < 0) throw new Error("RFC 5322 message is missing the header/body separator.");
  return { headerBlock: raw.slice(0, split), body: raw.slice(split + 4) };
}

function unfoldHeaders(headerBlock: string) {
  const rawLines = headerBlock.split("\r\n");
  const unfolded: string[] = [];
  for (const line of rawLines) {
    if (/^[ \t]/.test(line) && unfolded.length) unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    else unfolded.push(line);
  }
  return unfolded.map((line) => {
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error("Malformed message header.");
    return { name: line.slice(0, separator), value: line.slice(separator + 1) };
  });
}

function relaxedHeader(name: string, value: string) {
  const normalizedValue = value.replace(/[ \t]+/g, " ").trim();
  return `${name.toLowerCase()}:${normalizedValue}\r\n`;
}

export function relaxedBodyCanonicalization(body: string) {
  const lines = body.replace(/\r?\n/g, "\r\n").split("\r\n").map((line) => line.replace(/[ \t]+/g, " ").replace(/[ \t]+$/g, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return `${lines.join("\r\n")}\r\n`;
}

export function signDkimRsaSha256(input: DkimSignInput): Uint8Array {
  const domain = normalizeHeaderText(input.domain.toLowerCase(), "DKIM domain");
  const selector = normalizeHeaderText(input.selector.toLowerCase(), "DKIM selector");
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)) throw new Error("DKIM domain is invalid.");
  if (!/^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/.test(selector)) throw new Error("DKIM selector is invalid.");

  const { headerBlock, body } = splitMessage(input.rfc822);
  const headers = unfoldHeaders(headerBlock);
  const wanted = (input.headers ?? ["from", "to", "subject", "date", "message-id", "mime-version", "content-type", "reply-to", "list-unsubscribe", "list-unsubscribe-post"])
    .map((value) => value.toLowerCase());

  const selected: Array<{ name: string; value: string }> = [];
  for (const wantedName of wanted) {
    for (let index = headers.length - 1; index >= 0; index -= 1) {
      const header = headers[index];
      if (header && header.name.toLowerCase() === wantedName) {
        selected.push(header);
        break;
      }
    }
  }
  if (!selected.some((header) => header.name.toLowerCase() === "from")) throw new Error("DKIM signing requires the From header.");

  const canonicalBody = relaxedBodyCanonicalization(body);
  const bodyHash = createHash("sha256").update(canonicalBody, "utf8").digest("base64");
  const signedHeaderNames = selected.map((header) => header.name.toLowerCase()).join(":");
  const dkimValue = [
    "v=1",
    "a=rsa-sha256",
    "c=relaxed/relaxed",
    `d=${domain}`,
    `s=${selector}`,
    `t=${input.timestamp ?? Math.floor(Date.now() / 1000)}`,
    `h=${signedHeaderNames}`,
    `bh=${bodyHash}`,
    "b=",
  ].join("; ");

  const signingInput = `${selected.map((header) => relaxedHeader(header.name, header.value)).join("")}${relaxedHeader("DKIM-Signature", dkimValue)}`;
  const signature = createSign("RSA-SHA256").update(signingInput, "utf8").sign(input.privateKeyPem, "base64");
  const signed = `DKIM-Signature: ${dkimValue}${signature}\r\n${headerBlock}\r\n\r\n${body}`;
  return Buffer.from(signed, "utf8");
}

export interface DkimSigningPort {
  sign(input: { rfc822: Uint8Array; organizationId: string; keyReference: string; domain: string; selector: string }): Promise<Uint8Array>;
}
