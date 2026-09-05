import type {
  CommunicationPurpose,
  CommunicationTemplateId,
  CommunicationVariableValues,
  EmailTemplateContent,
} from "./contracts.js";

export const NURTURE_COMMUNICATION_DEFAULT_VERSION = "r4.2026-09-05";

export interface DefaultCommunicationTemplate {
  id: CommunicationTemplateId;
  purpose: CommunicationPurpose;
  version: string;
  content: EmailTemplateContent;
}

const defaults: Record<CommunicationTemplateId, DefaultCommunicationTemplate> = {
  "registration-welcome": {
    id: "registration-welcome",
    purpose: "transactional",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Registration welcome",
      subject: "Welcome to {{organization.name}}",
      body: "Hi {{customer.firstName}},\n\nYour account with {{organization.name}} is ready. Continue here: {{application.publicUrl}}\n\nSupport: {{support.email}}",
      variables: ["customer.firstName", "organization.name", "application.publicUrl", "support.email"],
    },
  },
  "onboarding-reminder": {
    id: "onboarding-reminder",
    purpose: "transactional",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Onboarding reminder",
      subject: "Continue your {{organization.name}} setup",
      body: "Hi {{customer.firstName}},\n\nYour setup is still in progress. Resume where you left off: {{onboarding.resumeUrl}}\n\nSupport: {{support.email}}",
      variables: ["customer.firstName", "organization.name", "onboarding.resumeUrl", "support.email"],
    },
  },
  "lead-follow-up": {
    id: "lead-follow-up",
    purpose: "marketing",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Lead follow-up",
      subject: "Continue with {{organization.name}}",
      body: "Hi {{lead.firstName}},\n\nThanks for your interest in {{organization.name}}. You can continue here: {{application.publicUrl}}\n\nManage promotional email preferences: {{preferences.url}}",
      variables: ["lead.firstName", "organization.name", "application.publicUrl", "preferences.url"],
    },
  },
  "activation-invitation": {
    id: "activation-invitation",
    purpose: "marketing",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Activation invitation",
      subject: "Start {{experience.name}}",
      body: "Hi {{customer.firstName}},\n\nYour {{experience.name}} experience is available. Start here: {{experience.startUrl}}\n\nManage promotional email preferences: {{preferences.url}}",
      variables: ["customer.firstName", "experience.name", "experience.startUrl", "preferences.url"],
    },
  },
  "trial-conversion": {
    id: "trial-conversion",
    purpose: "marketing",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Trial conversion",
      subject: "Your {{experience.name}} trial ends {{trial.endDate}}",
      body: "Hi {{customer.firstName}},\n\nYour actual {{experience.name}} trial ends {{trial.endDate}}. Review {{offer.name}} here: {{offer.checkoutUrl}}\n\nManage promotional email preferences: {{preferences.url}}",
      variables: ["customer.firstName", "experience.name", "trial.endDate", "offer.name", "offer.checkoutUrl", "preferences.url"],
    },
  },
  "checkout-recovery": {
    id: "checkout-recovery",
    purpose: "marketing",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Checkout recovery",
      subject: "Finish reviewing {{offer.name}}",
      body: "Hi {{customer.firstName}},\n\nIf you still want {{offer.name}}, return to the current offer here: {{offer.checkoutUrl}}\n\nManage promotional email preferences: {{preferences.url}}",
      variables: ["customer.firstName", "offer.name", "offer.checkoutUrl", "preferences.url"],
    },
  },
  "survey-invitation": {
    id: "survey-invitation",
    purpose: "marketing",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Survey invitation",
      subject: "Share optional feedback with {{organization.name}}",
      body: "Hi {{customer.firstName}},\n\nIf you would like to share feedback, open {{survey.title}} here: {{survey.url}}\n\nYour participation is optional. Manage promotional email preferences: {{preferences.url}}",
      variables: ["customer.firstName", "organization.name", "survey.title", "survey.url", "preferences.url"],
    },
  },
  "survey-reminder": {
    id: "survey-reminder",
    purpose: "marketing",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Survey reminder",
      subject: "Optional feedback reminder from {{organization.name}}",
      body: "Hi {{customer.firstName}},\n\nThere is still time to share optional feedback: {{survey.url}}\n\nManage promotional email preferences: {{preferences.url}}",
      variables: ["customer.firstName", "organization.name", "survey.url", "preferences.url"],
    },
  },
  "survey-thanks": {
    id: "survey-thanks",
    purpose: "transactional",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Feedback acknowledgement",
      subject: "Thank you for your feedback",
      body: "Thank you. Your feedback was received. If you need help, contact {{support.email}}.",
      variables: ["support.email"],
    },
  },
  "feedback-recovery": {
    id: "feedback-recovery",
    purpose: "transactional",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Feedback service recovery",
      subject: "We would like to help",
      body: "Thank you for telling us about your experience. If you would like help, contact {{support.email}}. Sharing feedback does not affect your purchased access.",
      variables: ["support.email"],
    },
  },
  "referral-invitation": {
    id: "referral-invitation",
    purpose: "marketing",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Referral invitation",
      subject: "Invite someone to {{organization.name}}",
      body: "Hi {{customer.firstName}},\n\nIf you choose to share, review the current referral program and your link here: {{referral.centerUrl}}\n\nSharing is optional. Manage promotional email preferences: {{preferences.url}}",
      variables: ["customer.firstName", "organization.name", "referral.centerUrl", "preferences.url"],
    },
  },
  "referral-status": {
    id: "referral-status",
    purpose: "transactional",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Referral status",
      subject: "Your referral status changed",
      body: "Review the current status and applicable program terms here: {{referral.centerUrl}}",
      variables: ["referral.centerUrl"],
    },
  },
  "referral-reward-issued": {
    id: "referral-reward-issued",
    purpose: "transactional",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Referral benefit issued",
      subject: "Your referral benefit is ready",
      body: "Review your referral benefit and applicable program terms here: {{referral.centerUrl}}",
      variables: ["referral.centerUrl"],
    },
  },
  "referral-reward-reversed": {
    id: "referral-reward-reversed",
    purpose: "transactional",
    version: NURTURE_COMMUNICATION_DEFAULT_VERSION,
    content: {
      name: "Referral benefit adjusted",
      subject: "A referral benefit was adjusted",
      body: "Review the current referral status and applicable terms here: {{referral.centerUrl}}\n\nQuestions? {{support.email}}",
      variables: ["referral.centerUrl", "support.email"],
    },
  },
};

export const FICTIONAL_PREVIEW_VARIABLES: Required<CommunicationVariableValues> = {
  "organization.name": "Harbor & Pine",
  "customer.firstName": "Taylor",
  "customer.displayName": "Taylor Morgan",
  "lead.firstName": "Jordan",
  "experience.name": "Launch Planner",
  "experience.startUrl": "https://preview.nurture.test/experience/start",
  "onboarding.resumeUrl": "https://preview.nurture.test/onboarding/profile",
  "offer.name": "Growth Plan",
  "offer.checkoutUrl": "https://preview.nurture.test/offers/growth",
  "trial.endDate": "September 18",
  "application.publicUrl": "https://preview.nurture.test/",
  "preferences.url": "https://preview.nurture.test/preferences/email",
  "support.email": "support@example.test",
  "survey.title": "Experience feedback",
  "survey.url": "https://preview.nurture.test/survey#invitation=preview",
  "referral.centerUrl": "https://preview.nurture.test/app/referrals",
};

export function getDefaultCommunicationTemplate(id: CommunicationTemplateId): DefaultCommunicationTemplate {
  return defaults[id];
}

export function listDefaultCommunicationTemplates(): DefaultCommunicationTemplate[] {
  return Object.values(defaults);
}
