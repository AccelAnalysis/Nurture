export {
  getCommunicationSenderReadiness,
  listCommunicationMessages,
  listCommunicationTemplates,
  publishCommunicationTemplateVersion,
  saveCommunicationTemplate,
  sendCommunicationTest,
} from "./admin.js";
export { sendGridEventWebhook } from "./webhook.js";
export { dispatchEmail, type DispatchEmailCommand, type DispatchEmailPrerequisites } from "./service.js";
export { getSendGridEmailAdapter, SendGridEmailAdapter } from "./sendgrid-adapter.js";
export {
  adaptCurrentConsent,
  createAcquisitionEmailDispatchAdapter,
  mapAcquisitionPurpose,
  parseCommunicationTemplateVersionId,
  requireApprovedCommunicationTemplateId,
  type AcquisitionCommunicationInput,
  type AcquisitionCommunicationSubmitInput,
  type CurrentCommunicationConsentFact,
  type CurrentCommunicationContext,
  type CurrentCommunicationContextPort,
} from "./acquisition-dispatch.js";
export {
  listPendingCommunicationEventOutbox,
  markCommunicationEventOutboxAppended,
  markCommunicationEventOutboxFailed,
} from "./store.js";
export {
  communicationEventTypeForStatus,
  createCommunicationEventOutboxRecord,
  type CommunicationEventOutboxRecord,
  type CommunicationLifecycleEventSource,
  type CommunicationLifecycleEventType,
} from "./outbox.js";
