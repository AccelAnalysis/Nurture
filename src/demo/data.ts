import type { Organization, OrganizationMembership, UserProfile } from '../domain/identity';
import type { ExperienceContact } from '../domain/lifecycle';
import type { ContactSequence, MessageTemplate, Survey } from '../domain/outreach';
import type { Offer, Referral } from '../domain/commerce';
import type { Feedback, AppNotification } from '../domain/feedback';
export const DEMO_ORG = 'demo-org';
const date = '2026-09-04T12:00:00.000Z';
const audit = { createdAt: date, updatedAt: date };
export const demoOrganization: Organization = {
  id: DEMO_ORG,
  name: 'Nurture Demo Organization',
  slug: 'nurture-demo',
  logo: null,
  description: 'A fictional organization for exploring the complete customer journey.',
  website: '',
  status: 'active',
  ownerId: 'demo-owner',
  ...audit,
  settings: {
    timeZone: 'America/New_York',
    quietHoursStart: '20:00',
    quietHoursEnd: '09:00',
    dailyContactLimit: 2,
  },
  referralConfiguration: {
    enabled: false,
    qualifyingEvent: 'subscription',
    rewardType: 'credit',
    rewardValue: 0,
  },
};
export const demoMembers: OrganizationMembership[] = [
  ['demo-owner', 'Alex Morgan', 'owner'],
  ['demo-administrator', 'Sam Rivera', 'administrator'],
  ['demo-manager', 'Taylor Chen', 'manager'],
  ['demo-member', 'Jordan Ellis', 'member'],
].map(([userId, displayName, role]) => ({
  id: `${DEMO_ORG}_${userId}`,
  organizationId: DEMO_ORG,
  userId,
  displayName,
  role: role as OrganizationMembership['role'],
  status: 'active',
  invitedBy: null,
  invitedAt: null,
  joinedAt: date,
}));
export const demoProfiles = new Map<string, UserProfile>();
export function makeDemoProfile(
  uid: string,
  displayName = 'Nurture Explorer',
  email = 'explorer@example.test',
): UserProfile {
  return {
    uid,
    email,
    displayName,
    firstName: displayName.split(' ')[0],
    lastName: displayName.split(' ').slice(1).join(' '),
    photoURL: null,
    phone: null,
    status: 'active',
    ...audit,
    onboardingStatus: 'complete',
    defaultOrganizationId: demoMembers.some((m) => m.userId === uid) ? DEMO_ORG : null,
    preferences: {
      theme: 'system',
      timeZone: 'America/New_York',
      emailMarketing: false,
      smsMarketing: false,
      inAppNotifications: true,
    },
  };
}
export const demoContacts: ExperienceContact[] = [
  ['c-avery', 'Avery Brooks', 'advocate', 7, 'experience'],
  ['c-cameron', 'Cameron Lee', 'participated', 4, 'experience'],
  ['c-morgan', 'Morgan Reed', 'engaged', 5, 'referral'],
  ['c-riley', 'Riley Parker', 'invited', 3, 'manual'],
  ['c-quinn', 'Quinn Hayes', 'retained', 6, 'experience'],
  ['c-drew', 'Drew Lane', 'optedOut', 5, 'import'],
].map(([id, name, status, stage, source], i) => ({
  id: String(id),
  organizationId: DEMO_ORG,
  linkedUserId: null,
  name: String(name),
  email: `${String(name).toLowerCase().replace(' ', '.')}@example.test`,
  phone: '',
  status: status as ExperienceContact['status'],
  stage: stage as ExperienceContact['stage'],
  source: source as ExperienceContact['source'],
  tags: i % 2 ? ['First experience'] : ['Community'],
  consent: [
    {
      channel: 'email',
      purpose: 'marketing',
      state: status === 'optedOut' ? 'withdrawn' : i % 2 ? 'unknown' : 'granted',
      capturedAt: date,
      source: 'Fictional demonstration',
      policyVersion: 'demo',
    },
  ],
  referralSource: source === 'referral' ? 'NURTURE-DEMO' : null,
  participation:
    i < 3
      ? [
          {
            experienceId: 'welcome',
            experienceName: 'Welcome experience',
            status: 'completed',
            startedAt: date,
            completedAt: date,
          },
        ]
      : [],
  communicationHistory:
    i < 3
      ? [
          {
            id: `msg-${i}`,
            channel: 'email',
            subject: 'Thank you for joining us',
            status: 'delivered',
            occurredAt: date,
          },
        ]
      : [],
  lastContactAt: i < 3 ? date : null,
  nextContactAt: i === 1 || i === 2 ? '2026-09-06T14:00:00.000Z' : null,
  ...audit,
}));
export const demoSequence: ContactSequence = {
  id: 'post-experience',
  organizationId: DEMO_ORG,
  name: 'After the experience',
  trigger: 'experienceCompleted',
  status: 'draft',
  enabled: false,
  ...audit,
  timeZone: 'America/New_York',
  quietHours: { start: '20:00', end: '09:00' },
  frequencyCapPerDay: 2,
  stopOnConversion: true,
  version: 1,
  steps: [
    {
      id: 'step-1',
      kind: 'email',
      name: 'A personal thank-you',
      delayDays: 0,
      templateId: 'template-thankYou',
      consentPurpose: 'service',
    },
    {
      id: 'step-2',
      kind: 'survey',
      name: 'Ask about the experience',
      delayDays: 2,
      templateId: 'template-survey',
      surveyId: 'demo-survey',
      consentPurpose: 'service',
      skipIf: 'surveyCompleted',
    },
    {
      id: 'step-3',
      kind: 'email',
      name: 'Share the next useful resource',
      delayDays: 7,
      templateId: 'template-followUp',
      consentPurpose: 'marketing',
    },
    {
      id: 'step-4',
      kind: 'offer',
      name: 'Introduce a relevant offer',
      delayDays: 21,
      templateId: 'template-offer',
      offerId: 'continuity',
      consentPurpose: 'marketing',
      skipIf: 'converted',
    },
    {
      id: 'step-5',
      kind: 'referral',
      name: 'Invite someone new',
      delayDays: 45,
      templateId: 'template-referral',
      consentPurpose: 'marketing',
      skipIf: 'optedOut',
    },
  ],
};
const templateSpecs: [MessageTemplate['type'], string, string, string][] = [
  [
    'welcome',
    'Welcome',
    'Welcome to {{organization_name}}',
    'Hi {{first_name}}, welcome. Your experience is ready: {{experience_url}}',
  ],
  [
    'registration',
    'Registration',
    'Your Nurture account',
    'Hi {{first_name}}, continue setting up your profile: {{account_url}}',
  ],
  [
    'invitation',
    'Organization invitation',
    'You are invited to {{organization_name}}',
    '{{inviter_name}} invited you to join {{organization_name}}. Accept: {{invitation_url}}',
  ],
  [
    'thankYou',
    'Experience thank-you',
    'Thank you for joining us',
    'Hi {{first_name}}, thank you for taking part in {{experience_name}}. We are glad you joined us.',
  ],
  [
    'survey',
    'Survey request',
    'How was your experience?',
    'Hi {{first_name}}, share your feedback about {{experience_name}}: {{survey_url}}',
  ],
  [
    'followUp',
    'A useful follow-up',
    'A next step for you',
    'Hi {{first_name}}, here is a resource to continue your experience: {{experience_url}}',
  ],
  [
    'offer',
    'Next experience',
    'Explore your next experience',
    'Hi {{first_name}}, learn about {{offer_name}}: {{offer_url}}',
  ],
  [
    'upgrade',
    'Upgrade invitation',
    'More ways to continue',
    'Hi {{first_name}}, explore the options for continuing: {{offer_url}}',
  ],
  [
    'winBack',
    'Reconnect',
    'Welcome back, whenever you are ready',
    'Hi {{first_name}}, pick up where you left off: {{experience_url}}',
  ],
  [
    'referral',
    'Referral request',
    'Know someone who might benefit?',
    'Hi {{first_name}}, share an introduction to {{organization_name}}: {{referral_url}}',
  ],
];
export const demoTemplates: MessageTemplate[] = templateSpecs.map(([type, name, subject, body]) => ({
  id: `template-${type}`,
  organizationId: DEMO_ORG,
  name,
  type,
  channel: 'email',
  subject,
  body,
  variables: [...new Set(`${subject} ${body}`.match(/\{\{[a-z_]+\}\}/g) ?? [])],
  status: 'draft',
  version: 1,
  ...audit,
}));
demoTemplates.push({
  id: 'template-sms-followup',
  organizationId: DEMO_ORG,
  name: 'SMS follow-up',
  type: 'followUp',
  channel: 'sms',
  subject: '',
  body: '{{organization_name}}: Hi {{first_name}}, your next resource is ready: {{experience_url}}',
  variables: ['{{organization_name}}', '{{first_name}}', '{{experience_url}}'],
  status: 'draft',
  version: 1,
  ...audit,
});
export const demoSurvey: Survey = {
  id: 'demo-survey',
  organizationId: DEMO_ORG,
  title: 'Tell us about your experience',
  description: 'A few thoughtful questions to help us make the next experience better.',
  status: 'published',
  visibility: 'public',
  version: 1,
  completionMessage: 'Thank you. Your perspective helps shape what comes next.',
  ...audit,
  questions: [
    { id: 'q1', type: 'rating', title: 'How was your overall experience?', required: true, options: [] },
    {
      id: 'q2',
      type: 'nps',
      title: 'How likely are you to recommend this experience?',
      required: false,
      options: [],
    },
    { id: 'q3', type: 'longText', title: 'What could we do better?', required: false, options: [] },
    {
      id: 'q4',
      type: 'singleChoice',
      title: 'What would you like to explore next?',
      required: false,
      options: ['Another experience', 'Useful resources', 'A conversation', 'Nothing right now'],
    },
  ],
};
export const demoOffers: Offer[] = [
  {
    id: 'welcome',
    organizationId: DEMO_ORG,
    name: 'A first experience',
    description: 'Get a feel for Nurture before creating an account.',
    type: 'free',
    status: 'published',
    visibility: 'public',
    amountMinor: 0,
    currency: 'USD',
    interval: null,
    trialDays: null,
    entitlements: ['public-experience'],
    stripePriceId: null,
    ...audit,
  },
  {
    id: 'continuity',
    organizationId: DEMO_ORG,
    name: 'Keep growing',
    description: 'An illustrative recurring offer for continued experiences.',
    type: 'subscription',
    status: 'published',
    visibility: 'public',
    amountMinor: 1900,
    currency: 'USD',
    interval: 'month',
    trialDays: 14,
    entitlements: ['primary', 'secondary'],
    stripePriceId: null,
    ...audit,
  },
];
export const demoReferrals: Referral[] = [
  {
    id: 'referral-1',
    referralCode: 'NURTURE-DEMO',
    referringUserId: 'demo-owner',
    referringOrganizationId: DEMO_ORG,
    referredUserId: null,
    source: 'experience',
    campaign: 'welcome',
    status: 'registered',
    createdAt: date,
    convertedAt: null,
  },
];
export const demoFeedback: Feedback[] = [
  {
    id: 'feedback-1',
    organizationId: DEMO_ORG,
    userId: 'demo-member',
    category: 'idea',
    message: 'It would be helpful to save a resource for later.',
    attachmentName: null,
    attachmentStoragePath: null,
    currentScreen: '/app/secondary',
    appVersion: '0.2.0-skeleton',
    deviceMetadata: null,
    status: 'new',
    ...audit,
  },
];
export const demoNotifications: AppNotification[] = [
  {
    id: 'notice-1',
    userId: 'demo-owner',
    title: 'Your next experience is ready',
    message: 'Explore the secondary experience container.',
    href: '/app/secondary',
    createdAt: date,
    readAt: null,
  },
];
