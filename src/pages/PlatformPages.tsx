import { Badge, Card, MetricCard, PageHeader } from "../components/ui";

const pages: Record<string, { title: string; description: string; eyebrow: string }> = {
  overview: { title: "Platform overview", description: "A Nurture-wide operational view, intentionally separate from every organization workspace.", eyebrow: "Platform scope" },
  organizations: { title: "Organizations", description: "Future platform-level organization support, status, plan, and usage operations.", eyebrow: "Platform" },
  access: { title: "Users & platform access", description: "Manage future Nurture platform roles and support access without confusing them with organization roles.", eyebrow: "Platform security" },
  product: { title: "Product & features", description: "Reserve global product modules, feature availability, and platform-level experience controls.", eyebrow: "Product" },
  billing: { title: "Plans & entitlements", description: "Reserve platform plan definitions and entitlement controls. Stripe mutations remain trusted-server operations.", eyebrow: "Commercial" },
  communications: { title: "Communications", description: "Reserve global communication templates, delivery health, suppression, and provider operations.", eyebrow: "Operations" },
  integrations: { title: "Integrations", description: "Reserve configuration and health surfaces for platform integrations without exposing provider secrets to the browser.", eyebrow: "Operations" },
  operations: { title: "Operations", description: "Reserve system health, support tooling, retry queues, and operational workflows.", eyebrow: "Operations" },
  audit: { title: "Audit & security", description: "Reserve platform audit events and security review. Privileged actions must record actor, action, target, timestamp, and context.", eyebrow: "Security" },
  settings: { title: "Platform settings", description: "Reserve global Nurture settings. Organization settings remain within organization scope.", eyebrow: "Platform" },
};

export function PlatformPage({ section }: { section: string }) {
  const page = pages[section] ?? pages.overview;
  return (
    <>
      <PageHeader eyebrow={page.eyebrow} title={page.title} description={page.description} />
      {section === "overview" ? <PlatformOverview /> : <PlatformPlaceholder section={section} />}
    </>
  );
}

function PlatformOverview() {
  return (
    <>
      <div className="metric-grid">
        <MetricCard label="Organizations" value="24" detail="Demo metric" />
        <MetricCard label="Active users" value="1,842" detail="Demo metric" />
        <MetricCard label="Experiences" value="17" detail="Demo metric" />
        <MetricCard label="Open operations" value="3" detail="Demo metric" />
      </div>
      <Card>
        <Badge tone="warning">Platform scope</Badge>
        <h2>Global actions require global authority.</h2>
        <p>This shell is deliberately separate from organization administration. A platform operator may support many tenants, but organization membership alone never grants this access.</p>
      </Card>
    </>
  );
}

function PlatformPlaceholder({ section }: { section: string }) {
  return (
    <Card>
      <Badge tone="accent">Reserved boundary</Badge>
      <h2>{pages[section]?.title ?? "Platform administration"}</h2>
      <p>This destination is intentionally a polished placeholder. Its route, navigation scope, authorization capability, and audit requirement exist now so the Platform Administration owner can implement it without restructuring the participant or organization applications.</p>
    </Card>
  );
}
