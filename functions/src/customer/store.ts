import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import type {
  AgreementAcceptanceEvidence,
  AuthoritativeCustomerDataMode,
  CaptureLeadCommand,
  CaptureLeadResult,
  CommunicationConsentFact,
  EnsureOrganizationCustomerCommand,
  EnsureOrganizationCustomerResult,
  IdentityAccountSetupSnapshot,
  LegacyIdentityOnboardingState,
  OnboardingAnswer,
  OnboardingFlowDefinitionV2,
  OnboardingProgressV2,
  OrganizationCustomerProfile,
  OrganizationCustomerRelationship,
  OrganizationLeadRecord,
  SetConsentCommand,
  StartOnboardingCommand,
  StartOnboardingResult,
  CompleteOnboardingStepCommand,
  OnboardingStepMutationResult,
} from "../../../shared/customer/contracts.js";
import { consentFactId } from "../../../shared/customer/consent.js";
import { stableCustomerIdForIdentity } from "../../../shared/customer/identity.js";
import { completeOnboardingStep, createOnboardingProgress, migrateLegacyIdentityOnboarding, onboardingProgressId, resumeOnboardingProgress } from "../../../shared/customer/onboarding.js";
import { db } from "../firebase.js";
import { buildTrustedCustomerLifecycleEvent } from "./events.js";
import { getExperienceRequirementVerifier, getOnboardingDefinitionSource } from "./onboarding-definition-source.js";

