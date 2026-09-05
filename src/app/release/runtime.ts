import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import type { ExperienceCustomerSource, ExperienceEntitlementSource, EntitlementSnapshotResult, ExperienceCustomerResult } from "../../features/experience/contracts";
import { backendUnavailableMessage, releaseBackendReady } from "./readiness";

/** Identity/customer hints are never converted into tenant authority in the browser. */
export const releaseCustomerSource: ExperienceCustomerSource = {
  async resolveCustomer(request) {
    if (!releaseBackendReady || !functions || !request.organizationId) return { status: "unavailable", reason: backendUnavailableMessage };
    const result = await httpsCallable<{ organizationId: string }, ExperienceCustomerResult>(functions, "resolveExperienceCustomer")({ organizationId: request.organizationId });
    return result.data;
  },
};
export const releaseEntitlementSource: ExperienceEntitlementSource = {
  async loadPresentationSnapshot(request) {
    if (!releaseBackendReady || !functions) return { status: "unavailable", reason: backendUnavailableMessage };
    const result = await httpsCallable<typeof request, EntitlementSnapshotResult>(functions, "getExperienceEntitlements")(request);
    return result.data;
  },
};

export const releaseOperationSource = {
  async execute(request: { organizationId?: string; experienceId: string; moduleId: string; operation: string; requestId: string }) {
    if (!releaseBackendReady || !functions) throw new Error(backendUnavailableMessage);
    return (await httpsCallable<typeof request, import("../../features/experience/contracts").JsonObject>(functions, "runExperienceOperation")(request)).data;
  },
};
