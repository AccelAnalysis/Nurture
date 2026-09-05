import { useEffect, type ReactNode } from "react";
import { OrganizationShell, ParticipantShell, PlatformAdminShell, PublicShell } from "../../components/shells";
import { EmptyState, LoadingState } from "../../components/ui";
import { useOrganization } from "../../context/OrganizationContext";
import { usePlatform } from "../../context/PlatformContext";
import { OrganizationOffersPage, ParticipantBillingPage, ParticipantOffersPage, PublicOffersPage, PublicOfferDetail } from "../../features/billing/pages";
import { CommunicationsAdminPage } from "../../features/communications";
import { BrandSiteAdminPage } from "../../features/configuration/BrandSiteAdminPage";
import { ConfiguredPublicHome } from "../../features/configuration/ConfiguredPublicHome";
import { PublicOrganizationScope } from "../../features/configuration/ConfigurationProvider";
import { CustomerWorkspaceDetailPage, CustomerWorkspaceListPage } from "../../features/customer-workspace";
import { ExperienceHost } from "../../features/experience/ExperienceHost";
import { AuthenticatedRoute, IdentityRouteBoundary, isIdentityRoute, OnboardingCompleteRoute } from "../../features/identity/IdentityBoundary";
import { useAuth } from "../../features/identity/auth";
import { LifecycleConfigurationPage } from "../../features/lifecycle-admin";
import { OnboardingRouteBoundary } from "../../features/onboarding/OnboardingBoundary";
import { OrganizationAdminRoute } from "../../features/organization/OrganizationAdminRoute";
import { ParticipantStateView } from "../../features/participant/ParticipantStateView";
import { PlatformAdminRoute } from "../../features/platform/PlatformAdminRoute";
import { RetentionLifecycleStudioPage } from "../../features/retention-admin";
import { CustomerPage } from "../../pages/AppPages";
import { AddContact, ContactDetail, OrganizationPage } from "../../pages/OrgPages";
import { PlatformPage } from "../../pages/PlatformPages";
import { PublicInfoPage, PublicSurvey, ReferralLanding } from "../../pages/PublicPages";
import { navigate, useRoute } from "../../router";
import { organizationSectionCapability, platformSectionCapability } from "../../security/authorization";

const publicInfoRoutes = ["/features", "/how-it-works", "/about", "/help", "/contact", "/privacy", "/terms"];
const participantRoutes = new Set([
  "/app",
  "/app/offers",
  "/app/notifications",
  "/app/feedback",
  "/app/referrals",
  "/app/account",
  "/app/profile",
  "/app/settings",
  "/app/billing",
  "/app/help",
]);

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, true), [to]);
  return <LoadingState label="Opening destination…" />;
}

function AuthenticatedParticipant({ children }: { children: ReactNode }) {
  const { currentUser, isDemo, signOut } = useAuth();
  const { currentOrganizationId, can } = useOrganization();
  const platform = usePlatform();
  const organizationAdminHref = currentOrganizationId && can("workspace.view", currentOrganizationId)
    ? `/org/${currentOrganizationId}/admin/dashboard`
    : undefined;
  const platformAdminHref = platform.can("platform.view") ? "/platform" : undefined;
  const logout = async () => {
    platform.clearDemo();
    await signOut();
    navigate("/");
  };

  return (
    <ParticipantShell
      mode="authenticated"
      displayName={currentUser?.displayName ?? currentUser?.email}
      organizationAdminHref={organizationAdminHref}
      platformAdminHref={platformAdminHref}
      demo={isDemo}
      onSignOut={logout}
    >
      {children}
    </ParticipantShell>
  );
}

function PlatformSurface({ section }: { section: string }) {
  const platform = usePlatform();
  return <PlatformAdminShell role={platform.role} can={platform.can}><PlatformPage section={section} /></PlatformAdminShell>;
}

function LifecycleAdminSurface({ organizationId, runs }: { organizationId: string; runs: boolean }) {
  const organization = useOrganization();
  return (
    <LifecycleConfigurationPage
      organizationId={organizationId}
      canManage={organization.can("lifecycle.manage", organizationId)}
      initialTab={runs ? "Run history" : "Configuration"}
    />
  );
}

function RetentionAdminSurface({ organizationId }: { organizationId: string }) {
  const organization = useOrganization();
  return <RetentionLifecycleStudioPage organizationId={organizationId} canPublish={organization.can("lifecycle.manage", organizationId)} canOperate={organization.can("lifecycle.manage", organizationId)} />;
}