export interface VerifiedCustomerPrincipal { identityId: string; email: string | null; emailVerified: boolean; displayName?: string | null; phone?: string | null; }
function organizationRef(organizationId: string) { return db.collection("organizations").doc(organizationId); }
function customerRef(organizationId: string, customerId: string) { return organizationRef(organizationId).collection("customers").doc(customerId); }
function leadRef(organizationId: string, leadId: string) { return organizationRef(organizationId).collection("leads").doc(leadId); }
function consentRef(fact: Pick<CommunicationConsentFact, "organizationId" | "dataMode" | "subjectKind" | "subjectId" | "channel" | "purpose">) { return organizationRef(fact.organizationId).collection("communicationConsents").doc(consentFactId(fact)); }
function progressRef(organizationId: string, progressId: string) { return organizationRef(organizationId).collection("onboardingProgress").doc(progressId); }
function eventRef(organizationId: string, eventId: string) { return organizationRef(organizationId).collection("lifecycleEvents").doc(eventId); }
function agreementRef(organizationId: string, evidenceId: string) { return organizationRef(organizationId).collection("agreementEvidence").doc(evidenceId); }
function sha(value: string) { return createHash("sha256").update(value).digest("hex"); }
function normalizeEmail(value: string | null | undefined) { return value?.trim().toLowerCase() ?? null; }
function proofMatches(raw: string, digest: string) {
  const actual = Buffer.from(sha(raw), "hex"); const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function assertOrganizationAvailable(snapshot: FirebaseFirestore.DocumentSnapshot) {
  if (!snapshot.exists || snapshot.data()?.status !== "active") throw new HttpsError("failed-precondition", "The organization is unavailable.");
}
function assertVerifiedPrincipal(principal: VerifiedCustomerPrincipal) {
  if (!principal.identityId) throw new HttpsError("unauthenticated", "Authentication is required.");
  if (!principal.emailVerified || !principal.email) throw new HttpsError("failed-precondition", "A verified email identity is required before creating an organization Customer relationship.");
}
function defaultGlobalProfile(principal: VerifiedCustomerPrincipal, now: string) {
  return { customerId: stableCustomerIdForIdentity(principal.identityId), identityId: principal.identityId, email: principal.email, displayName: principal.displayName ?? null, firstName: null, lastName: null, phone: principal.phone ?? null, status: "active", onboardingStatus: "not-started", preferences: { theme: "system", emailNotifications: true, smsNotifications: false, pushNotifications: true }, createdAt: now, updatedAt: now };
}
function profileFromSources(principal: VerifiedCustomerPrincipal, global: Record<string, unknown> | undefined, lead?: OrganizationLeadRecord): OrganizationCustomerProfile {
  const leadName = lead?.contact.name?.trim();
  return {
    email: principal.email,
    emailVerified: principal.emailVerified,
    displayName: leadName || (typeof global?.displayName === "string" ? global.displayName : principal.displayName ?? null),
    firstName: typeof global?.firstName === "string" ? global.firstName : null,
    lastName: typeof global?.lastName === "string" ? global.lastName : null,
    phone: lead?.contact.phone ?? (typeof global?.phone === "string" ? global.phone : principal.phone ?? null),
    company: lead?.contact.company ?? null,
    customFields: { ...(lead?.contact.customFields ?? {}) },
  };
}
function asRelationship(snapshot: FirebaseFirestore.DocumentSnapshot, input: { organizationId: string; customerId: string; principal: VerifiedCustomerPrincipal; mode: AuthoritativeCustomerDataMode; profile: OrganizationCustomerProfile; now: string; linkedLeadId?: string }): OrganizationCustomerRelationship | null {
  if (!snapshot.exists) return null;
  const data = snapshot.data() ?? {};
  if (data.identityId !== input.principal.identityId) throw new HttpsError("permission-denied", "The Customer relationship does not belong to this identity.");
  if (data.status !== "active") throw new HttpsError("failed-precondition", "The Customer relationship is not active.");
  if (data.dataMode !== undefined && data.dataMode !== input.mode) throw new HttpsError("failed-precondition", "The Customer relationship belongs to a different execution mode.");
  return {
    schemaVersion: 2,
    organizationId: input.organizationId,
    customerId: input.customerId,
    identityId: input.principal.identityId,
    status: "active",
    dataMode: input.mode,
    profile: (data.profile && typeof data.profile === "object" ? data.profile : input.profile) as OrganizationCustomerProfile,
    ...(typeof data.linkedLeadId === "string" ? { linkedLeadId: data.linkedLeadId } : input.linkedLeadId ? { linkedLeadId: input.linkedLeadId } : {}),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : input.now,
    updatedAt: input.now,
    verifiedAt: typeof data.verifiedAt === "string" ? data.verifiedAt : input.now,
  };
}
function leadIdFor(command: CaptureLeadCommand) { return `lead_${sha(`${command.organizationId}:${command.dataMode}:${command.idempotencyKey}`).slice(0, 40)}`; }

export async function captureLead(command: CaptureLeadCommand, requestIp: string): Promise<CaptureLeadResult> {
  const now = new Date().toISOString(); const leadId = leadIdFor(command); const reference = leadRef(command.organizationId, leadId);
  const proofDigest = sha(command.linkProof); const event = buildTrustedCustomerLifecycleEvent({ eventType: "lead.created", organizationId: command.organizationId, subjectKind: "lead", subjectId: leadId, dataMode: command.dataMode, correlationId: command.idempotencyKey, idempotencyKey: `lead.created:${command.dataMode}:${leadId}`, occurredAt: now, payload: { captureSource: command.captureSource } });
  const minute = now.slice(0, 16); const callerDigest = sha(`${command.organizationId}:${command.dataMode}:${requestIp || "unknown"}:${minute}`); const rateRef = db.collection("_leadCaptureRateLimits").doc(callerDigest);
  return db.runTransaction(async (transaction) => {
    const org = await transaction.get(organizationRef(command.organizationId));
    const existing = await transaction.get(reference);
    const rate = await transaction.get(rateRef);
    const existingEvent = await transaction.get(eventRef(command.organizationId, event.eventId));
    assertOrganizationAvailable(org);
    if (existing.exists) {
      const record = existing.data() as OrganizationLeadRecord;
      if (record.organizationId !== command.organizationId || record.dataMode !== command.dataMode || !proofMatches(command.linkProof, record.linkProofDigest)) throw new HttpsError("aborted", "The lead request conflicts with an existing capture.");
      return { leadId, organizationId: command.organizationId, created: false, linkProof: command.linkProof, capturedAt: record.createdAt };
    }
    const count = Number(rate.data()?.count ?? 0); const limit = requestIp ? 12 : 60;
    if (count >= limit) throw new HttpsError("resource-exhausted", "Too many lead requests were received. Try again later.");
    const lead: OrganizationLeadRecord = { schemaVersion: 2, organizationId: command.organizationId, leadId, status: "captured", dataMode: command.dataMode, contact: command.contact, attribution: command.attribution ?? {}, captureSource: command.captureSource, policyVersion: command.policyVersion, linkProofDigest: proofDigest, createdAt: now, updatedAt: now };
    transaction.create(reference, lead);
    transaction.set(rateRef, { count: count + 1, window: minute, expiresAt: new Date(Date.parse(now) + 15 * 60_000).toISOString() }, { merge: false });
    for (const selection of command.consents) {
      const fact: CommunicationConsentFact = { schemaVersion: 1, organizationId: command.organizationId, subjectKind: "lead", subjectId: leadId, dataMode: command.dataMode, channel: selection.channel, purpose: selection.purpose, decision: selection.decision, source: `lead-capture:${command.captureSource}`, policyVersion: selection.policyVersion, recordedAt: now };
      transaction.set(consentRef(fact), fact, { merge: false });
    }
    if (!existingEvent.exists) transaction.create(eventRef(command.organizationId, event.eventId), JSON.parse(JSON.stringify(event)));
    return { leadId, organizationId: command.organizationId, created: true, linkProof: command.linkProof, capturedAt: now };
  });
}

export async function ensureOrganizationCustomer(command: EnsureOrganizationCustomerCommand, principal: VerifiedCustomerPrincipal): Promise<EnsureOrganizationCustomerResult> {
  assertVerifiedPrincipal(principal);
  if (command.lead && command.lead.organizationId !== command.organizationId) throw new HttpsError("permission-denied", "The lead link is outside the requested organization.");
  const customerId = stableCustomerIdForIdentity(principal.identityId); const now = new Date().toISOString();
  const globalRef = db.collection("identityCustomers").doc(principal.identityId); const relationRef = customerRef(command.organizationId, customerId); const linkRef = command.lead ? leadRef(command.organizationId, command.lead.leadId) : null;
  const registrationEvent = buildTrustedCustomerLifecycleEvent({ eventType: "registration.completed", organizationId: command.organizationId, subjectKind: "customer", subjectId: customerId, identityId: principal.identityId, customerId, dataMode: command.dataMode, correlationId: command.idempotencyKey, idempotencyKey: `registration.completed:${command.dataMode}:${customerId}`, occurredAt: now, payload: { leadLinked: Boolean(command.lead) } });
  const verifiedEvent = buildTrustedCustomerLifecycleEvent({ eventType: "identity.verified", organizationId: command.organizationId, subjectKind: "identity", subjectId: principal.identityId, identityId: principal.identityId, customerId, dataMode: command.dataMode, correlationId: command.idempotencyKey, idempotencyKey: `identity.verified:${command.dataMode}:${customerId}`, occurredAt: now });
  return db.runTransaction(async (transaction) => {
    const org = await transaction.get(organizationRef(command.organizationId));
    const globalSnapshot = await transaction.get(globalRef); const relationshipSnapshot = await transaction.get(relationRef);
    const duplicates = await transaction.get(organizationRef(command.organizationId).collection("customers").where("identityId", "==", principal.identityId).where("status", "==", "active").limit(2));
    const leadSnapshot = linkRef ? await transaction.get(linkRef) : null;
    const leadConsents = command.lead ? await transaction.get(organizationRef(command.organizationId).collection("communicationConsents").where("subjectKind", "==", "lead").where("subjectId", "==", command.lead.leadId).where("dataMode", "==", command.dataMode).limit(20)) : null;
    const customerConsents = command.lead ? await transaction.get(organizationRef(command.organizationId).collection("communicationConsents").where("subjectKind", "==", "customer").where("subjectId", "==", customerId).where("dataMode", "==", command.dataMode).limit(20)) : null;
    const registrationEventSnapshot = await transaction.get(eventRef(command.organizationId, registrationEvent.eventId)); const verifiedEventSnapshot = await transaction.get(eventRef(command.organizationId, verifiedEvent.eventId));
    assertOrganizationAvailable(org);
    for (const item of duplicates.docs) if (item.id !== customerId) throw new HttpsError("already-exists", "An active Customer relationship already exists for this identity in the organization.");
    let lead: OrganizationLeadRecord | undefined;
    if (command.lead) {
      if (!leadSnapshot?.exists) throw new HttpsError("failed-precondition", "The lead link could not be verified.");
      lead = leadSnapshot.data() as OrganizationLeadRecord;
      if (lead.organizationId !== command.organizationId || lead.dataMode !== command.dataMode || !proofMatches(command.lead.linkProof, lead.linkProofDigest)) throw new HttpsError("failed-precondition", "The lead link could not be verified.");
      if (lead.linkedCustomerId && lead.linkedCustomerId !== customerId) throw new HttpsError("failed-precondition", "The lead link could not be verified.");
      if (normalizeEmail(lead.contact.email) !== normalizeEmail(principal.email)) throw new HttpsError("failed-precondition", "The captured lead email does not match the verified account used for linking.");
    }
    const global = globalSnapshot.exists ? globalSnapshot.data() as Record<string, unknown> : undefined;
    if (global && global.customerId !== customerId) throw new HttpsError("failed-precondition", "The existing Release 1 Customer identifier does not match the verified identity.");
    const profile = profileFromSources(principal, global, lead); const existingRelationship = asRelationship(relationshipSnapshot, { organizationId: command.organizationId, customerId, principal, mode: command.dataMode, profile, now, ...(lead ? { linkedLeadId: lead.leadId } : {}) });
    const created = !existingRelationship; const relationship: OrganizationCustomerRelationship = existingRelationship ?? { schemaVersion: 2, organizationId: command.organizationId, customerId, identityId: principal.identityId, status: "active", dataMode: command.dataMode, profile, ...(lead ? { linkedLeadId: lead.leadId } : {}), createdAt: now, updatedAt: now, verifiedAt: now };
    if (!globalSnapshot.exists) transaction.create(globalRef, defaultGlobalProfile(principal, now));
    transaction.set(relationRef, { ...relationship, profile: existingRelationship?.profile ?? profile, ...(lead && !relationship.linkedLeadId ? { linkedLeadId: lead.leadId } : {}), updatedAt: now, verifiedAt: now }, { merge: false });
    if (lead && linkRef) transaction.set(linkRef, { ...lead, status: "linked", linkedCustomerId: customerId, linkedIdentityId: principal.identityId, linkedAt: lead.linkedAt ?? now, updatedAt: now }, { merge: false });
    if (leadConsents && customerConsents) {
      const existingIds = new Set(customerConsents.docs.map((item) => item.id));
      for (const item of leadConsents.docs) {
        const source = item.data() as CommunicationConsentFact; const fact: CommunicationConsentFact = { ...source, subjectKind: "customer", subjectId: customerId, derivedFromLeadId: lead!.leadId };
        const target = consentRef(fact); if (!existingIds.has(target.id)) transaction.create(target, fact);
      }
    }
    if (created && !registrationEventSnapshot.exists) transaction.create(eventRef(command.organizationId, registrationEvent.eventId), JSON.parse(JSON.stringify(registrationEvent)));
    if (!verifiedEventSnapshot.exists) transaction.create(eventRef(command.organizationId, verifiedEvent.eventId), JSON.parse(JSON.stringify(verifiedEvent)));
    return { customer: { ...relationship, ...(lead ? { linkedLeadId: lead.leadId } : {}) }, leadLinked: Boolean(lead), created };
  });
}

export async function getOrganizationCustomer(organizationId: string, customerId: string, mode: AuthoritativeCustomerDataMode, principal: VerifiedCustomerPrincipal) {
  const snapshot = await customerRef(organizationId, customerId).get(); if (!snapshot.exists) throw new HttpsError("not-found", "Customer relationship not found.");
  const data = snapshot.data() as OrganizationCustomerRelationship;
  if (data.identityId !== principal.identityId || data.organizationId !== organizationId) throw new HttpsError("permission-denied", "Customer scope is unavailable.");
  if (data.dataMode !== mode) throw new HttpsError("failed-precondition", "Customer relationship belongs to a different execution mode.");
  return data;
}

export async function setCustomerConsent(command: SetConsentCommand, principal: VerifiedCustomerPrincipal) {
  const relation = await getOrganizationCustomer(command.organizationId, command.customerId, command.dataMode, principal); if (relation.status !== "active") throw new HttpsError("failed-precondition", "Customer relationship is not active.");
  const now = new Date().toISOString(); const fact: CommunicationConsentFact = { schemaVersion: 1, organizationId: command.organizationId, subjectKind: "customer", subjectId: command.customerId, dataMode: command.dataMode, channel: command.channel, purpose: command.purpose, decision: command.decision, source: command.source, policyVersion: command.policyVersion, recordedAt: now, ...(command.decision === "withdrawn" ? { withdrawnAt: now } : {}) };
  await consentRef(fact).set(fact, { merge: false }); return fact;
}
export async function getCustomerConsents(organizationId: string, customerId: string, mode: AuthoritativeCustomerDataMode, principal: VerifiedCustomerPrincipal) {
  await getOrganizationCustomer(organizationId, customerId, mode, principal);
  const snapshot = await organizationRef(organizationId).collection("communicationConsents").where("subjectKind", "==", "customer").where("subjectId", "==", customerId).where("dataMode", "==", mode).limit(20).get();
  return snapshot.docs.map((item) => item.data() as CommunicationConsentFact);
}

async function assertCustomerScopeForOnboarding(command: { organizationId: string; customerId: string; dataMode: AuthoritativeCustomerDataMode }, principal: VerifiedCustomerPrincipal) {
  assertVerifiedPrincipal(principal); return getOrganizationCustomer(command.organizationId, command.customerId, command.dataMode, principal);
}
export async function startOnboarding(command: StartOnboardingCommand, principal: VerifiedCustomerPrincipal): Promise<StartOnboardingResult> {
  await assertCustomerScopeForOnboarding(command, principal);
  const definition = await getOnboardingDefinitionSource().getPublished({ organizationId: command.organizationId, flowId: command.flowId });
  if (!definition) throw new HttpsError("failed-precondition", "The published onboarding flow is unavailable.");
  if (definition.requiresVerifiedEmail && !principal.emailVerified) throw new HttpsError("failed-precondition", "Verify your email before onboarding.");
  const scope = { organizationId: command.organizationId, customerId: command.customerId, dataMode: command.dataMode, flowId: command.flowId, ...(command.experienceId ? { experienceId: command.experienceId } : {}) } as const;
  const progressId = onboardingProgressId(scope); const reference = progressRef(command.organizationId, progressId); const now = new Date().toISOString();
  const event = buildTrustedCustomerLifecycleEvent({ eventType: "onboarding.started", organizationId: command.organizationId, subjectKind: "customer", subjectId: command.customerId, identityId: principal.identityId, customerId: command.customerId, dataMode: command.dataMode, correlationId: command.idempotencyKey, idempotencyKey: `onboarding.started:${command.dataMode}:${progressId}`, occurredAt: now, payload: { flowId: command.flowId, flowVersion: definition.version } });
  return db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(reference); const eventSnapshot = await transaction.get(eventRef(command.organizationId, event.eventId));
    if (currentSnapshot.exists) {
      const current = currentSnapshot.data() as OnboardingProgressV2;
      if (current.scope.organizationId !== command.organizationId || current.scope.customerId !== command.customerId || current.scope.dataMode !== command.dataMode) throw new HttpsError("permission-denied", "Onboarding scope mismatch.");
      const resumed = current.status === "abandoned"; const progress = resumed ? resumeOnboardingProgress(current, now) : current;
      if (resumed) transaction.set(reference, progress, { merge: false });
      const pinned = await getOnboardingDefinitionSource().getVersion({ organizationId: command.organizationId, flowId: current.scope.flowId, version: current.flowVersion });
      if (!pinned) throw new HttpsError("failed-precondition", "The pinned onboarding flow version is unavailable.");
      return { definition: pinned, progress, created: false, resumed };
    }
    const progress = createOnboardingProgress(scope, definition, now); transaction.create(reference, progress);
    if (!eventSnapshot.exists) transaction.create(eventRef(command.organizationId, event.eventId), JSON.parse(JSON.stringify(event)));
    return { definition, progress, created: true, resumed: false };
  });
}

