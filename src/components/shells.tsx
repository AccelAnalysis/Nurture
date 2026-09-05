import { useEffect, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useOrganization } from "../context/OrganizationContext";
import { applyPublicMetadata, trackPublicEvent } from "../features/public/publicBoundary";
import { Link, useRoute } from "../router";
import type { OrganizationCapability, PlatformCapability, PlatformRole } from "../security/authorization";
import { Avatar, Badge } from "./ui";

const publicLinks = [
  ["Features", "/features"],
  ["How it works", "/how-it-works"],
  ["Offers", "/offers"],
  ["Experience", "/experience"],
  ["About", "/about"],
  ["Help", "/help"],
  ["Contact", "/contact"],
] as const;

export function Brand() {
  return <Link className="brand" href="/"><img src="/brand/logo/nurture-n.svg" alt="" /><span>Nurture</span></Link>;
}

export function PublicShell({ children }: { children: ReactNode }) {
  const route = useRoute();
  useEffect(() => {
    applyPublicMetadata(route.path);
    trackPublicEvent("public_page_view");
  }, [route.path]);

  const captureHandoff = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a");
    const destination = link?.getAttribute("href");
    if (!destination || !destination.startsWith("/")) return;
    if (link?.classList.contains("button")) trackPublicEvent("public_primary_cta_selected", { destination });
    if (destination === "/experience") trackPublicEvent("public_trial_entry_handoff", { destination });
    else if (destination.startsWith("/offers")) trackPublicEvent("public_offer_handoff", { destination });
    else if (["/sign-in", "/register"].includes(destination)) trackPublicEvent("public_identity_handoff", { destination });
  };

  return (
    <div className="site-shell" onClickCapture={captureHandoff}>
      <header className="public-header content-width">
        <Brand />
        <nav aria-label="Primary">{publicLinks.slice(0, 4).map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>
        <div className="header-actions">
          <Link href="/sign-in">Sign In</Link>
          <Link className="button button-small" href="/register">Create Account</Link>
          <details className="mobile-public-menu">
            <summary aria-label="Open navigation">Menu</summary>
            <div>
              {publicLinks.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
              <Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link>
            </div>
          </details>
        </div>
      </header>
      <main>{children}</main>
      <footer className="public-footer">
        <div className="content-width footer-grid">
          <div><Brand /><p>One foundation for the entire customer lifecycle.</p></div>
          <div><h3>Product</h3>{publicLinks.slice(0, 4).map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</div>
          <div><h3>Company</h3>{publicLinks.slice(4).map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</div>
          <div><h3>Trust</h3><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/help">Support</Link></div>
          <div><h3>Account</h3><Link href="/sign-in">Sign In</Link><Link href="/register">Create Account</Link></div>
        </div>
      </footer>
    </div>
  );
}

const appNav = [
  ["Home", "/app"],
  ["Experience", "/app/experience"],
  ["Secondary", "/app/secondary"],
  ["Offers", "/app/offers"],
  ["Notifications", "/app/notifications"],
  ["Feedback", "/app/feedback"],
  ["Referrals", "/app/referrals"],
] as const;
const accountNav = [["Account", "/app/account"], ["Profile", "/app/profile"], ["Settings", "/app/settings"], ["Billing", "/app/billing"], ["Help", "/app/help"]] as const;
const mobileAppNav = [["Home", "/app"], ["Experience", "/app/experience"], ["Secondary", "/app/secondary"], ["Notifications", "/app/notifications"], ["Account", "/app/account"]] as const;
const trialNav = [["Experience", "/experience"], ["Offers", "/offers"], ["Create Account", "/register"]] as const;

export function ParticipantShell({
  children,
  mode,
  displayName,
  organizationAdminHref,
  platformAdminHref,
  demo = false,
  onSignOut,
}: {
  children: ReactNode;
  mode: "trial" | "authenticated";
  displayName?: string | null;
  organizationAdminHref?: string;
  platformAdminHref?: string;
  demo?: boolean;
  onSignOut?: () => void | Promise<void>;
}) {
  const route = useRoute();
  const authenticated = mode === "authenticated";
  return (
    <div className={`app-layout participant-layout participant-${mode}`}>
      <aside className="sidebar">
        <div><Brand />{demo ? <Badge tone="accent">Demo data</Badge> : null}{mode === "trial" ? <Badge tone="accent">Public trial</Badge> : null}</div>
        <nav aria-label="Participant application">
          {(authenticated ? appNav : trialNav).map(([label, href]) => <Link key={href} href={href} className={route.path === href ? "active" : ""}>{label}</Link>)}
        </nav>
        {authenticated ? (
          <nav aria-label="Account">
            {accountNav.map(([label, href]) => <Link key={href} href={href} className={route.path === href ? "active" : ""}>{label}</Link>)}
            {organizationAdminHref ? <Link href={organizationAdminHref}>Organization Admin</Link> : null}
            {platformAdminHref ? <Link href={platformAdminHref}>Platform Admin</Link> : null}
          </nav>
        ) : <Link href="/">← Back to marketing</Link>}
        {authenticated && onSignOut ? <button className="nav-button" onClick={() => void onSignOut()}>Sign Out</button> : null}
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <span className="muted">{authenticated ? "Nurture app" : "Nurture trial experience"}</span>
          {authenticated ? <Link className="user-chip" href="/app/account"><Avatar name={displayName ?? "User"} /><span>{displayName ?? "Account"}</span></Link> : <Link href="/register">Create account</Link>}
        </header>
        <main className="app-content">{children}</main>
        <nav className={`mobile-nav ${authenticated ? "" : "trial-mobile-nav"}`} aria-label="Mobile participant application">
          {(authenticated ? mobileAppNav : trialNav).map(([label, href]) => <Link key={href} href={href} className={route.path === href ? "active" : ""}>{label}</Link>)}
        </nav>
      </div>
    </div>
  );
}

const orgNav: Array<[string, string, OrganizationCapability]> = [
  ["Overview", "", "workspace.view"],
  ["Dashboard", "/dashboard", "workspace.view"],
  ["Profile", "/profile", "profile.manage"],
  ["Team & Access", "/members", "members.view"],
  ["Roles", "/roles", "roles.manage"],
  ["Invitations", "/invitations", "members.manage"],
  ["Contacts", "/contacts", "contacts.view"],
  ["Lifecycle", "/lifecycle", "contacts.view"],
  ["Sequences", "/sequences", "sequences.manage"],
  ["Templates", "/templates", "templates.manage"],
  ["Surveys", "/surveys", "surveys.manage"],
  ["Offers", "/offers", "offers.manage"],
  ["Referrals", "/referrals", "referrals.manage"],
  ["Feedback", "/feedback", "feedback.view"],
  ["Analytics", "/analytics", "analytics.view"],
  ["Billing", "/billing", "billing.manage"],
  ["Settings", "/settings", "settings.manage"],
];

export function OrganizationShell({ children, organizationId }: { children: ReactNode; organizationId: string }) {
  const route = useRoute();
  const { getAccess } = useOrganization();
  const access = getAccess(organizationId);
  const base = `/org/${organizationId}/admin`;
  return (
    <div className="app-layout org-layout">
      <aside className="sidebar">
        <Brand />
        <div className="org-switcher"><small>Organization scope</small><strong>{access.organization?.name ?? "Organization"}</strong><span>{access.membership?.role ?? "No role"}</span></div>
        <nav aria-label="Organization administration">
          {orgNav.filter(([, , capability]) => access.can(capability)).map(([label, suffix]) => {
            const href = `${base}${suffix}`;
            return <Link key={href} href={href} className={route.path === href ? "active" : ""}>{label}</Link>;
          })}
        </nav>
        <Link href="/app">← Back to participant app</Link>
      </aside>
      <div className="app-main">
        <header className="app-topbar"><span>Organization administration</span><div className="scope-actions"><Badge tone="accent">Organization scope</Badge><Link href="/app/account">Account</Link></div></header>
        <main className="app-content">{children}</main>
        <nav className="mobile-nav org-mobile-nav" aria-label="Mobile organization administration">
          {[["Dashboard", "/dashboard"], ["Contacts", "/contacts"], ["Sequences", "/sequences"], ["Surveys", "/surveys"], ["Settings", "/settings"]].map(([label, suffix]) => {
            const href = `${base}${suffix}`;
            return <Link key={href} href={href} className={route.path === href ? "active" : ""}>{label}</Link>;
          })}
        </nav>
      </div>
    </div>
  );
}

const platformNav: Array<[string, string, PlatformCapability]> = [
  ["Overview", "", "platform.view"],
  ["Organizations", "/organizations", "organizations.view"],
  ["Users & Access", "/access", "access.view"],
  ["Product & Features", "/product", "product.view"],
  ["Plans & Entitlements", "/billing", "plans.view"],
  ["Communications", "/communications", "communications.view"],
  ["Integrations", "/integrations", "integrations.view"],
  ["Operations", "/operations", "operations.view"],
  ["Audit & Security", "/audit", "audit.view"],
  ["Platform Settings", "/settings", "settings.view"],
];

export function PlatformAdminShell({
  children,
  role,
  can,
}: {
  children: ReactNode;
  role: PlatformRole | null;
  can: (capability: PlatformCapability) => boolean;
}) {
  const route = useRoute();
  const base = "/platform";
  return (
    <div className="app-layout platform-layout">
      <aside className="sidebar">
        <Brand />
        <div className="platform-scope"><small>Nurture</small><strong>Platform Administration</strong><span>{role ?? "No platform role"}</span></div>
        <nav aria-label="Nurture platform administration">
          {platformNav.filter(([, , capability]) => can(capability)).map(([label, suffix]) => {
            const href = `${base}${suffix}`;
            return <Link key={href} href={href} className={route.path === href ? "active" : ""}>{label}</Link>;
          })}
        </nav>
        <Link href="/app">← Back to participant app</Link>
      </aside>
      <div className="app-main">
        <header className="app-topbar"><strong>Nurture Platform Administration</strong><Badge tone="warning">Platform scope</Badge></header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