function OrganizationLifecycleContent({ organizationId, section, detail }: { organizationId: string; section: string; detail?: string }) {
  if (section === "customers") {
    return detail
      ? <CustomerWorkspaceDetailPage organizationId={organizationId} customerId={detail} />
      : <CustomerWorkspaceListPage organizationId={organizationId} />;
  }
  if (section === "lifecycle") {
    if (detail === "retention") return <RetentionAdminSurface organizationId={organizationId} />;
    return <LifecycleAdminSurface organizationId={organizationId} runs={detail === "runs"} />;
  }
  if (section === "communications") return <CommunicationsAdminPage organizationId={organizationId} />;
  return null;
}

export function AppRouter() {
  const route = useRoute();
  const [first, second, third, fourth, fifth] = route.segments;

  if (route.path === "/") return <PublicShell><ConfiguredPublicHome /></PublicShell>;
  if (publicInfoRoutes.includes(route.path)) return <PublicShell><PublicInfoPage path={route.path} /></PublicShell>;
  if (route.path === "/offers") return <PublicShell><PublicOrganizationScope>{(organizationId) => <PublicOffersPage organizationId={organizationId} />}</PublicOrganizationScope></PublicShell>;
  if (first === "offers" && second) return <PublicShell><PublicOrganizationScope>{(organizationId) => <PublicOfferDetail organizationId={organizationId} offerId={second} />}</PublicOrganizationScope></PublicShell>;
  if (first === "experience") {
    return (
      <ParticipantShell mode="public">
        <ExperienceHost slot="primary" accessMode="public" relativePath={route.segments.slice(1).join("/")} />
      </ParticipantShell>
    );
  }
  if (first === "r" && second) return <PublicShell><ReferralLanding code={second} /></PublicShell>;
  if (first === "survey" && second) return <PublicShell><PublicSurvey surveyId={second} /></PublicShell>;

  if (isIdentityRoute(route)) return <IdentityRouteBoundary route={route} />;
  if (first === "onboarding") return <OnboardingRouteBoundary step={second} />;

  if (first === "app") {
    const participantContent = second === "experience"
      ? <ExperienceHost slot="primary" accessMode="authenticated" relativePath={route.segments.slice(2).join("/")} />
      : second === "secondary"
        ? <ExperienceHost slot="secondary" accessMode="authenticated" relativePath={route.segments.slice(2).join("/")} />
        : route.path === "/app/offers" ? <ParticipantOffersPage />
        : route.path === "/app/billing" ? <ParticipantBillingPage />
        : participantRoutes.has(route.path)
          ? <CustomerPage path={route.path} />
          : <ParticipantStateView state="unavailable" title="Participant destination unavailable" description="This /app route is not registered with the participant application skeleton." />;

    return (
      <AuthenticatedRoute>
        {["/app/offers", "/app/billing"].includes(route.path) ? <AuthenticatedParticipant>{participantContent}</AuthenticatedParticipant> : <OnboardingCompleteRoute><AuthenticatedParticipant>{participantContent}</AuthenticatedParticipant></OnboardingCompleteRoute>}
      </AuthenticatedRoute>
    );
  }

  if (first === "org" && second) {
    const organizationId = second;
    if (third !== "admin") {
      const legacySuffix = route.path.slice(`/org/${organizationId}`.length);
      return <Redirect to={`/org/${organizationId}/admin${legacySuffix}`} />;
    }

    const section = fourth || "overview";
    if (["brand", "site", "configuration"].includes(section)) return <Redirect to={`/org/${organizationId}/admin/brand-site`} />;
    const detail = fifth;
    const capability = section === "brand-site" ? "brand.view" : organizationSectionCapability[section] ?? "workspace.view";
    const lifecycleContent = OrganizationLifecycleContent({ organizationId, section, detail });
    const content = lifecycleContent ?? (section === "brand-site" ? <BrandSiteAdminPage key={organizationId} organizationId={organizationId} />
      : section === "offers" ? <OrganizationOffersPage organizationId={organizationId} />
      : section === "contacts" && detail === "new"
      ? <AddContact organizationId={organizationId} />
      : section === "contacts" && detail
        ? <ContactDetail organizationId={organizationId} contactId={detail} />
        : <OrganizationPage organizationId={organizationId} section={section} />);
    const effectiveCapability = section === "contacts" && detail === "new" ? "contacts.manage" : capability;

    return (
      <OrganizationAdminRoute organizationId={organizationId} capability={effectiveCapability}>
        <OrganizationShell organizationId={organizationId}>{content}</OrganizationShell>
      </OrganizationAdminRoute>
    );
  }

  if (first === "platform") {
    const section = second || "overview";
    const capability = platformSectionCapability[section] ?? "platform.view";
    return <PlatformAdminRoute capability={capability}><PlatformSurface section={section} /></PlatformAdminRoute>;
  }

  return <PublicShell><section className="content-width page-section"><EmptyState title="Page not found" description="This route is not part of the Nurture skeleton." /></section></PublicShell>;
}
