import { lazy } from 'react';
export const HomePage = lazy(() =>
  import('../pages/PublicPages').then((module) => ({ default: module.HomePage })),
);
export const FeaturesPage = lazy(() =>
  import('../pages/PublicPages').then((module) => ({ default: module.FeaturesPage })),
);
export const HowItWorksPage = lazy(() =>
  import('../pages/PublicPages').then((module) => ({ default: module.HowItWorksPage })),
);
export const AboutPage = lazy(() =>
  import('../pages/PublicPages').then((module) => ({ default: module.AboutPage })),
);
export const HelpPage = lazy(() =>
  import('../pages/PublicPages').then((module) => ({ default: module.HelpPage })),
);
export const ContactPage = lazy(() =>
  import('../pages/PublicPages').then((module) => ({ default: module.ContactPage })),
);
export const TrustPage = lazy(() =>
  import('../pages/PublicPages').then((module) => ({ default: module.TrustPage })),
);
export const PublicPreferencesPage = lazy(() =>
  import('../pages/PublicPages').then((module) => ({ default: module.PublicPreferencesPage })),
);
export const OffersPage = lazy(() =>
  import('../pages/OfferPages').then((module) => ({ default: module.OffersPage })),
);
export const OfferDetailPage = lazy(() =>
  import('../pages/OfferPages').then((module) => ({ default: module.OfferDetailPage })),
);
export const AuthPage = lazy(() =>
  import('../pages/AuthPages').then((module) => ({ default: module.AuthPage })),
);
export const VerifyEmailPage = lazy(() =>
  import('../pages/AuthPages').then((module) => ({ default: module.VerifyEmailPage })),
);
export const InvitationPage = lazy(() =>
  import('../pages/AuthPages').then((module) => ({ default: module.InvitationPage })),
);
export const OnboardingPage = lazy(() =>
  import('../pages/AuthPages').then((module) => ({ default: module.OnboardingPage })),
);
export const CreateOrganizationPage = lazy(() =>
  import('../pages/AuthPages').then((module) => ({ default: module.CreateOrganizationPage })),
);
export const CustomerHomePage = lazy(() =>
  import('../pages/CustomerPages').then((module) => ({ default: module.CustomerHomePage })),
);
export const FeedbackPage = lazy(() =>
  import('../pages/CustomerPages').then((module) => ({ default: module.FeedbackPage })),
);
export const ProfilePage = lazy(() =>
  import('../pages/CustomerPages').then((module) => ({ default: module.ProfilePage })),
);
export const AccountPage = lazy(() =>
  import('../pages/CustomerPages').then((module) => ({ default: module.AccountPage })),
);
export const NotificationsPage = lazy(() =>
  import('../pages/CustomerPages').then((module) => ({ default: module.NotificationsPage })),
);
export const BillingPage = lazy(() =>
  import('../pages/CustomerPages').then((module) => ({ default: module.BillingPage })),
);
export const ReferralsPage = lazy(() =>
  import('../pages/CustomerPages').then((module) => ({ default: module.ReferralsPage })),
);
export const ExperiencePage = lazy(() =>
  import('../pages/ExperiencePages').then((module) => ({ default: module.ExperiencePage })),
);
export const ReferralEntryPage = lazy(() =>
  import('../pages/ReferralEntryPage').then((module) => ({ default: module.ReferralEntryPage })),
);
export const DemoPage = lazy(() =>
  import('../pages/DemoPage').then((module) => ({ default: module.DemoPage })),
);
export const NotFoundPage = lazy(() =>
  import('../pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
);
export const OrganizationOverviewPage = lazy(() =>
  import('../pages/org/OverviewPages').then((module) => ({ default: module.OrganizationOverviewPage })),
);
export const LifecyclePage = lazy(() =>
  import('../pages/org/OverviewPages').then((module) => ({ default: module.LifecyclePage })),
);
export const AnalyticsPage = lazy(() =>
  import('../pages/org/OverviewPages').then((module) => ({ default: module.AnalyticsPage })),
);
export const ContactsPage = lazy(() =>
  import('../pages/org/ContactPages').then((module) => ({ default: module.ContactsPage })),
);
export const ContactDetailPage = lazy(() =>
  import('../pages/org/ContactPages').then((module) => ({ default: module.ContactDetailPage })),
);
export const ContactEditorPage = lazy(() =>
  import('../pages/org/ContactPages').then((module) => ({ default: module.ContactEditorPage })),
);
export const ContactImportPage = lazy(() =>
  import('../pages/org/ContactPages').then((module) => ({ default: module.ContactImportPage })),
);
export const SequencesPage = lazy(() =>
  import('../pages/org/SequencePages').then((module) => ({ default: module.SequencesPage })),
);
export const SequenceEditorPage = lazy(() =>
  import('../pages/org/SequencePages').then((module) => ({ default: module.SequenceEditorPage })),
);
export const TemplatesPage = lazy(() =>
  import('../pages/org/TemplatePages').then((module) => ({ default: module.TemplatesPage })),
);
export const TemplateEditorPage = lazy(() =>
  import('../pages/org/TemplatePages').then((module) => ({ default: module.TemplateEditorPage })),
);
export const SurveysPage = lazy(() =>
  import('../pages/org/SurveyPages').then((module) => ({ default: module.SurveysPage })),
);
export const SurveyEditorPage = lazy(() =>
  import('../pages/org/SurveyPages').then((module) => ({ default: module.SurveyEditorPage })),
);
export const SurveyPreviewPage = lazy(() =>
  import('../pages/org/SurveyPages').then((module) => ({ default: module.SurveyPreviewPage })),
);
export const SurveyResultsPage = lazy(() =>
  import('../pages/org/SurveyPages').then((module) => ({ default: module.SurveyResultsPage })),
);
export const MembersPage = lazy(() =>
  import('../pages/org/ManagePages').then((module) => ({ default: module.MembersPage })),
);
export const InvitationsPage = lazy(() =>
  import('../pages/org/ManagePages').then((module) => ({ default: module.InvitationsPage })),
);
export const InviteUserPage = lazy(() =>
  import('../pages/org/ManagePages').then((module) => ({ default: module.InviteUserPage })),
);
export const RolesPage = lazy(() =>
  import('../pages/org/ManagePages').then((module) => ({ default: module.RolesPage })),
);
export const OrganizationProfilePage = lazy(() =>
  import('../pages/org/ManagePages').then((module) => ({ default: module.OrganizationProfilePage })),
);
export const OrganizationOffersPage = lazy(() =>
  import('../pages/org/CommercePages').then((module) => ({ default: module.OrganizationOffersPage })),
);
export const OfferEditorPage = lazy(() =>
  import('../pages/org/CommercePages').then((module) => ({ default: module.OfferEditorPage })),
);
export const OrganizationReferralsPage = lazy(() =>
  import('../pages/org/CommercePages').then((module) => ({ default: module.OrganizationReferralsPage })),
);
export const FeedbackReviewPage = lazy(() =>
  import('../pages/org/FeedbackReviewPage').then((module) => ({ default: module.FeedbackReviewPage })),
);