function agreementEvidenceId(progress: OnboardingProgressV2, agreementId: string, agreementVersion: string) { return `agree_${sha(`${progress.scope.organizationId}:${progress.scope.customerId}:${progress.scope.dataMode}:${progress.progressId}:${agreementId}:${agreementVersion}`).slice(0, 48)}`; }
function profileUpdatesForStep(definition: OnboardingFlowDefinitionV2, stepId: string, answers: Record<string, OnboardingAnswer>) {
  const step = definition.steps.find((candidate) => candidate.id === stepId); const direct: Record<string, string | null> = {}; const custom: Record<string, string> = {};
  for (const question of step?.questions ?? []) {
    const value = answers[question.id]; if (question.profileField) direct[question.profileField] = typeof value === "string" ? value.trim() || null : null;
    if (question.customProfileField && typeof value === "string") custom[question.customProfileField] = value.trim();
  }
  return { direct, custom };
}
export async function completeOnboarding(command: CompleteOnboardingStepCommand, principal: VerifiedCustomerPrincipal): Promise<OnboardingStepMutationResult> {
  await assertCustomerScopeForOnboarding(command, principal);
  const initial = await progressRef(command.organizationId, command.progressId).get(); if (!initial.exists) throw new HttpsError("not-found", "Onboarding progress is unavailable.");
  const initialProgress = initial.data() as OnboardingProgressV2;
  if (initialProgress.scope.organizationId !== command.organizationId || initialProgress.scope.customerId !== command.customerId || initialProgress.scope.dataMode !== command.dataMode) throw new HttpsError("permission-denied", "Onboarding scope mismatch.");
  const definition = await getOnboardingDefinitionSource().getVersion({ organizationId: command.organizationId, flowId: initialProgress.scope.flowId, version: initialProgress.flowVersion });
  if (!definition) throw new HttpsError("failed-precondition", "The pinned onboarding flow version is unavailable.");
  const step = definition.steps.find((candidate) => candidate.id === command.stepId); if (!step) throw new HttpsError("invalid-argument", "Onboarding step is unavailable.");
  let verifiedEvidenceId: string | undefined;
  if (step.experienceRequirement) {
    const verified = await getExperienceRequirementVerifier().verify({ organizationId: command.organizationId, customerId: command.customerId, experienceId: initialProgress.scope.experienceId, flowId: initialProgress.scope.flowId, flowVersion: initialProgress.flowVersion, requirementId: step.experienceRequirement.requirementId, candidateEvidenceId: command.experienceEvidenceId, dataMode: command.dataMode });
    if (step.experienceRequirement.required && verified.status !== "verified") throw new HttpsError("failed-precondition", verified.status === "unverified" ? verified.reason : "Experience requirement is incomplete.");
    if (verified.status === "verified") verifiedEvidenceId = verified.evidenceId;
  }
  const now = new Date().toISOString(); const stepEvent = buildTrustedCustomerLifecycleEvent({ eventType: "onboarding.step_completed", organizationId: command.organizationId, subjectKind: "customer", subjectId: command.customerId, identityId: principal.identityId, customerId: command.customerId, dataMode: command.dataMode, correlationId: command.idempotencyKey, idempotencyKey: `onboarding.step_completed:${command.dataMode}:${command.progressId}:${command.stepId}`, occurredAt: now, payload: { flowId: initialProgress.scope.flowId, flowVersion: initialProgress.flowVersion, stepId: command.stepId } });
  const completionEvent = buildTrustedCustomerLifecycleEvent({ eventType: "onboarding.completed", organizationId: command.organizationId, subjectKind: "customer", subjectId: command.customerId, identityId: principal.identityId, customerId: command.customerId, dataMode: command.dataMode, correlationId: command.idempotencyKey, idempotencyKey: `onboarding.completed:${command.dataMode}:${command.progressId}`, occurredAt: now, payload: { flowId: initialProgress.scope.flowId, flowVersion: initialProgress.flowVersion } });
  return db.runTransaction(async (transaction) => {
    const reference = progressRef(command.organizationId, command.progressId); const currentSnapshot = await transaction.get(reference); const relationSnapshot = await transaction.get(customerRef(command.organizationId, command.customerId)); const stepEventSnapshot = await transaction.get(eventRef(command.organizationId, stepEvent.eventId)); const completionEventSnapshot = await transaction.get(eventRef(command.organizationId, completionEvent.eventId));
    if (!currentSnapshot.exists || !relationSnapshot.exists) throw new HttpsError("failed-precondition", "Onboarding scope is unavailable.");
    const current = currentSnapshot.data() as OnboardingProgressV2; if (current.flowVersion !== definition.version) throw new HttpsError("aborted", "The onboarding progress version changed.");
    const result = completeOnboardingStep(definition, current, { stepId: command.stepId, answers: command.answers, ...(command.agreementAccepted ? { agreementAccepted: true } : {}), ...(verifiedEvidenceId ? { experienceEvidenceId: verifiedEvidenceId } : {}) }, now);
    if (!result.stepCompletedNow) return result;
    let evidenceRefSnapshot: FirebaseFirestore.DocumentSnapshot | null = null; let evidence: AgreementAcceptanceEvidence | null = null;
    if (step.agreement && command.agreementAccepted) {
      const evidenceId = agreementEvidenceId(current, step.agreement.id, step.agreement.version); const ref = agreementRef(command.organizationId, evidenceId); evidenceRefSnapshot = await transaction.get(ref);
      evidence = { evidenceId, organizationId: command.organizationId, customerId: command.customerId, flowId: current.scope.flowId, flowVersion: current.flowVersion, agreementId: step.agreement.id, agreementVersion: step.agreement.version, acceptedAt: now, source: "onboarding", dataMode: command.dataMode };
    }
    const relation = relationSnapshot.data() as OrganizationCustomerRelationship; if (relation.identityId !== principal.identityId || relation.dataMode !== command.dataMode) throw new HttpsError("permission-denied", "Customer scope mismatch.");
    const updates = profileUpdatesForStep(definition, command.stepId, command.answers); const profile = { ...relation.profile, ...updates.direct, customFields: { ...relation.profile.customFields, ...updates.custom } };
    transaction.set(reference, result.progress, { merge: false }); transaction.set(customerRef(command.organizationId, command.customerId), { ...relation, profile, updatedAt: now }, { merge: false });
    if (evidence && evidenceRefSnapshot && !evidenceRefSnapshot.exists) transaction.create(agreementRef(command.organizationId, evidence.evidenceId), evidence);
    if (!stepEventSnapshot.exists) transaction.create(eventRef(command.organizationId, stepEvent.eventId), JSON.parse(JSON.stringify(stepEvent)));
    if (result.onboardingCompletedNow && !completionEventSnapshot.exists) transaction.create(eventRef(command.organizationId, completionEvent.eventId), JSON.parse(JSON.stringify(completionEvent)));
    return result;
  });
}

