import { HttpsError } from "firebase-functions/v2/https";
import type {
  AuthoritativeCustomerDataMode,
  CaptureLeadCommand,
  CompleteOnboardingStepCommand,
  ConsentCaptureInput,
  EnsureOrganizationCustomerCommand,
  LeadAttributionCandidates,
  LeadContact,
  OnboardingAnswer,
  SetConsentCommand,
  StartOnboardingCommand,
} from "../../../shared/customer/contracts.js";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "A request object is required.");
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max: number, required = true) {
  if (value === undefined || value === null) { if (!required) return undefined; throw new HttpsError("invalid-argument", `${field} is required.`); }
  if (typeof value !== "string") throw new HttpsError("invalid-argument", `${field} must be text.`);
  const next = value.trim();
  if ((required && !next) || next.length > max) throw new HttpsError("invalid-argument", `${field} is invalid.`);
  return next;
}
export function parseOrganizationId(value: unknown) {
  const next = text(value, "organizationId", 128)!;
  if (next.includes("/")) throw new HttpsError("invalid-argument", "organizationId is invalid.");
  return next;
}
export function parseDataMode(value: unknown): AuthoritativeCustomerDataMode {
  if (value === "live" || value === "test" || value === "development") return value;
  throw new HttpsError("invalid-argument", "Only live, test, or development customer mutations are accepted. Preview and demo never write authoritative customer state.");
}
function parseIdempotency(value: unknown) { const next = text(value, "idempotencyKey", 200)!; if (next.length < 8) throw new HttpsError("invalid-argument", "idempotencyKey is too short."); return next; }
function parseLinkProof(value: unknown) { const next = text(value, "linkProof", 256)!; if (next.length < 32) throw new HttpsError("invalid-argument", "Lead link proof is invalid."); return next; }
function parseEmail(value: unknown) {
  const next = text(value, "email", 320)!.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) throw new HttpsError("invalid-argument", "A valid email address is required.");
  return next;
}
function parseCustomFields(value: unknown) {
  if (value === undefined) return {};
  const source = record(value);
  const entries = Object.entries(source);
  if (entries.length > 20) throw new HttpsError("invalid-argument", "Too many custom fields were supplied.");
  const output: Record<string, string> = {};
  for (const [key, raw] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) throw new HttpsError("invalid-argument", "A custom field ID is invalid.");
    output[key] = text(raw, `customFields.${key}`, 500, false) ?? "";
  }
  return output;
}
function parseContact(value: unknown): LeadContact {
  const source = record(value);
  const phone = text(source.phone, "phone", 40, false);
  const company = text(source.company, "company", 160, false);
  return { name: text(source.name, "name", 160)!, email: parseEmail(source.email), ...(phone ? { phone } : {}), ...(company ? { company } : {}), customFields: parseCustomFields(source.customFields) };
}
function parseAttribution(value: unknown): LeadAttributionCandidates | undefined {
  if (value === undefined) return undefined;
  const source = record(value); const output: LeadAttributionCandidates = {};
  for (const key of ["source", "landingPath", "referralCode", "offerId", "campaign", "medium", "content"] as const) {
    const parsed = text(source[key], `attribution.${key}`, 300, false); if (parsed) output[key] = parsed;
  }
  return output;
}
function parseConsents(value: unknown): ConsentCaptureInput[] {
  if (!Array.isArray(value) || value.length > 4) throw new HttpsError("invalid-argument", "Consent selections are invalid.");
  const seen = new Set<string>();
  return value.map((item) => {
    const source = record(item);
    const channel = source.channel === "email" || source.channel === "sms" ? source.channel : null;
    const purpose = source.purpose === "marketing" || source.purpose === "service" ? source.purpose : null;
    const decision = source.decision === "granted" || source.decision === "denied" ? source.decision : null;
    if (!channel || !purpose || !decision) throw new HttpsError("invalid-argument", "A consent selection is invalid.");
    const key = `${channel}:${purpose}`; if (seen.has(key)) throw new HttpsError("invalid-argument", "A consent selection was duplicated."); seen.add(key);
    return { channel, purpose, decision, policyVersion: text(source.policyVersion, "consent policyVersion", 80)! };
  });
}
export function parseCaptureLeadCommand(value: unknown): CaptureLeadCommand {
  const source = record(value); const website = text(source.website, "website", 200, false);
  if (website) throw new HttpsError("permission-denied", "The lead request could not be accepted.");
  const attribution = parseAttribution(source.attribution);
  return { organizationId: parseOrganizationId(source.organizationId), dataMode: parseDataMode(source.dataMode), idempotencyKey: parseIdempotency(source.idempotencyKey), linkProof: parseLinkProof(source.linkProof), contact: parseContact(source.contact), ...(attribution ? { attribution } : {}), captureSource: text(source.captureSource, "captureSource", 120)!, policyVersion: text(source.policyVersion, "policyVersion", 80)!, consents: parseConsents(source.consents), ...(source.website !== undefined ? { website: "" } : {}) };
}
export function parseEnsureCustomerCommand(value: unknown): EnsureOrganizationCustomerCommand {
  const source = record(value); let lead: EnsureOrganizationCustomerCommand["lead"];
  if (source.lead !== undefined) { const candidate = record(source.lead); lead = { organizationId: parseOrganizationId(candidate.organizationId), leadId: text(candidate.leadId, "leadId", 160)!, linkProof: parseLinkProof(candidate.linkProof) }; }
  return { organizationId: parseOrganizationId(source.organizationId), dataMode: parseDataMode(source.dataMode), idempotencyKey: parseIdempotency(source.idempotencyKey), ...(lead ? { lead } : {}) };
}
function parseCustomerId(value: unknown) { return text(value, "customerId", 320)!; }
export function parseSetConsentCommand(value: unknown): SetConsentCommand {
  const source = record(value);
  const channel = source.channel === "email" || source.channel === "sms" ? source.channel : null;
  const purpose = source.purpose === "marketing" || source.purpose === "service" ? source.purpose : null;
  const decision = source.decision === "granted" || source.decision === "denied" || source.decision === "withdrawn" ? source.decision : null;
  if (!channel || !purpose || !decision) throw new HttpsError("invalid-argument", "Consent selection is invalid.");
  return { organizationId: parseOrganizationId(source.organizationId), customerId: parseCustomerId(source.customerId), dataMode: parseDataMode(source.dataMode), idempotencyKey: parseIdempotency(source.idempotencyKey), channel, purpose, decision, source: text(source.source, "source", 120)!, policyVersion: text(source.policyVersion, "policyVersion", 80)! };
}
export function parseStartOnboardingCommand(value: unknown): StartOnboardingCommand {
  const source = record(value); const experienceId = text(source.experienceId, "experienceId", 160, false);
  return { organizationId: parseOrganizationId(source.organizationId), customerId: parseCustomerId(source.customerId), dataMode: parseDataMode(source.dataMode), flowId: text(source.flowId, "flowId", 160)!, ...(experienceId ? { experienceId } : {}), idempotencyKey: parseIdempotency(source.idempotencyKey) };
}
function parseAnswers(value: unknown): Record<string, OnboardingAnswer> {
  const source = record(value); if (Object.keys(source).length > 25) throw new HttpsError("invalid-argument", "Too many onboarding answers were supplied.");
  const output: Record<string, OnboardingAnswer> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (!/^[A-Za-z0-9_.-]{1,96}$/.test(key)) throw new HttpsError("invalid-argument", "An onboarding answer ID is invalid.");
    if (typeof raw === "boolean") output[key] = raw;
    else if (typeof raw === "string" && raw.length <= 2000) output[key] = raw;
    else if (Array.isArray(raw) && raw.length <= 30 && raw.every((item) => typeof item === "string" && item.length <= 500)) output[key] = raw as string[];
    else throw new HttpsError("invalid-argument", `Onboarding answer ${key} is invalid.`);
  }
  return output;
}
export function parseCompleteOnboardingStepCommand(value: unknown): CompleteOnboardingStepCommand {
  const source = record(value); const evidence = text(source.experienceEvidenceId, "experienceEvidenceId", 240, false);
  return { organizationId: parseOrganizationId(source.organizationId), customerId: parseCustomerId(source.customerId), dataMode: parseDataMode(source.dataMode), progressId: text(source.progressId, "progressId", 700)!, stepId: text(source.stepId, "stepId", 160)!, answers: parseAnswers(source.answers), ...(source.agreementAccepted === true ? { agreementAccepted: true } : {}), ...(evidence ? { experienceEvidenceId: evidence } : {}), idempotencyKey: parseIdempotency(source.idempotencyKey) };
}
