import type { LeadCaptureInput, LeadRecord } from "../model/contracts";
import { identityCollections, identityDocumentStore } from "./identityDocumentStore";

export function leadIdForIdentity(identityId: string) {
  return `lead_${identityId}`;
}

export const leadRepository = {
  get(identityId: string) {
    return identityDocumentStore.read<LeadRecord>(identityCollections.leads, identityId);
  },

  async capture(identityId: string, input: LeadCaptureInput = {}): Promise<{ record: LeadRecord; created: boolean }> {
    const existing = await this.get(identityId);
    const now = new Date().toISOString();
    const consentCandidate = input.consentCandidate
      ? { ...input.consentCandidate, capturedAt: input.consentCandidate.capturedAt ?? now }
      : existing?.consentCandidate;
    const record: LeadRecord = {
      leadId: existing?.leadId ?? leadIdForIdentity(identityId),
      identityId,
      state: existing?.state ?? "lead",
      entryPoint: input.entryPoint ?? existing?.entryPoint ?? "public",
      ...(input.organizationIdCandidate ?? existing?.organizationIdCandidate
        ? { organizationIdCandidate: input.organizationIdCandidate ?? existing?.organizationIdCandidate }
        : {}),
      ...(input.offerId ?? existing?.offerId ? { offerId: input.offerId ?? existing?.offerId } : {}),
      ...(input.referralCode ?? existing?.referralCode ? { referralCode: input.referralCode ?? existing?.referralCode } : {}),
      ...(input.source ?? existing?.source ? { source: input.source ?? existing?.source } : {}),
      ...(consentCandidate ? { consentCandidate } : {}),
      ...(existing?.customerId ? { customerId: existing.customerId } : {}),
      createdAt: existing?.createdAt ?? input.startedAt ?? now,
      updatedAt: now,
      ...(existing?.registeredAt ? { registeredAt: existing.registeredAt } : {}),
    };
    await identityDocumentStore.write(identityCollections.leads, identityId, record, false);
    return { record, created: !existing };
  },

  async markRegistered(identityId: string, customerId: string): Promise<LeadRecord> {
    const existing = await this.get(identityId);
    const now = new Date().toISOString();
    const record: LeadRecord = {
      ...(existing ?? {
        leadId: leadIdForIdentity(identityId),
        identityId,
        entryPoint: "public" as const,
        createdAt: now,
      }),
      state: "registered",
      customerId,
      registeredAt: existing?.registeredAt ?? now,
      updatedAt: now,
    };
    await identityDocumentStore.write(identityCollections.leads, identityId, record, false);
    return record;
  },
};
