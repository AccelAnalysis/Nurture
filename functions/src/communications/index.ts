export {
  getCommunicationSenderReadiness,
  listCommunicationMessages,
  listCommunicationTemplates,
  publishCommunicationTemplateVersion,
  saveCommunicationTemplate,
  sendCommunicationTest,
} from "./admin.js";
export {
  beginOrganizationA2pBrandInquiry,
  beginOrganizationA2pCampaignInquiry,
  configureOrganizationAlphaSender,
  configureOrganizationEmailDomain,
  configureOrganizationInboundEmail,
  configureOrganizationLinkDomain,
  getBrandedCommunicationInfrastructureAdmin,
  provisionOrganizationSmsNumber,
  refreshOrganizationA2pCampaignStatus,
  saveOrganizationA2pRegistrationDraft,
  validateOrganizationEmailDomain,
  validateOrganizationInboundEmail,
  validateOrganizationLinkDomain,
} from "./branded-admin.js";
export { sendGridEventWebhook } from "./webhook.js";
export { sendGridInboundEmail } from "./inbound-email.js";
export { twilioInboundSms, twilioMessageStatus } from "./sms-webhook.js";
export { dispatchEmail, type DispatchEmailCommand, type DispatchEmailPrerequisites } from "./service.js";
export { getSendGridEmailAdapter, SendGridEmailAdapter } from "./sendgrid-adapter.js";
export { getTwilioSmsAdapter, TwilioSmsAdapter } from "./twilio-adapter.js";
export {
  adaptCurrentConsent,
  createAcquisitionEmailDispatchAdapter,
  mapEligibilityForAcquisition,
  requireApprovedCommunicationTemplateId,
  type CurrentCommunicationConsentFact,
  type CurrentCommunicationContext,
  type CurrentCommunicationContextPort,
} from "./acquisition-dispatch.js";
export { getEffectiveEmailSuppression, recordOrganizationMarketingSuppression } from "./suppression.js";
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
