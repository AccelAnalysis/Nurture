import { useEffect, useState } from "react";
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Input, LoadingState, PageHeader, Select } from "../../components/ui";
import { Link } from "../../router";
import {
  CUSTOMER_WORKSPACE_PAGE_SIZE,
  defaultCustomerWorkspaceFilters,
  type CustomerLifecycleSummary,
  type CustomerTimelineCategory,
  type CustomerTimelineEntry,
  type CustomerWorkspaceDetail,
  type CustomerWorkspaceFilters,
  type LifecycleKnowledge,
} from "./contracts";
import { customerWorkspacePort } from "./port";
import "./customer-workspace.css";

function humanize(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function factLabel<T extends string>(fact: LifecycleKnowledge<T>) {
  return fact.status === "known" ? humanize(fact.value) : humanize(fact.status);
}

function factDetail<T>(fact: LifecycleKnowledge<T>) {
  return fact.status === "known" ? `${fact.source} · ${formatDate(fact.updatedAt)}` : fact.reason;
}

function factTone<T extends string>(fact: LifecycleKnowledge<T>): "neutral" | "positive" | "warning" | "accent" {
  if (fact.status !== "known") return fact.status === "unknown" ? "warning" : "neutral";
  if (["active", "completed", "verified", "eligible", "milestone-reached"].includes(fact.value)) return "positive";
  if (["suppressed", "past-due", "cancelled"].includes(fact.value)) return "warning";
  return "accent";
}

function DimensionCell<T extends string>({ fact }: { fact: LifecycleKnowledge<T> }) {
  return (
    <div className="customer-fact">
      <Badge tone={factTone(fact)}>{factLabel(fact)}</Badge>
      {fact.status !== "known" ? <small>{fact.reason}</small> : null}
    </div>
  );
}

function CustomerFilters({
  filters,
  onChange,
}: {
  filters: CustomerWorkspaceFilters;
  onChange: (filters: CustomerWorkspaceFilters) => void;
}) {
  return (
    <div className="customer-filter-grid">
      <label>
        Identity
        <Select
          value={filters.identity}
          onChange={(event) => onChange({ ...filters, identity: event.currentTarget.value as CustomerWorkspaceFilters["identity"] })}
        >
          <option value="all">All</option><option value="lead">Lead</option><option value="registered">Registered</option><option value="verified">Verified</option><option value="unknown">Unknown</option><option value="unavailable">Unavailable</option>
        </Select>
      </label>
      <label>
        Onboarding
        <Select
          value={filters.onboarding}
          onChange={(event) => onChange({ ...filters, onboarding: event.currentTarget.value as CustomerWorkspaceFilters["onboarding"] })}
        >
          <option value="all">All</option><option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="completed">Completed</option><option value="unknown">Unknown</option><option value="unavailable">Unavailable</option>
        </Select>
      </label>
      <label>
        Commercial
        <Select
          value={filters.commercial}
          onChange={(event) => onChange({ ...filters, commercial: event.currentTarget.value as CustomerWorkspaceFilters["commercial"] })}
        >
          <option value="all">All</option><option value="none">None</option><option value="trialing">Trialing</option><option value="active">Active</option><option value="past-due">Past due</option><option value="cancelled">Cancelled</option><option value="unknown">Unknown</option><option value="unavailable">Unavailable</option>
        </Select>
      </label>
      <label>
        Experience
        <Select
          value={filters.experience}
          onChange={(event) => onChange({ ...filters, experience: event.currentTarget.value as CustomerWorkspaceFilters["experience"] })}
        >
          <option value="all">All</option><option value="not-started">Not started</option><option value="active">Active</option><option value="milestone-reached">Milestone reached</option><option value="inactive">Inactive</option><option value="unknown">Unknown</option><option value="unavailable">Unavailable</option>
        </Select>
      </label>
      <label>
        Communication
        <Select
          value={filters.communication}
          onChange={(event) => onChange({ ...filters, communication: event.currentTarget.value as CustomerWorkspaceFilters["communication"] })}
        >
          <option value="all">All</option><option value="eligible">Eligible</option><option value="suppressed">Suppressed</option><option value="unknown">Unknown</option><option value="unavailable">Unavailable</option>
        </Select>
      </label>
    </div>
  );
}

export function CustomerWorkspaceListPage({ organizationId }: { organizationId: string }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<CustomerWorkspaceFilters>(defaultCustomerWorkspaceFilters);
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);
  const [items, setItems] = useState<CustomerLifecycleSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setState("loading");
    setError("");
    void customerWorkspacePort.listCustomers({ organizationId, query, filters, cursor, limit: CUSTOMER_WORKSPACE_PAGE_SIZE })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setState("ready");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setItems([]);
        setNextCursor(undefined);
        setError(cause instanceof Error ? cause.message : "Customer lifecycle data could not be loaded.");
        setState("error");
      });
    return () => { active = false; };
  }, [cursor, filters, organizationId, query, refreshKey]);

  const resetPaging = () => { setCursor(undefined); setCursorHistory([]); };
  const updateFilters = (next: CustomerWorkspaceFilters) => { setFilters(next); resetPaging(); };
  const nextPage = () => {
    if (!nextCursor) return;
    setCursorHistory((history) => [...history, cursor]);
    setCursor(nextCursor);
  };
  const previousPage = () => {
    setCursorHistory((history) => {
      if (!history.length) return history;
      setCursor(history.at(-1));
      return history.slice(0, -1);
    });
  };

  return (
    <>
      <PageHeader eyebrow="Customer lifecycle" title="Customers" description="A tenant-scoped operational view composed from the customer, lifecycle, billing, communication, and acquisition owners. Unknown facts remain unknown rather than being inferred." />
      <Card className="customer-toolbar">
        <label className="customer-search">Search<Input type="search" value={query} placeholder="Name, email, or customer ID" onChange={(event) => { setQuery(event.currentTarget.value); resetPaging(); }} /></label>
        <CustomerFilters filters={filters} onChange={updateFilters} />
      </Card>
      {state === "loading" ? <Card><LoadingState label="Loading tenant-scoped customers…" /></Card> : null}
      {state === "error" ? <Card><ErrorState message={error} /><div className="customer-state-actions"><Button onClick={() => setRefreshKey((value) => value + 1)}>Retry</Button></div></Card> : null}
      {state === "ready" && !items.length ? <Card><EmptyState title="No customers match" description="No tenant-scoped customer summaries match the supported search and lifecycle filters. This view does not fall back to a global contact list." /></Card> : null}
      {state === "ready" && items.length ? (
        <Card>
          <DataTable
            headers={["Customer", "Identity", "Onboarding", "Commercial", "Experience", "Communication", "Derived stage", "Updated"]}
            rows={items.map((customer) => [
              <div className="customer-name" key={`${customer.customerId}-name`}><Link href={`/org/${organizationId}/admin/customers/${customer.customerId}`}>{customer.displayName}</Link><small>{customer.primaryEmail ?? customer.customerId}</small></div>,
              <DimensionCell key={`${customer.customerId}-identity`} fact={customer.dimensions.identity} />,
              <DimensionCell key={`${customer.customerId}-onboarding`} fact={customer.dimensions.onboarding} />,
              <DimensionCell key={`${customer.customerId}-commercial`} fact={customer.dimensions.commercial} />,
              <DimensionCell key={`${customer.customerId}-experience`} fact={customer.dimensions.experience} />,
              <DimensionCell key={`${customer.customerId}-communication`} fact={customer.dimensions.communication} />,
              <DimensionCell key={`${customer.customerId}-stage`} fact={customer.dimensions.derivedStage} />,
              formatDate(customer.updatedAt),
            ])}
          />
          <div className="customer-pagination" aria-label="Customer pagination">
            <Button className="button-secondary" disabled={!cursorHistory.length} onClick={previousPage}>Previous</Button>
            <span className="muted">Up to {CUSTOMER_WORKSPACE_PAGE_SIZE} customers per page</span>
            <Button className="button-secondary" disabled={!nextCursor} onClick={nextPage}>Next</Button>
          </div>
        </Card>
      ) : null}
    </>
  );
}

