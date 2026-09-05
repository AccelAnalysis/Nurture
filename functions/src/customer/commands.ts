import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { captureLead, completeOnboarding, ensureOrganizationCustomer, getCustomerConsents, getOrganizationCustomer, setCustomerConsent, startOnboarding, type VerifiedCustomerPrincipal } from "./store.js";
import { parseCaptureLeadCommand, parseCompleteOnboardingStepCommand, parseDataMode, parseEnsureCustomerCommand, parseOrganizationId, parseSetConsentCommand, parseStartOnboardingCommand } from "./validation.js";

function principalFromRequest(request: CallableRequest<unknown>): VerifiedCustomerPrincipal {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
  const token = request.auth.token;
  return { identityId: request.auth.uid, email: typeof token.email === "string" ? token.email : null, emailVerified: token.email_verified === true, displayName: typeof token.name === "string" ? token.name : null, phone: typeof token.phone_number === "string" ? token.phone_number : null };
}
function objectData(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "A request object is required."); return value as Record<string, unknown>; }

/** Public callable; server validation, honeypot, tenant existence, idempotency, and Firestore rate windows provide the abuse boundary. */
export const r2CaptureLead = onCall(async (request) => captureLead(parseCaptureLeadCommand(request.data), request.rawRequest.ip || ""));
export const r2EnsureOrganizationCustomer = onCall(async (request) => ensureOrganizationCustomer(parseEnsureCustomerCommand(request.data), principalFromRequest(request)));
export const r2GetOrganizationCustomer = onCall(async (request) => {
  const source = objectData(request.data); return getOrganizationCustomer(parseOrganizationId(source.organizationId), String(source.customerId ?? ""), parseDataMode(source.dataMode), principalFromRequest(request));
});
export const r2SetCustomerConsent = onCall(async (request) => setCustomerConsent(parseSetConsentCommand(request.data), principalFromRequest(request)));
export const r2GetCustomerConsents = onCall(async (request) => {
  const source = objectData(request.data); return getCustomerConsents(parseOrganizationId(source.organizationId), String(source.customerId ?? ""), parseDataMode(source.dataMode), principalFromRequest(request));
});
export const r2StartOnboarding = onCall(async (request) => startOnboarding(parseStartOnboardingCommand(request.data), principalFromRequest(request)));
export const r2CompleteOnboardingStep = onCall(async (request) => completeOnboarding(parseCompleteOnboardingStepCommand(request.data), principalFromRequest(request)));
