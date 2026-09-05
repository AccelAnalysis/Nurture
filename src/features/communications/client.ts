import { httpsCallable } from "firebase/functions";
import { backendUnavailableMessage, releaseBackendReady } from "../../app/release/readiness";
import { firebaseConfigured, functions } from "../../firebase";
import type {
  CommunicationTemplateId,
  CommunicationTemplateView,
  EmailSenderReadiness,
  EmailTemplateContent,
  MessageDeliveryRecord,
} from "./contracts";

function requireFunctions() {
  if (!releaseBackendReady) throw new Error(backendUnavailableMessage);
  if (!firebaseConfigured || !functions) throw new Error("Communications require the configured Nurture Firebase project.");
  return functions;
}

export async function listCommunicationTemplates(organizationId: string) {
  const callable = httpsCallable<{ organizationId: string }, { templates: CommunicationTemplateView[] }>(requireFunctions(), "listCommunicationTemplates");
  const result = await callable({ organizationId });
  return result.data.templates;
}

export async function saveCommunicationTemplate(organizationId: string, templateId: CommunicationTemplateId, content: EmailTemplateContent) {
  const callable = httpsCallable<
    { organizationId: string; templateId: CommunicationTemplateId; content: EmailTemplateContent },
    { template: CommunicationTemplateView }
  >(requireFunctions(), "saveCommunicationTemplate");
  const result = await callable({ organizationId, templateId, content });
  return result.data.template;
}

export async function publishCommunicationTemplateVersion(organizationId: string, templateId: CommunicationTemplateId) {
  const callable = httpsCallable<
    { organizationId: string; templateId: CommunicationTemplateId },
    { template: CommunicationTemplateView }
  >(requireFunctions(), "publishCommunicationTemplateVersion");
  const result = await callable({ organizationId, templateId });
  return result.data.template;
}

export async function getCommunicationSenderReadiness(organizationId: string) {
  const callable = httpsCallable<{ organizationId: string }, { sender: EmailSenderReadiness }>(requireFunctions(), "getCommunicationSenderReadiness");
  const result = await callable({ organizationId });
  return result.data.sender;
}

export async function sendCommunicationTest(input: {
  organizationId: string;
  templateId: CommunicationTemplateId;
  recipientEmail: string;
  attemptId?: string;
}) {
  const callable = httpsCallable<
    { organizationId: string; templateId: CommunicationTemplateId; recipientEmail: string; attemptId: string },
    { submitted: boolean; reason: string | null; record: MessageDeliveryRecord | null }
  >(requireFunctions(), "sendCommunicationTest");
  const result = await callable({ ...input, attemptId: input.attemptId ?? crypto.randomUUID() });
  return result.data;
}

export async function listCommunicationMessages(input: {
  organizationId: string;
  recipientKind?: "customer" | "lead" | "test";
  recipientId?: string;
  limit?: number;
}) {
  const callable = httpsCallable<typeof input, { messages: MessageDeliveryRecord[] }>(requireFunctions(), "listCommunicationMessages");
  const result = await callable(input);
  return result.data.messages;
}