function FactCard<T extends string>({ title, fact }: { title: string; fact: LifecycleKnowledge<T> }) {
  return <Card className="customer-summary-card"><span className="muted">{title}</span><strong>{factLabel(fact)}</strong><small>{factDetail(fact)}</small></Card>;
}

function DetailContent({ detail }: { detail: CustomerWorkspaceDetail }) {
  return (
    <>
      <div className="customer-dimension-grid" aria-label="Lifecycle dimensions">
        <FactCard title="Identity" fact={detail.dimensions.identity} /><FactCard title="Onboarding" fact={detail.dimensions.onboarding} /><FactCard title="Commercial" fact={detail.dimensions.commercial} /><FactCard title="Experience" fact={detail.dimensions.experience} /><FactCard title="Communication" fact={detail.dimensions.communication} /><FactCard title="Derived administration stage" fact={detail.dimensions.derivedStage} />
      </div>
      <div className="two-column customer-detail-grid">
        <Card><p className="eyebrow">Identity & contact</p><h2>{detail.profile.displayName}</h2><dl className="customer-definition-list"><div><dt>Email</dt><dd>{detail.profile.email ?? "Unknown"}</dd></div><div><dt>Phone</dt><dd>{detail.profile.phone ?? "Unknown"}</dd></div><div><dt>Company</dt><dd>{detail.profile.company ?? "Unknown"}</dd></div><div><dt>Customer ID</dt><dd><code>{detail.customerId}</code></dd></div><div><dt>Linked lead</dt><dd>{detail.profile.linkedLeadId ?? "None known"}</dd></div></dl><small>Profile mutations belong to Track C and are not written directly by this browser view.</small></Card>
        <Card><p className="eyebrow">Offer & subscription</p>{detail.subscription.status === "known" ? <><h2>{detail.subscription.value.offerName}</h2><dl className="customer-definition-list"><div><dt>Status</dt><dd><Badge tone={factTone(detail.dimensions.commercial)}>{humanize(detail.subscription.value.subscriptionStatus)}</Badge></dd></div><div><dt>Offer version</dt><dd>{detail.subscription.value.offerVersion}</dd></div><div><dt>Billing interval</dt><dd>{detail.subscription.value.billingInterval ? humanize(detail.subscription.value.billingInterval) : "—"}</dd></div><div><dt>Period end</dt><dd>{formatDate(detail.subscription.value.currentPeriodEnd)}</dd></div><div><dt>Trial end</dt><dd>{formatDate(detail.subscription.value.trialEnd)}</dd></div></dl><small>{factDetail(detail.subscription)}</small></> : <EmptyState title={humanize(detail.subscription.status)} description={detail.subscription.reason} />}</Card>
        <Card><p className="eyebrow">Onboarding</p>{detail.onboarding.status === "known" ? <><h2>{detail.onboarding.value.flowName}</h2><p>{humanize(detail.onboarding.value.status)} · {detail.onboarding.value.flowVersion}</p><progress max={Math.max(1, detail.onboarding.value.totalSteps)} value={detail.onboarding.value.completedSteps} aria-label={`${detail.onboarding.value.completedSteps} of ${detail.onboarding.value.totalSteps} onboarding steps completed`} /><small>{detail.onboarding.value.completedSteps} of {detail.onboarding.value.totalSteps} steps · Last progress {formatDate(detail.onboarding.value.lastProgressAt)}</small></> : <EmptyState title={humanize(detail.onboarding.status)} description={detail.onboarding.reason} />}</Card>
        <Card><p className="eyebrow">Experience activity</p>{detail.experience.status === "known" ? <><h2>{humanize(detail.experience.value.status)}</h2><p>First meaningful use: {formatDate(detail.experience.value.firstUseAt)}</p><p>Last use: {formatDate(detail.experience.value.lastUseAt)}</p>{detail.experience.value.milestones.length ? <div className="customer-compact-list">{detail.experience.value.milestones.map((milestone) => <div key={milestone.id}><strong>{milestone.label}</strong><small>{formatDate(milestone.occurredAt)} · {milestone.source}</small></div>)}</div> : <p className="muted">No verified milestones are recorded.</p>}</> : <EmptyState title={humanize(detail.experience.status)} description={detail.experience.reason} />}</Card>
        <Card><p className="eyebrow">Communication eligibility</p>{detail.communicationEligibility.status === "known" ? <><h2>{detail.communicationEligibility.value.eligible === true ? "Eligible" : detail.communicationEligibility.value.eligible === false ? "Not eligible" : "Unknown"}</h2><Badge tone={detail.communicationEligibility.value.eligible ? "positive" : "warning"}>{humanize(detail.communicationEligibility.value.reason)}</Badge><p>{detail.communicationEligibility.value.explanation}</p><small>Purpose: {detail.communicationEligibility.value.purpose} · Evaluated {formatDate(detail.communicationEligibility.value.evaluatedAt)}</small></> : <EmptyState title={humanize(detail.communicationEligibility.status)} description={detail.communicationEligibility.reason} />}</Card>
        <Card><p className="eyebrow">Acquisition enrollment</p><h2>Scheduled work and explanations</h2>{detail.acquisitionEnrollments.length ? <div className="customer-compact-list">{detail.acquisitionEnrollments.map((enrollment) => <div key={enrollment.enrollmentId}><div className="customer-row-heading"><strong>{enrollment.automationLabel}</strong><Badge tone={["cancelled", "suppressed", "failed", "held", "unknown"].includes(enrollment.status) ? "warning" : "accent"}>{humanize(enrollment.status)}</Badge></div><p>{enrollment.reason}</p><small>{enrollment.automationId} · pinned {enrollment.pinnedVersion}{enrollment.nextActionAt ? ` · next ${formatDate(enrollment.nextActionAt)}` : ""}</small></div>)}</div> : <p className="muted">No acquisition enrollment is recorded for this customer.</p>}</Card>
      </div>
      <Card><p className="eyebrow">Communication history</p><h2>Email activity</h2>{detail.communicationHistory.length ? <div className="customer-compact-list">{detail.communicationHistory.map((message) => <div key={message.id}><div className="customer-row-heading"><strong>{message.summary}</strong><Badge tone={["suppressed", "failed", "unknown", "held"].includes(message.status) ? "warning" : "neutral"}>{humanize(message.status)}</Badge></div><p>{message.reason ?? `${humanize(message.purpose)} email`}</p><small>{formatDate(message.occurredAt)}</small></div>)}</div> : <EmptyState title="No communication history" description="No communication summary has been returned for this customer." />}</Card>
      <div className="two-column customer-explicitly-unavailable"><Card><p className="eyebrow">Surveys</p><h2>Unavailable in Release 2</h2><p>{detail.surveys.reason}</p></Card><Card><p className="eyebrow">Referrals</p><h2>Unavailable in Release 2</h2><p>{detail.referrals.reason}</p></Card></div>
    </>
  );
}

