import type { OrganizationConfiguration } from "../configuration/types";

export type PublicAnalyticsEvent =
  | "public.page_viewed"
  | "public.cta_selected"
  | "public.offer_handoff"
  | "public.trial_entry_handoff"
  | "public.identity_handoff";

interface PublicMetadata {
  title: string;
  description: string;
}

const fallbackMetadata: Record<string, PublicMetadata> = {
  "/features": { title: "Features — Nurture", description: "Explore the reusable product, organization, outreach, feedback, referral, and account foundations in Nurture." },
  "/how-it-works": { title: "How Nurture works", description: "See how Nurture connects marketing, offers, onboarding, experiences, recurring value, feedback, and referrals." },
  "/offers": { title: "Offers — Nurture", description: "Explore available offers and continue into the Nurture-powered customer experience." },
  "/about": { title: "About Nurture", description: "Nurture is a configurable application foundation for organizations delivering customer experiences." },
  "/help": { title: "Help — Nurture", description: "Get help with accounts, experiences, organizations, billing, privacy, and support." },
  "/contact": { title: "Contact — Nurture", description: "Contact the organization for product, account, or support questions." },
  "/privacy": { title: "Privacy — Nurture", description: "Review privacy information and data-handling commitments." },
  "/terms": { title: "Terms — Nurture", description: "Review the terms governing this Nurture-powered application." },
};

function resolveMetadata(path: string, configuration?: OrganizationConfiguration | null): PublicMetadata {
  const applicationName = configuration?.brand.applicationName ?? "Nurture";
  if (path === "/") {
    return configuration
      ? { title: configuration.metadata.homeTitle, description: configuration.metadata.homeDescription }
      : { title: "Nurture", description: "Nurture is a configurable application foundation." };
  }
  if (fallbackMetadata[path]) {
    const page = fallbackMetadata[path];
    return {
      title: page.title.replaceAll("Nurture", applicationName),
      description: page.description.replaceAll("Nurture", applicationName),
    };
  }
  if (path.startsWith("/offers/")) return { title: `Offer — ${applicationName}`, description: `Review this ${applicationName} offer and continue when ready.` };
  if (path.startsWith("/r/")) return { title: `${applicationName} referral`, description: `Continue a referred ${applicationName} experience while preserving attribution.` };
  if (path.startsWith("/survey/")) return { title: `${applicationName} survey`, description: `Share feedback through ${applicationName}.` };
  return { title: applicationName, description: configuration?.metadata.homeDescription ?? "A Nurture-powered application experience." };
}

function setMeta(selector: string, attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

export function applyPublicMetadata(path: string, configuration?: OrganizationConfiguration | null) {
  const page = resolveMetadata(path, configuration);
  const canonicalUrl = `https://nurture.accelanalysis.com${path}`;
  document.title = page.title;
  setMeta('meta[name="description"]', "name", "description", page.description);
  setMeta('meta[property="og:title"]', "property", "og:title", page.title);
  setMeta('meta[property="og:description"]', "property", "og:description", page.description);
  setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
  setMeta('meta[property="og:type"]', "property", "og:type", "website");
  if (configuration?.metadata.socialImageUrl) {
    setMeta('meta[property="og:image"]', "property", "og:image", configuration.metadata.socialImageUrl);
  }

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;
}

function eventId() {
  return globalThis.crypto?.randomUUID?.() ?? `public-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function trackPublicEvent(name: PublicAnalyticsEvent, detail: Record<string, string> = {}) {
  const { organizationId, ...properties } = detail;
  window.dispatchEvent(new CustomEvent("nurture:public-analytics", {
    detail: {
      eventId: eventId(),
      eventType: name,
      name,
      occurredAt: new Date().toISOString(),
      ...(organizationId ? { organizationId } : {}),
      source: "public-shell",
      schemaVersion: 1,
      path: window.location.pathname,
      properties,
    },
  }));
}
