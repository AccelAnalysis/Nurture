import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, TextArea } from "../../components/ui";
import { useOrganization } from "../../context/OrganizationContext";
import { DEMO_ORG_ID } from "../../data/demo";
import { firebaseConfigured } from "../../firebase";
import { Link, navigate } from "../../router";
import {
  createCheckoutSession,
  getCurrentSubscription,
  listOrganizationOffers,
  listPublishedOffers,
  openBillingPortal,
  publishOffer,
  recordOfferViewed,
  saveOfferDraft,
  seedReleaseOneOffers,
} from "./client";
import type { BillingInterval, CommercialOffer, OfferPrice, SubscriptionSnapshot } from "./contracts";
import { releaseOneDefaultOffers } from "./defaults";
import {
  describeAnnualComparison,
  describePrice,
  formatMinorAmount,
  getActivePrice,
} from "./pricing";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "The billing request could not be completed.";
}

function fallbackPublishedOffers() {
  // The current repository is a demo skeleton. Show all three safe preview defaults
  // only when Firebase is not configured; a configured environment receives only
  // server-published offers.
  return firebaseConfigured ? [] : releaseOneDefaultOffers;
}

function PriceChoice({ offer, interval, onInterval }: {
  offer: CommercialOffer;
  interval: BillingInterval;
  onInterval: (interval: BillingInterval) => void;
}) {
  const monthly = getActivePrice(offer, "month");
  const annual = getActivePrice(offer, "year");
  const price = interval === "month" ? monthly : annual;
  const comparison = describeAnnualComparison(monthly, annual);

  return (
    <>
      <div className="hero-actions" role="group" aria-label={`Billing interval for ${offer.name}`}>
        <Button
          className={interval === "month" ? "" : "button-secondary"}
          type="button"
          aria-pressed={interval === "month"}
          onClick={() => onInterval("month")}
        >Monthly</Button>
        <Button
          className={interval === "year" ? "" : "button-secondary"}
          type="button"
          aria-pressed={interval === "year"}
          onClick={() => onInterval("year")}
        >Annual</Button>
      </div>
      <p className="price">{price ? describePrice(price) : "Not offered"}</p>
      {interval === "year" && comparison ? <p className="muted">{comparison}</p> : null}
    </>
  );
}

function OfferBenefits({ offer }: { offer: CommercialOffer }) {
  return (
    <>
      <ul>{offer.marketingBenefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
      <p className="muted">Marketing benefits describe the offer. Access is granted only from trusted entitlement resolution.</p>
    </>
  );
}

export function PublicOffersPage({ organizationId = DEMO_ORG_ID }: { organizationId?: string }) {
  const [offers, setOffers] = useState<CommercialOffer[]>(fallbackPublishedOffers);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let cancelled = false;
    listPublishedOffers(organizationId)
      .then((items) => { if (!cancelled) setOffers(items); })
      .catch((cause) => { if (!cancelled) setError(messageFrom(cause)); });
    return () => { cancelled = true; };
  }, [organizationId]);

  const visible = useMemo(
    () => [...offers].filter((offer) => offer.visibility === "public" && !["disabled", "archived"].includes(offer.status)).sort((a, b) => a.order - b.order),
    [offers],
  );

  return (
    <section className="content-width page-section">
      <PageHeader
        eyebrow="Stage 2"
        title="Offers"
        description="Choose monthly or annual terms with the actual charge and interval shown explicitly. Checkout is verified server-side before paid access can exist."
      />
      {error ? <Card><p role="alert">{error}</p></Card> : null}
      {!firebaseConfigured ? <Card><Badge tone="warning">Preview defaults</Badge><p>Paid amounts below are illustrative Release 1 test configuration, not approved live charges.</p></Card> : null}
      <div className="pricing-grid">
        {visible.map((offer) => (
          <Card key={offer.id}>
            <div className="card-heading">
              <div><Badge tone={offer.recommended ? "accent" : "neutral"}>{offer.recommended ? "Recommended" : offer.status}</Badge><h2>{offer.name}</h2></div>
              {offer.trialDays ? <Badge>{offer.trialDays}-day trial option</Badge> : null}
            </div>
            <p>{offer.description}</p>
            <PriceChoice offer={offer} interval={interval} onInterval={setInterval} />
            <OfferBenefits offer={offer} />
            <Button onClick={() => {
              if (firebaseConfigured) void recordOfferViewed(organizationId, offer.id).catch(() => undefined);
              navigate(`/offers/${offer.id}`);
            }}>View offer</Button>
          </Card>
        ))}
      </div>
      {!visible.length ? <EmptyState title="No published offers" description="This organization has not published a customer-visible offer yet." /> : null}
    </section>
  );
}