function CustomerTimeline({ organizationId, customerId }: { organizationId: string; customerId: string }) {
  const [category, setCategory] = useState<CustomerTimelineCategory>("all");
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);
  const [items, setItems] = useState<CustomerTimelineEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setState("loading");
    setError("");
    void customerWorkspacePort.queryTimeline({ organizationId, customerId, category, cursor, limit: 20 })
      .then((page) => { if (!active) return; setItems(page.items); setNextCursor(page.nextCursor); setState("ready"); })
      .catch((cause: unknown) => { if (!active) return; setItems([]); setNextCursor(undefined); setError(cause instanceof Error ? cause.message : "Customer timeline could not be loaded."); setState("error"); });
    return () => { active = false; };
  }, [category, cursor, customerId, organizationId]);

  const changeCategory = (next: CustomerTimelineCategory) => { setCategory(next); setCursor(undefined); setCursorHistory([]); };
  return (
    <Card className="customer-timeline">
      <div className="customer-row-heading"><div><p className="eyebrow">Activity timeline</p><h2>What happened, with source and reason</h2></div><label>Category<Select value={category} onChange={(event) => changeCategory(event.currentTarget.value as CustomerTimelineCategory)}><option value="all">All activity</option><option value="identity">Identity</option><option value="onboarding">Onboarding</option><option value="experience">Experience</option><option value="commercial">Commercial</option><option value="communication">Communication</option><option value="automation">Automation</option></Select></label></div>
      {state === "loading" ? <LoadingState label="Loading customer timeline…" /> : null}
      {state === "error" ? <ErrorState message={error} /> : null}
      {state === "ready" && !items.length ? <EmptyState title="No timeline entries" description="No authorized timeline entries match this filter." /> : null}
      {state === "ready" && items.length ? <ol className="customer-timeline-list">{items.map((entry) => <li key={entry.id}><div className="customer-timeline-marker" aria-hidden="true" /><div><div className="customer-row-heading"><strong>{entry.label}</strong><Badge>{humanize(entry.category)}</Badge></div><p>{entry.detail}</p><small>{formatDate(entry.occurredAt)} · {entry.source}</small></div></li>)}</ol> : null}
      {state === "ready" ? <div className="customer-pagination"><Button className="button-secondary" disabled={!cursorHistory.length} onClick={() => setCursorHistory((history) => { if (!history.length) return history; setCursor(history.at(-1)); return history.slice(0, -1); })}>Previous</Button><span className="muted">Newest activity first; source and reason are retained.</span><Button className="button-secondary" disabled={!nextCursor} onClick={() => { if (!nextCursor) return; setCursorHistory((history) => [...history, cursor]); setCursor(nextCursor); }}>Next</Button></div> : null}
    </Card>
  );
}

