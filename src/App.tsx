import { AppShell, OrganizationShell, PublicShell } from "./components/shells";
import { AuthProvider } from "./context/AuthContext";
import { OrganizationProvider } from "./context/OrganizationContext";
import { AuthPage, InvitationPage } from "./pages/AuthPages";
import { CustomerPage } from "./pages/AppPages";
import { AddContact, ContactDetail, OrganizationPage } from "./pages/OrgPages";
import { MarketingHome, PublicExperience, PublicInfoPage, PublicOfferDetail, PublicOffersPage, PublicSurvey, ReferralLanding } from "./pages/PublicPages";
import { OrganizationProtected, Protected, useRoute } from "./router";
import { EmptyState } from "./components/ui";

function Routes() { const route = useRoute(); const [first, second, third, fourth] = route.segments;
  if (route.path === "/") return <PublicShell><MarketingHome /></PublicShell>;
  if (["/features", "/how-it-works", "/about", "/help", "/contact", "/privacy", "/terms"].includes(route.path)) return <PublicShell><PublicInfoPage path={route.path} /></PublicShell>;
  if (route.path === "/offers") return <PublicShell><PublicOffersPage /></PublicShell>;
  if (first === "offers" && second) return <PublicShell><PublicOfferDetail offerId={second} /></PublicShell>;
  if (route.path === "/experience") return <PublicShell><PublicExperience /></PublicShell>;
  if (first === "r" && second) return <PublicShell><ReferralLanding code={second} /></PublicShell>;
  if (first === "survey" && second) return <PublicShell><PublicSurvey surveyId={second} /></PublicShell>;
  if (route.path === "/login") return <AuthPage mode="login" />; if (route.path === "/register") return <AuthPage mode="register" />; if (route.path === "/forgot-password") return <AuthPage mode="forgot" />; if (route.path === "/verify-email") return <AuthPage mode="verify" />; if (first === "invite" && second) return <InvitationPage invitationId={second} />;
  if (first === "app") return <Protected><AppShell><CustomerPage path={route.path} /></AppShell></Protected>;
  if (first === "org" && second) { const organizationId = second; const section = third || "overview"; if (section === "contacts" && fourth === "new") return <OrganizationProtected><OrganizationShell organizationId={organizationId}><AddContact organizationId={organizationId} /></OrganizationShell></OrganizationProtected>; if (section === "contacts" && fourth) return <OrganizationProtected><OrganizationShell organizationId={organizationId}><ContactDetail organizationId={organizationId} contactId={fourth} /></OrganizationShell></OrganizationProtected>; return <OrganizationProtected><OrganizationShell organizationId={organizationId}><OrganizationPage organizationId={organizationId} section={section} /></OrganizationShell></OrganizationProtected>; }
  return <PublicShell><section className="content-width page-section"><EmptyState title="Page not found" description="This route is not part of the Nurture skeleton." /></section></PublicShell>;
}
export default function App() { return <AuthProvider><OrganizationProvider><Routes /></OrganizationProvider></AuthProvider>; }
