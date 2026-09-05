import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FICTIONAL_PREVIEW_VARIABLES } from "../../../shared/communications/defaults.js";
import {
  communicationTemplateIds,
  communicationVariableKeys,
  type CommunicationTemplateId,
  type CommunicationVariableKey,
  type EmailTemplateContent,
} from "../../../shared/communications/contracts.js";
import { assertOrganizationCapability } from "../billing/store.js";
import { getCommunicationTrustedOrigins, getControlledTestAllowlist, sendGridApiKey } from "./config.js";
import { dispatchEmail } from "./service.js";
import {
  getCommunicationTemplateView,
  getEmailSenderReadiness,
  hashRecipientEmail,
  listCommunicationHistory,
  listCommunicationTemplateViews,
  normalizeEmailAddress,
  publishCommunicationTemplate,
  saveCommunicationTemplateDraft,
} from "./store.js";

const templateIdSet = new Set<string>(communicationTemplateIds);
const variableKeySet = new Set<string>(communicationVariableKeys);

function dataRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Request data must be an object.");
  return value as Record<string, unknown>;
}

function requireUserId(auth: { uid: string } | undefined) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in to continue.");
  return auth.uid;
}

function requiredId(value: unknown, field: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new HttpsError("invalid-argument", `${field} is invalid.`);
  return value;
}

function templateId(value: unknown): CommunicationTemplateId {
  if (typeof value !== "string" || !templateIdSet.has(value)) throw new HttpsError("invalid-argument", "templateId is not in the approved Release 2 catalog.");
  return value as CommunicationTemplateId;
}

function templateContent(value: unknown): EmailTemplateContent {
  const data = dataRecord(value);
  if (typeof data.name !== "string" || typeof data.subject !== "string" || typeof data.body !== "string" || !Array.isArray(data.variables)) {
    throw new HttpsError("invalid-argument", "Template content is invalid.");
  }
  const variables: CommunicationVariableKey[] = [];
  for (const variable of data.variables) {
    if (typeof variable !== "string" || !variableKeySet.has(variable)) throw new HttpsError("invalid-argument", "Template contains an unapproved variable.");
    variables.push(variable as CommunicationVariableKey);
  }
  return { name: data.name, subject: data.subject, body: data.body, variables };
}

function asHttpsError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "The communication operation could not be completed.");
}

function controlledTestVariables() {
  const origin = getCommunicationTrustedOrigins()[0];
  if (!origin) throw new HttpsError("failed-precondition", "No trusted application link origin is configured for controlled email tests.");
  return {
    ...FICTIONAL_PREVIEW_VARIABLES,
    "experience.startUrl": `${origin}/experience`,
    "onboarding.resumeUrl": `${origin}/onboarding`,
    "offer.checkoutUrl": `${origin}/offers`,
    "application.publicUrl": `${origin}/`,
    "preferences.url": `${origin}/preferences/email`,
  };
}

export const listCommunicationTemplates = onCall(async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = requiredId(data.organizationId, "organizationId");
    const userId = requireUserId(request.auth);
    await assertOrganizationCapability(organizationId, userId, "communications.view");
    return { templates: await listCommunicationTemplateViews(organizationId) };
  } catch (error) {
    asHttpsError(error);
  }
});

export const saveCommunicationTemplate = onCall(async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = requiredId(data.organizationId, "organizationId");
    const id = templateId(data.templateId);
    const userId = requireUserId(request.auth);
    await assertOrganizationCapability(organizationId, userId, "communications.manage");
    const view = await saveCommunicationTemplateDraft({
      organizationId,
      templateId: id,
      content: templateContent(data.content),
      actorUserId: userId,
    });
    return { template: view };
  } catch (error) {
    asHttpsError(error);
  }
});

export const publishCommunicationTemplateVersion = onCall(async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = requiredId(data.organizationId, "organizationId");
    const id = templateId(data.templateId);
    const userId = requireUserId(request.auth);
    await assertOrganizationCapability(organizationId, userId, "communications.manage");
    const published = await publishCommunicationTemplate({ organizationId, templateId: id, actorUserId: userId });
    return { published, template: await getCommunicationTemplateView(organizationId, id) };
  } catch (error) {
    asHttpsError(error);
  }
});

export const getCommunicationSenderReadiness = onCall(async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = requiredId(data.organizationId, "organizationId");
    const userId = requireUserId(request.auth);
    await assertOrganizationCapability(organizationId, userId, "communications.view");
    return { sender: await getEmailSenderReadiness(organizationId) };
  } catch (error) {
    asHttpsError(error);
  }
});

export const sendCommunicationTest = onCall({ secrets: [sendGridApiKey] }, async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = requiredId(data.organizationId, "organizationId");
    const id = templateId(data.templateId);
    const attemptId = requiredId(data.attemptId, "attemptId");
    const userId = requireUserId(request.auth);
    await assertOrganizationCapability(organizationId, userId, "communications.manage");
    if (typeof data.recipientEmail !== "string" || data.recipientEmail.length > 320) throw new HttpsError("invalid-argument", "A valid controlled test recipient is required.");
    const recipientEmail = normalizeEmailAddress(data.recipientEmail);
    const allowlisted = getControlledTestAllowlist().has(recipientEmail);
    const view = await getCommunicationTemplateView(organizationId, id);
    if (!view.published) return { submitted: false, reason: "Publish a template version before a controlled provider test.", record: null };
    const result = await dispatchEmail({
      organizationId,
      effectId: `controlled-test:${organizationId}:${id}:${attemptId}`,
      mode: "test",
      purpose: view.published.purpose,
      recipient: { kind: "test", id: hashRecipientEmail(recipientEmail) },
      templateId: id,
      templateVersion: view.published.version,
      variables: controlledTestVariables(),
      trigger: { eventId: `controlled-test:${attemptId}` },
    }, {
      recipientEmail,
      consent: { decision: "not-required", purpose: view.published.purpose, source: "controlled-provider-test", observedAt: new Date().toISOString() },
      testAllowlisted: allowlisted,
    });
    return { submitted: result.submitted, reason: result.record.statusReason ?? result.eligibility?.explanation ?? null, record: result.record };
  } catch (error) {
    asHttpsError(error);
  }
});

export const listCommunicationMessages = onCall(async (request) => {
  try {
    const data = dataRecord(request.data);
    const organizationId = requiredId(data.organizationId, "organizationId");
    const userId = requireUserId(request.auth);
    await assertOrganizationCapability(organizationId, userId, "communications.view");
    const recipientKind = data.recipientKind === "customer" || data.recipientKind === "lead" || data.recipientKind === "test" ? data.recipientKind : undefined;
    const recipientId = recipientKind && typeof data.recipientId === "string" ? requiredId(data.recipientId, "recipientId") : undefined;
    const limit = typeof data.limit === "number" && Number.isInteger(data.limit) ? data.limit : 50;
    return { messages: await listCommunicationHistory({ organizationId, recipientKind, recipientId, limit }) };
  } catch (error) {
    asHttpsError(error);
  }
});
