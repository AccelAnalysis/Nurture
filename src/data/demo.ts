import type { ContactSequence, ExperienceContact, Feedback, MessageTemplate, NurtureUser, Offer, Organization, OrganizationInvitation, OrganizationMembership, Referral, Survey } from "../types/models";

export const DEMO_ORG_ID = "nurture-demo";
export const demoUser: NurtureUser = { uid: "demo-owner", email: "owner@example.test", displayName: "Jordan Lee", firstName: "Jordan", lastName: "Lee", status: "active", createdAt: "2026-08-01T12:00:00Z", updatedAt: "2026-09-04T12:00:00Z", onboardingStatus: "complete", defaultOrganizationId: DEMO_ORG_ID, preferences: { theme: "system", emailNotifications: true, smsNotifications: false, pushNotifications: true }, referralCode: "JORDAN-NURTURE", lastActiveAt: "2026-09-04T20:30:00Z" };
export const demoOrganization: Organization = { id: DEMO_ORG_ID, name: "Nurture Demo Organization", slug: "nurture-demo", description: "A safe development tenant used to review the full Nurture lifecycle.", website: "https://nurture.accelanalysis.com", status: "active", ownerId: demoUser.uid, createdAt: "2026-08-01T12:00:00Z", updatedAt: "2026-09-04T12:00:00Z", settings: { quietHoursStart: "20:00", quietHoursEnd: "08:00", frequencyCapPerDay: 2 }, referralConfiguration: { enabled: true, rewardType: "seat", rewardValue: 1 } };
export const demoMemberships: OrganizationMembership[] = [
  { organizationId: DEMO_ORG_ID, userId: "demo-owner", role: "owner", status: "active", joinedAt: "2026-08-01" },
  { organizationId: DEMO_ORG_ID, userId: "demo-admin", role: "administrator", status: "active", joinedAt: "2026-08-04" },
  { organizationId: DEMO_ORG_ID, userId: "demo-manager", role: "manager", status: "active", joinedAt: "2026-08-08" },
  { organizationId: DEMO_ORG_ID, userId: "demo-member", role: "member", status: "active", joinedAt: "2026-08-12" },
];
export const demoInvitations: OrganizationInvitation[] = [
  { id: "invite-1", organizationId: DEMO_ORG_ID, email: "alex@example.test", role: "manager", status: "pending", invitedBy: demoUser.uid, invitedAt: "2026-09-01", expiresAt: "2026-09-08" },
  { id: "invite-2", organizationId: DEMO_ORG_ID, email: "sam@example.test", role: "member", status: "accepted", invitedBy: demoUser.uid, invitedAt: "2026-08-20", expiresAt: "2026-08-27", acceptedAt: "2026-08-21" },
];
export const demoContacts: ExperienceContact[] = [
  { id: "contact-1", organizationId: DEMO_ORG_ID, firstName: "Maya", lastName: "Chen", email: "maya@example.test", status: "advocate", source: "Referral", tags: ["promoter", "primary-experience"], consent: { emailService: true, emailMarketing: true, smsService: false, smsMarketing: false }, referralSource: "JORDAN-NURTURE", participationHistory: [{ experienceId: "experience-core", experienceName: "Core Experience", status: "completed", completedAt: "2026-08-28" }], communicationHistory: [{ id: "comm-1", channel: "email", direction: "outbound", status: "delivered", summary: "Referral request", occurredAt: "2026-09-03" }], createdAt: "2026-08-20", updatedAt: "2026-09-03" },
  { id: "contact-2", organizationId: DEMO_ORG_ID, firstName: "Noah", lastName: "Williams", email: "noah@example.test", status: "follow-up", source: "Public trial", tags: ["trial"], consent: { emailService: true, emailMarketing: false, smsService: false, smsMarketing: false }, participationHistory: [{ experienceId: "experience-core", experienceName: "Core Experience", status: "completed", completedAt: "2026-09-02" }], communicationHistory: [], createdAt: "2026-09-01", updatedAt: "2026-09-02" },
  { id: "contact-3", organizationId: DEMO_ORG_ID, firstName: "Ava", lastName: "Patel", email: "ava@example.test", status: "converted", source: "Organization invite", tags: ["customer", "secondary"], consent: { emailService: true, emailMarketing: true, smsService: true, smsMarketing: false }, participationHistory: [{ experienceId: "experience-secondary", experienceName: "Secondary Experience", status: "started", startedAt: "2026-09-03" }], communicationHistory: [], createdAt: "2026-08-15", updatedAt: "2026-09-03" },
  { id: "contact-4", organizationId: DEMO_ORG_ID, firstName: "Liam", lastName: "Rivera", email: "liam@example.test", status: "invited", source: "Event import", tags: ["event"], consent: { emailService: true, emailMarketing: false, smsService: false, smsMarketing: false }, participationHistory: [], communicationHistory: [], createdAt: "2026-09-04", updatedAt: "2026-09-04" },
];
export const demoSequence: ContactSequence = { id: "sequence-1", organizationId: DEMO_ORG_ID, name: "Post-experience nurture", trigger: "experience-completed", status: "published", enabled: true, steps: [
  { id: "step-1", order: 1, type: "email", delayDays: 0, label: "Send thank-you" },
  { id: "step-2", order: 2, type: "survey", delayDays: 2, label: "Request feedback" },
  { id: "step-3", order: 3, type: "email", delayDays: 7, label: "Share follow-up resources" },
  { id: "step-4", order: 4, type: "offer", delayDays: 21, label: "Present continuation offer" },
  { id: "step-5", order: 5, type: "referral-request", delayDays: 45, label: "Request referral" },
], createdAt: "2026-08-12", updatedAt: "2026-09-01" };
export const demoTemplates: MessageTemplate[] = [
  { id: "tpl-1", organizationId: DEMO_ORG_ID, name: "Experience thank-you", type: "thank-you", channel: "email", subject: "Thank you for participating", body: "Hi {{first_name}}, thank you for completing {{experience_name}}.", variables: ["first_name", "experience_name"], status: "active", createdAt: "2026-08-12", updatedAt: "2026-09-01" },
  { id: "tpl-2", organizationId: DEMO_ORG_ID, name: "Survey request", type: "survey-request", channel: "email", subject: "How was your experience?", body: "We would appreciate your feedback.", variables: ["first_name", "survey_url"], status: "active", createdAt: "2026-08-12", updatedAt: "2026-09-01" },
  { id: "tpl-3", organizationId: DEMO_ORG_ID, name: "Referral request SMS", type: "referral-request", channel: "sms", body: "Know someone who could benefit? Share {{referral_url}}", variables: ["referral_url"], status: "draft", createdAt: "2026-08-20", updatedAt: "2026-09-02" },
];
export const demoSurvey: Survey = { id: "survey-1", organizationId: DEMO_ORG_ID, title: "Post-experience feedback", description: "Reusable feedback survey for completed experiences.", status: "published", completionMessage: "Thank you. Your feedback helps us improve.", questions: [
  { id: "q1", type: "rating", prompt: "How would you rate your overall experience?", required: true },
  { id: "q2", type: "nps", prompt: "How likely are you to recommend this experience?", required: true },
  { id: "q3", type: "long-text", prompt: "What was most valuable?", required: false },
  { id: "q4", type: "yes-no", prompt: "May we contact you about your feedback?", required: true },
] };
export const demoOffers: Offer[] = [
  { id: "offer-free", name: "Starter Experience", description: "A public entry point into the Nurture experience.", type: "free", status: "active", priceLabel: "Free", entitlements: ["Public experience", "Basic resources"] },
  { id: "offer-trial", organizationId: DEMO_ORG_ID, name: "Experience Trial", description: "Explore the full experience before choosing a recurring plan.", type: "trial", status: "active", priceLabel: "14-day trial", entitlements: ["Core experience", "Feedback tools"] },
  { id: "offer-sub", organizationId: DEMO_ORG_ID, name: "Nurture Plus", description: "Ongoing access to secondary experiences and organization benefits.", type: "subscription", status: "active", priceLabel: "$29 / month", entitlements: ["Secondary experience", "Priority resources", "Referral benefits"] },
];
export const demoReferrals: Referral[] = [
  { id: "ref-1", referralCode: "JORDAN-NURTURE", referringUserId: demoUser.uid, referringOrganizationId: DEMO_ORG_ID, source: "in-app", campaign: "post-experience", status: "converted", createdAt: "2026-08-25", convertedAt: "2026-09-01" },
  { id: "ref-2", referralCode: "NURTURE-DEMO", referringOrganizationId: DEMO_ORG_ID, source: "email", campaign: "advocate", status: "visited", createdAt: "2026-09-03" },
];
export const demoFeedback: Feedback[] = [{ id: "feedback-1", organizationId: DEMO_ORG_ID, userId: "demo-member", category: "experience", message: "The progress transition could be clearer.", currentScreen: "/app/experience", appVersion: "0.1.0", browserMetadata: "Demo browser", status: "reviewing", createdAt: "2026-09-03" }];
export const pipelineStages = [
  { number: 1, name: "Marketing", metric: "1,240", detail: "Visitors" }, { number: 2, name: "Offers", metric: "418", detail: "Offer views" }, { number: 3, name: "Registration", metric: "232", detail: "Accounts" }, { number: 4, name: "App Experience", metric: "196", detail: "Active" }, { number: 5, name: "Secondary", metric: "108", detail: "Continued" }, { number: 6, name: "Upsell", metric: "61", detail: "Converted" }, { number: 7, name: "Feedback + Referral", metric: "43", detail: "Advocates" },
];
