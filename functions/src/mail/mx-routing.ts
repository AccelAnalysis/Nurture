import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import type { MailMxTarget, MailRoute } from "../../../shared/mail/contracts.js";

export interface MailDnsResolver {
  resolveMx(domain: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
}

export class NodeMailDnsResolver implements MailDnsResolver {
  async resolveMx(domain: string) {
    try {
      return await resolveMx(domain);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENODATA" || code === "ENOTFOUND") return [];
      throw error;
    }
  }

  async resolve4(host: string) {
    try { return await resolve4(host); } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENODATA" || code === "ENOTFOUND") return [];
      throw error;
    }
  }

  async resolve6(host: string) {
    try { return await resolve6(host); } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENODATA" || code === "ENOTFOUND") return [];
      throw error;
    }
  }
}

async function addressesFor(resolver: MailDnsResolver, host: string) {
  const [v4, v6] = await Promise.all([resolver.resolve4(host), resolver.resolve6(host)]);
  return [...v4, ...v6];
}

export async function resolveMailRoute(domain: string, resolver: MailDnsResolver = new NodeMailDnsResolver()): Promise<MailRoute> {
  const normalized = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized) throw new Error("Recipient domain is required.");
  const mx = await resolver.resolveMx(normalized);
  if (mx.some((entry) => entry.priority === 0 && (entry.exchange === "." || entry.exchange === ""))) {
    return { recipientDomain: normalized, targets: [], resolvedAt: new Date().toISOString(), nullMx: true };
  }

  const entries = mx.length ? mx : [{ exchange: normalized, priority: 0 }];
  const targets: MailMxTarget[] = [];
  for (const entry of entries.sort((a, b) => a.priority - b.priority || a.exchange.localeCompare(b.exchange))) {
    const host = entry.exchange.toLowerCase().replace(/\.$/, "");
    const addresses = await addressesFor(resolver, host);
    if (addresses.length) targets.push({ host, preference: entry.priority, addresses });
  }
  return { recipientDomain: normalized, targets, resolvedAt: new Date().toISOString(), nullMx: false };
}