export function PublicOfferDetail({ offerId, organizationId = DEMO_ORG_ID }: { offerId: string; organizationId?: string }) {
  const [offers, setOffers] = useState<CommercialOffer[]>(fallbackPublishedOffers);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let cancelled = false;
    listPublishedOffers(organizationId)
      .then((items) => { if (!cancelled) setOffers(items); })
      .catch((cause) => { if (!cancelled) setError(messageFrom(cause)); });
    return () => { cancelled = true; };
  }, [organizationId]);

  const offer = offers.find((item) => item.id === offerId);
  if (!offer) {
    return <section className="content-width page-section narrow"><EmptyState title="Offer unavailable" description={error ?? "This offer is not published for this organization."} /></section>;
  }

  const selectedPrice = getActivePrice(offer, interval);
  const free = selectedPrice?.unitAmountMinor === 0;

  return (
    <section className="content-width page-section narrow">
      <PageHeader eyebrow="Offer" title={offer.name} description={offer.description} />
      <Card>
        <div className="card-heading"><Badge tone={offer.recommended ? "accent" : "neutral"}>{offer.recommended ? "Recommended" : "Offer"}</Badge>{offer.trialDays ? <Badge>{offer.trialDays}-day trial option</Badge> : null}</div>
        <PriceChoice offer={offer} interval={interval} onInterval={setInterval} />
        <OfferBenefits offer={offer} />
        <div className="hero-actions">
          {free
            ? <Link className="button" href="/experience">Start Experience</Link>
            : <Link className="button" href="/register">Register to continue</Link>}
          <Link href="/offers">Back to offers</Link>
        </div>
        {!free ? <p className="muted">Paid checkout begins after identity/customer resolution. Reaching a success URL never grants access.</p> : null}
      </Card>
    </section>
  );
}

export function ParticipantOffersPage() {
  const { currentOrganizationId } = useOrganization();
  const organizationId = currentOrganizationId ?? DEMO_ORG_ID;
  const [offers, setOffers] = useState<CommercialOffer[]>(fallbackPublishedOffers);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let cancelled = false;
    listPublishedOffers(organizationId)
      .then((items) => { if (!cancelled) setOffers(items); })
      .catch((cause) => { if (!cancelled) setError(messageFrom(cause)); });
    return () => { cancelled = true; };
  }, [organizationId]);

  async function beginCheckout(offer: CommercialOffer) {
    const price = getActivePrice(offer, interval);
    if (!price) return setError("This billing interval is not available for the selected offer.");
    if (price.unitAmountMinor === 0) return navigate("/app/experience");
    if (!price.providerPriceId) return setError("This offer is missing its Stripe test-mode Price mapping and cannot start checkout yet.");

    setBusyOfferId(offer.id);
    setError(null);
    try {
      const result = await createCheckoutSession({ organizationId, offerId: offer.id, priceId: price.id, returnPath: "/app/billing" });
      window.location.assign(result.redirectUrl);
    } catch (cause) {
      setError(messageFrom(cause));
      setBusyOfferId(null);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Offers" title="Choose your access" description="Checkout uses the offer and price stored by Nurture; the server resolves the Stripe Price and trusted Customer mapping." />
      {error ? <Card><p role="alert">{error}</p></Card> : null}
      <div className="pricing-grid">
        {offers.filter((offer) => !["disabled", "archived"].includes(offer.status)).sort((a, b) => a.order - b.order).map((offer) => (
          <Card key={offer.id}>
            <Badge tone={offer.recommended ? "accent" : "neutral"}>{offer.recommended ? "Recommended" : offer.status}</Badge>
            <h2>{offer.name}</h2><p>{offer.description}</p>
            <PriceChoice offer={offer} interval={interval} onInterval={setInterval} />
            <OfferBenefits offer={offer} />
            <Button disabled={busyOfferId === offer.id} onClick={() => void beginCheckout(offer)}>{busyOfferId === offer.id ? "Opening checkout…" : "Continue"}</Button>
          </Card>
        ))}
      </div>
    </>
  );
}