export function CustomerWorkspaceDetailPage({ organizationId, customerId }: { organizationId: string; customerId: string }) {
  const [detail, setDetail] = useState<CustomerWorkspaceDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setState("loading");
    setError("");
    void customerWorkspacePort.getCustomer(organizationId, customerId)
      .then((result) => { if (!active) return; setDetail(result); setState(result ? "ready" : "not-found"); })
      .catch((cause: unknown) => { if (!active) return; setDetail(null); setError(cause instanceof Error ? cause.message : "Customer lifecycle detail could not be loaded."); setState("error"); });
    return () => { active = false; };
  }, [customerId, organizationId, refreshKey]);

  return (
    <>
      <PageHeader eyebrow="Customer" title={detail?.profile.displayName ?? (state === "not-found" ? "Customer not found" : "Customer lifecycle record")} description="Independent identity, onboarding, commercial, Experience, and communication dimensions remain visible without turning the customer record into an access-control engine." actions={<Link href={`/org/${organizationId}/admin/customers`}>← Customers</Link>} />
      {state === "loading" ? <Card><LoadingState label="Loading customer lifecycle record…" /></Card> : null}
      {state === "error" ? <Card><ErrorState message={error} /><div className="customer-state-actions"><Button onClick={() => setRefreshKey((value) => value + 1)}>Retry</Button></div></Card> : null}
      {state === "not-found" ? <Card><EmptyState title="Customer not found" description="No customer in this organization matches the requested identifier, or the current member cannot access it." /></Card> : null}
      {state === "ready" && detail ? <><DetailContent detail={detail} /><CustomerTimeline organizationId={organizationId} customerId={customerId} /></> : null}
    </>
  );
}