/** Explicit, projection-only migration target. It never fans an identity record into all organizations and emits no lifecycle event. */
export async function migrateLegacyOnboardingForOrganization(input: { organizationId: string; identityId: string; flowId: string; dataMode: AuthoritativeCustomerDataMode }) {
  const customerId = stableCustomerIdForIdentity(input.identityId); const relation = await customerRef(input.organizationId, customerId).get(); if (!relation.exists || relation.data()?.identityId !== input.identityId) throw new HttpsError("failed-precondition", "An explicit organization Customer relationship is required before migration.");
  const legacySnapshot = await db.collection("identityOnboarding").doc(input.identityId).get(); if (!legacySnapshot.exists) return { created: false, reason: "legacy-missing" as const };
  const legacy = legacySnapshot.data() as LegacyIdentityOnboardingState; if (legacy.customerId !== customerId) throw new HttpsError("failed-precondition", "Legacy onboarding Customer ID does not match the stable Release 1 identifier.");
  const definition = await getOnboardingDefinitionSource().getPublished({ organizationId: input.organizationId, flowId: input.flowId }); if (!definition) throw new HttpsError("failed-precondition", "Published onboarding flow is unavailable.");
  const scope = { organizationId: input.organizationId, customerId, dataMode: input.dataMode, flowId: input.flowId }; const target = progressRef(input.organizationId, onboardingProgressId(scope)); const accountSetupRef = db.collection("identityAccountSetup").doc(input.identityId); const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const targetSnapshot = await transaction.get(target); const accountSnapshot = await transaction.get(accountSetupRef); if (targetSnapshot.exists) return { created: false, reason: "already-migrated" as const, progress: targetSnapshot.data() as OnboardingProgressV2 };
    const progress = migrateLegacyIdentityOnboarding(legacy, scope, definition, now);
    const globalKeys = new Set(["displayName", "firstName", "lastName", "phone", "emailNotifications", "smsNotifications", "pushNotifications"]); const profileAnswers = Object.fromEntries(Object.entries(legacy.answers).filter(([key]) => globalKeys.has(key)));
    const accountSetup: IdentityAccountSetupSnapshot = { schemaVersion: 1, identityId: input.identityId, source: "identityOnboarding", sourceDefinitionId: legacy.definitionId, sourceDefinitionVersion: legacy.definitionVersion, profileAnswers, preservedAt: now };
    transaction.create(target, progress); if (!accountSnapshot.exists) transaction.create(accountSetupRef, accountSetup);
    return { created: true, reason: "migrated" as const, progress };
  });
}
