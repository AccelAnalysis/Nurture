import type {
  CommunicationPurpose,
  CommunicationTemplateId,
  CommunicationVariableValues,
  EmailTemplateContent,
} from "./contracts.js";

export const NURTURE_COMMUNICATION_DEFAULT_VERSION = "r2.2026-09-05";

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
};

export function getDefaultCommunicationTemplate(id: CommunicationTemplateId): DefaultCommunicationTemplate {
  return defaults[id];
}

export function listDefaultCommunicationTemplates(): DefaultCommunicationTemplate[] {
  return Object.values(defaults);
}