export function ParticipantBillingPage() {
  const { currentOrganizationId } = useOrganization();
  const organizationId = currentOrganizationId ?? DEMO_ORG_ID;
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let cancelled = false;
    getCurrentSubscription(organizationId)
      .then((snapshot) => { if (!cancelled) setSubscription(snapshot); })
      .catch((cause) => { if (!cancelled) setError(messageFrom(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [organizationId]);

  async function openPortal() {
    setError(null);
    try {
      const result = await openBillingPortal(organizationId);
      window.location.assign(result.redirectUrl);
    } catch (cause) {
      setError(messageFrom(cause));
    }
  }

  return (
    <>
      <PageHeader eyebrow="Billing" title="Subscription" description="This page reads server-reconciled commercial state. The checkout return URL is not a source of truth." />
      {error ? <Card><p role="alert">{error}</p></Card> : null}
      {loading ? <Card><p role="status">Loading verified subscription…</p></Card> : subscription ? (
        <div className="two-column">
          <Card><Badge tone={subscription.status === "active" || subscription.status === "trialing" ? "positive" : "warning"}>{subscription.status}</Badge><h2>{subscription.offerId}</h2><p>{formatMinorAmount(subscription.unitAmountMinor, subscription.currency)} / {subscription.billingInterval}</p><p>Current period ends: {subscription.currentPeriodEnd ?? "Pending provider data"}</p><p>Cancel at period end: {subscription.cancelAtPeriodEnd ? "Yes" : "No"}</p><Button onClick={() => void openPortal()}>Manage in Stripe</Button></Card>
          <Card><h2>Trusted commercial handoff</h2><p>Provider: {subscription.provider}</p><p>Verified: {subscription.trustedAt}</p><p className="muted">Track B receives this provider-neutral subscription snapshot and decides which Experience capabilities are granted.</p></Card>
        </div>
      ) : <EmptyState title="No verified subscription" description={firebaseConfigured ? "No provider-backed subscription is currently recorded for this organization/customer relationship." : "Demo mode does not manufacture a paid subscription."} action={<Link className="button" href="/app/offers">View offers</Link>} />}
    </>
  );
}

function replacePrice(offer: CommercialOffer, interval: BillingInterval, changes: Partial<OfferPrice>) {
  const existing = getActivePrice(offer, interval);
  if (!existing) return offer;
  return { ...offer, prices: offer.prices.map((price) => price.id === existing.id ? { ...price, ...changes } : price) };
}

export function OrganizationOffersPage({ organizationId }: { organizationId: string }) {
  const [offers, setOffers] = useState<CommercialOffer[]>(releaseOneDefaultOffers.map((offer) => ({ ...offer, organizationId })));
  const [selectedId, setSelectedId] = useState("primary");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = offers.find((offer) => offer.id === selectedId) ?? offers[0];

  useEffect(() => {
    if (!firebaseConfigured) return;
    let cancelled = false;
    listOrganizationOffers(organizationId)
      .then((items) => { if (!cancelled && items.length) { setOffers(items); setSelectedId(items[0].id); } })
      .catch((cause) => { if (!cancelled) setError(messageFrom(cause)); });
    return () => { cancelled = true; };
  }, [organizationId]);

  function update(changes: Partial<CommercialOffer>) {
    if (!selected) return;
    setOffers((items) => items.map((offer) => offer.id === selected.id ? { ...offer, ...changes } : offer));
  }

  function updatePrice(interval: BillingInterval, changes: Partial<OfferPrice>) {
    if (!selected) return;
    setOffers((items) => items.map((offer) => offer.id === selected.id ? replacePrice(offer, interval, changes) : offer));
  }

  async function save() {
    if (!selected) return;
    setError(null); setMessage(null);
    try {
      const saved = await saveOfferDraft({ ...selected, organizationId, status: "draft" });
      setOffers((items) => items.map((offer) => offer.id === saved.id ? saved : offer));
      setMessage("Draft saved. The public offer is unchanged until publish succeeds.");
    } catch (cause) { setError(messageFrom(cause)); }
  }

  async function publish() {
    if (!selected) return;
    setError(null); setMessage(null);
    try {
      const published = await publishOffer(organizationId, selected.id);
      setOffers((items) => items.map((offer) => offer.id === published.id ? published : offer));
      setMessage("Offer published after server-side readiness validation.");
    } catch (cause) { setError(messageFrom(cause)); }
  }

  async function seed() {
    setError(null); setMessage(null);
    try {
      const result = await seedReleaseOneOffers(organizationId);
      setMessage(`${result.created} default offer${result.created === 1 ? "" : "s"} created without overwriting existing organization offers.`);
      const items = await listOrganizationOffers(organizationId);
      if (items.length) { setOffers(items); setSelectedId(items[0].id); }
    } catch (cause) { setError(messageFrom(cause)); }
  }

  if (!selected) return <EmptyState title="No offers" description="Seed the Release 1 Entry, Primary, and Premium defaults to begin." />;
  const monthly = getActivePrice(selected, "month");
  const annual = getActivePrice(selected, "year");

  return (
    <>
      <PageHeader eyebrow="Revenue" title="Offers" description="Configure marketing terms and provider price mappings. Capability keys are passed to entitlement resolution but are never granted by this editor." actions={<Button className="button-secondary" onClick={() => void seed()} disabled={!firebaseConfigured}>Seed R1 defaults</Button>} />
      {!firebaseConfigured ? <Card><Badge tone="warning">Demo mode</Badge><p>The editor renders the Release 1 contract but saving, publishing, and Stripe checkout remain disabled until Firebase Authentication/Functions are configured.</p></Card> : null}
      {error ? <Card><p role="alert">{error}</p></Card> : null}
      {message ? <Card><p role="status">{message}</p></Card> : null}
      <div className="two-column">
        <Card>
          <h2>Offer library</h2>
          {offers.sort((a, b) => a.order - b.order).map((offer) => <button className={`template-list-item ${offer.id === selected.id ? "active" : ""}`} key={offer.id} onClick={() => setSelectedId(offer.id)}><span>{offer.name}</span><small>{offer.status} · {offer.visibility}{offer.recommended ? " · recommended" : ""}</small></button>)}
        </Card>
        <Card className="form-card">
          <div className="card-heading"><div><Badge>{selected.status}</Badge><h2>{selected.name}</h2></div><Badge tone="accent">v{selected.version}</Badge></div>
          <label>Name<Input value={selected.name} onChange={(event) => update({ name: event.target.value })} /></label>
          <label>Description<TextArea rows={4} value={selected.description} onChange={(event) => update({ description: event.target.value })} /></label>
          <div className="two-column-fields">
            <label>Visibility<Select value={selected.visibility} onChange={(event) => update({ visibility: event.target.value as CommercialOffer["visibility"] })}><option value="public">Public</option><option value="authenticated">Authenticated</option><option value="hidden">Hidden</option></Select></label>
            <label>Trial days<Input type="number" min="0" value={selected.trialDays ?? 0} onChange={(event) => update({ trialDays: Math.max(0, Number(event.target.value)) || undefined })} /></label>
          </div>
          <label><input type="checkbox" checked={selected.recommended} onChange={(event) => update({ recommended: event.target.checked })} /> Recommended offer</label>
          <label>Marketing benefits<TextArea rows={4} value={selected.marketingBenefits.join("\n")} onChange={(event) => update({ marketingBenefits: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
          <label>Experience capability keys<TextArea rows={3} value={selected.capabilityKeys.join("\n")} onChange={(event) => update({ capabilityKeys: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
          <p className="muted">These capability keys are offer inputs only. Track B's trusted entitlement resolver decides actual grants.</p>
          <h3>Monthly price</h3>
          <div className="two-column-fields">
            <label>Amount (minor units)<Input type="number" min="0" value={monthly?.unitAmountMinor ?? 0} onChange={(event) => updatePrice("month", { unitAmountMinor: Math.max(0, Math.round(Number(event.target.value) || 0)) })} /></label>
            <label>Stripe Price ID<Input placeholder="price_… (test mode)" value={monthly?.providerPriceId ?? ""} onChange={(event) => updatePrice("month", { providerPriceId: event.target.value.trim() || undefined })} /></label>
          </div>
          <h3>Annual prepaid price</h3>
          <div className="two-column-fields">
            <label>Amount (minor units)<Input type="number" min="0" value={annual?.unitAmountMinor ?? 0} onChange={(event) => updatePrice("year", { unitAmountMinor: Math.max(0, Math.round(Number(event.target.value) || 0)) })} /></label>
            <label>Stripe Price ID<Input placeholder="price_… (test mode)" value={annual?.providerPriceId ?? ""} onChange={(event) => updatePrice("year", { providerPriceId: event.target.value.trim() || undefined })} /></label>
          </div>
          {monthly && annual ? <p className="muted">{describeAnnualComparison(monthly, annual)}</p> : null}
          <div className="hero-actions"><Button disabled={!firebaseConfigured} onClick={() => void save()}>Save draft</Button><Button className="button-secondary" disabled={!firebaseConfigured || selected.status !== "draft"} onClick={() => void publish()}>Publish</Button></div>
          <small>Publishing paid prices requires Stripe test-mode Price mappings. Existing subscription mappings are not rewritten when a draft price changes.</small>
        </Card>
      </div>
    </>
  );
}
