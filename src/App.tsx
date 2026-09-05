import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout';
import AppShell from './layouts/AppShell';
import { RequireAuth, RequireOrganization } from './app/guards';
import { RouteEffects } from './app/RouteEffects';
import { LoadingState } from './components/ui';
import * as Pages from './app/pages';
export default function App() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <RouteEffects />
      <Suspense fallback={<LoadingState label="Opening your next experience…" />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Pages.HomePage />} />
            <Route path="features" element={<Pages.FeaturesPage />} />
            <Route path="how-it-works" element={<Pages.HowItWorksPage />} />
            <Route path="offers" element={<Pages.OffersPage />} />
            <Route path="offers/:offerId" element={<Pages.OfferDetailPage />} />
            <Route path="experience" element={<Pages.ExperiencePage publicEntry />} />
            <Route path="about" element={<Pages.AboutPage />} />
            <Route path="help" element={<Pages.HelpPage />} />
            <Route path="contact" element={<Pages.ContactPage />} />
            <Route path="privacy" element={<Pages.TrustPage kind="privacy" />} />
            <Route path="terms" element={<Pages.TrustPage kind="terms" />} />
            <Route path="accessibility" element={<Pages.TrustPage kind="accessibility" />} />
            <Route path="preferences" element={<Pages.PublicPreferencesPage />} />
            <Route path="r/:referralCode" element={<Pages.ReferralEntryPage />} />
            <Route path="survey/:surveyId" element={<Pages.SurveyPreviewPage publicResponse />} />
            <Route path="login" element={<Pages.AuthPage mode="login" />} />
            <Route path="register" element={<Pages.AuthPage mode="register" />} />
            <Route path="forgot-password" element={<Pages.AuthPage mode="forgot" />} />
            <Route path="reset-password" element={<Pages.AuthPage mode="reset" />} />
            <Route path="verify-email" element={<Pages.VerifyEmailPage />} />
            <Route path="invite/:invitationId" element={<Pages.InvitationPage />} />
            <Route path="organizations/new" element={<Pages.CreateOrganizationPage />} />
            <Route path="demo" element={<Pages.DemoPage />} />
            <Route element={<RequireAuth />}>
              <Route path="onboarding" element={<Pages.OnboardingPage />} />
            </Route>
            <Route path="*" element={<Pages.NotFoundPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="app" element={<AppShell />}>
              <Route index element={<Pages.CustomerHomePage />} />
              <Route path="experience" element={<Pages.ExperiencePage />} />
              <Route path="secondary" element={<Pages.ExperiencePage secondary />} />
              <Route path="offers" element={<Pages.OffersPage customer />} />
              <Route path="upgrade" element={<Pages.OffersPage customer />} />
              <Route path="notifications" element={<Pages.NotificationsPage />} />
              <Route path="feedback" element={<Pages.FeedbackPage />} />
              <Route path="referrals" element={<Pages.ReferralsPage />} />
              <Route path="profile" element={<Pages.ProfilePage />} />
              <Route path="account" element={<Pages.AccountPage />} />
              <Route path="settings" element={<Pages.ProfilePage settings />} />
              <Route path="billing" element={<Pages.BillingPage />} />
              <Route path="help" element={<Pages.HelpPage />} />
              <Route path="*" element={<Pages.NotFoundPage />} />
            </Route>
            <Route element={<RequireOrganization />}>
              <Route path="org/:organizationId" element={<AppShell organization />}>
                <Route index element={<Pages.OrganizationOverviewPage />} />
                <Route path="dashboard" element={<Pages.OrganizationOverviewPage dashboard />} />
                <Route element={<RequireOrganization permission="people:manage" />}>
                  <Route path="contacts" element={<Pages.ContactsPage />} />
                  <Route path="contacts/new" element={<Pages.ContactEditorPage />} />
                  <Route path="contacts/import" element={<Pages.ContactImportPage />} />
                  <Route path="contacts/:contactId" element={<Pages.ContactDetailPage />} />
                  <Route path="contacts/:contactId/edit" element={<Pages.ContactEditorPage />} />
                  <Route path="lifecycle" element={<Pages.LifecyclePage />} />
                </Route>
                <Route element={<RequireOrganization permission="outreach:manage" />}>
                  <Route path="sequences" element={<Pages.SequencesPage />} />
                  <Route path="sequences/new" element={<Pages.SequenceEditorPage />} />
                  <Route path="sequences/:sequenceId" element={<Pages.SequenceEditorPage />} />
                  <Route path="templates" element={<Pages.TemplatesPage />} />
                  <Route path="templates/new" element={<Pages.TemplateEditorPage />} />
                  <Route path="templates/:templateId" element={<Pages.TemplateEditorPage />} />
                </Route>
                <Route element={<RequireOrganization permission="surveys:manage" />}>
                  <Route path="surveys" element={<Pages.SurveysPage />} />
                  <Route path="surveys/new" element={<Pages.SurveyEditorPage />} />
                  <Route path="surveys/:surveyId" element={<Pages.SurveyEditorPage />} />
                  <Route path="surveys/:surveyId/preview" element={<Pages.SurveyPreviewPage />} />
                  <Route path="surveys/:surveyId/results" element={<Pages.SurveyResultsPage />} />
                </Route>
                <Route element={<RequireOrganization permission="offers:manage" />}>
                  <Route path="offers" element={<Pages.OrganizationOffersPage />} />
                  <Route path="offers/new" element={<Pages.OfferEditorPage />} />
                  <Route path="offers/:offerId" element={<Pages.OfferEditorPage />} />
                </Route>
                <Route element={<RequireOrganization permission="insights:view" />}>
                  <Route path="analytics" element={<Pages.AnalyticsPage />} />
                </Route>
                <Route element={<RequireOrganization permission="feedback:review" />}>
                  <Route path="feedback" element={<Pages.FeedbackReviewPage />} />
                </Route>
                <Route element={<RequireOrganization permission="members:manage" />}>
                  <Route path="members" element={<Pages.MembersPage />} />
                  <Route path="invitations" element={<Pages.InvitationsPage />} />
                  <Route path="invitations/new" element={<Pages.InviteUserPage />} />
                  <Route path="roles" element={<Pages.RolesPage />} />
                </Route>
                <Route element={<RequireOrganization permission="organization:manage" />}>
                  <Route path="profile" element={<Pages.OrganizationProfilePage />} />
                  <Route path="settings" element={<Pages.OrganizationProfilePage settings />} />
                  <Route path="referrals" element={<Pages.OrganizationReferralsPage />} />
                </Route>
                <Route element={<RequireOrganization permission="billing:manage" />}>
                  <Route path="billing" element={<Pages.BillingPage organization />} />
                </Route>
                <Route path="*" element={<Pages.NotFoundPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
