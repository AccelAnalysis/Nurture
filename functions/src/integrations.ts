import type {
  AttributionPort,
  BillingPort,
  CommunicationPort,
  InvitationPort,
  SequenceSchedulerPort,
  SurveySubmissionPort,
  FeedbackUploadPort,
} from './contracts';
const unavailable = async (): Promise<never> => {
  throw new Error('Integration is not implemented. No external action was performed.');
};
// These placeholders deliberately accept no credentials and make no network calls.
// Future implementations use Firebase Functions Secret Manager bindings, never VITE_ env values.
export const sendGridAdapter: CommunicationPort = { send: unavailable };
export const twilioAdapter: CommunicationPort = { send: unavailable };
export const stripeAdapter: BillingPort = {
  createTestCheckout: unavailable,
  openPortal: unavailable,
  handleVerifiedWebhook: unavailable,
};
export const invitationAdapter: InvitationPort = { create: unavailable, accept: unavailable };
export const sequenceScheduler: SequenceSchedulerPort = {
  enroll: unavailable,
  dispatchDue: unavailable,
  stop: unavailable,
};
export const attributionAdapter: AttributionPort = { claim: unavailable, convert: unavailable };
export const surveySubmissionAdapter: SurveySubmissionPort = { submit: unavailable };
export const feedbackUploadAdapter: FeedbackUploadPort = { createUpload: unavailable };
