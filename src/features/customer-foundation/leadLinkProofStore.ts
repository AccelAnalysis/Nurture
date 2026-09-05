import type { AuthoritativeCustomerDataMode, CaptureLeadResult, LeadLinkProof } from "../../../shared/customer/contracts.js";

export interface PendingLeadLink extends LeadLinkProof {
  dataMode: AuthoritativeCustomerDataMode;
  capturedAt: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function keyFor(organizationId: string, dataMode: AuthoritativeCustomerDataMode) {
  return `nurture:r2:lead-link:${encodeURIComponent(organizationId)}:${dataMode}`;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof globalThis.sessionStorage === "undefined" ? null : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export function pendingLeadLinkFromCapture(
  result: CaptureLeadResult,
  dataMode: AuthoritativeCustomerDataMode,
): PendingLeadLink {
  return {
    organizationId: result.organizationId,
    leadId: result.leadId,
    linkProof: result.linkProof,
    dataMode,
    capturedAt: result.capturedAt,
  };
}

export function savePendingLeadLink(link: PendingLeadLink, storage: StorageLike | null = browserStorage()): void {
  if (!storage) return;
  storage.setItem(keyFor(link.organizationId, link.dataMode), JSON.stringify(link));
}

export function loadPendingLeadLink(
  organizationId: string,
  dataMode: AuthoritativeCustomerDataMode,
  storage: StorageLike | null = browserStorage(),
): PendingLeadLink | null {
  if (!storage) return null;
  const raw = storage.getItem(keyFor(organizationId, dataMode));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingLeadLink>;
    if (
      value.organizationId !== organizationId
      || value.dataMode !== dataMode
      || typeof value.leadId !== "string"
      || typeof value.linkProof !== "string"
      || value.linkProof.length < 32
      || typeof value.capturedAt !== "string"
    ) {
      storage.removeItem(keyFor(organizationId, dataMode));
      return null;
    }
    return value as PendingLeadLink;
  } catch {
    storage.removeItem(keyFor(organizationId, dataMode));
    return null;
  }
}

export function clearPendingLeadLink(
  organizationId: string,
  dataMode: AuthoritativeCustomerDataMode,
  storage: StorageLike | null = browserStorage(),
): void {
  storage?.removeItem(keyFor(organizationId, dataMode));
}
