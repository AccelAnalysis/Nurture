export type PublicAnalyticsEvent =
  | "public_page_view"
  | "public_primary_cta_selected"
  | "public_offer_handoff"
  | "public_trial_entry_handoff"
  | "public_identity_handoff";

interface PublicMetadata {
  title: string;
  description: string;
}

const metadata: Record<string, PublicMetadata> = {
  "/": { title: "Nurture — Customer lifecycle app hub", description: "Nurture connects acquisition, experiences, retention, feedback, and referrals in one coherent application hub." },
  "/features": { title: "Features — Nurture", description: "Explore the reusable product, organization, outreach, feedback, referral, and account foundations in Nurture." },
  "/how-it-works": { title: "How Nurture works", description: "See how Nurture connects marketing, offers, onboarding, experiences, recurring value, feedback, and referrals." },
  "/offers": { title: "Offers — Nurture", description: "Explore free, trial, subscription, upgrade, promotional, and organization-specific Nurture offers." },
  "/about": { title: "About Nurture", description: "Nurture is a general-purpose application hub for organizations delivering and extending customer experiences." },
  "/help": { title: "Help — Nurture", description: "Get help with Nurture accounts, experiences, organizations, billing, privacy, and support." },
  "/contact": { title: "Contact — Nurture", description: "Contact Nurture for product, organization, account, or support questions." },
  "/privacy": { title: "Privacy — Nurture", description: "Review the Nurture privacy information and data-handling commitments." },
  "/terms": { title: "Terms — Nurture", description: "Review the terms governing Nurture accounts, organizations, experiences, offers, and referrals." },
};

function resolveMetadata(path: string): PublicMetadata {
  if (metadata[path]) return metadata[path];
  if (path.startsWith("/offers/")) return { title: "Offer — Nurture", description: "Review this Nurture offer and continue into the customer lifecycle." };
  if (path.startsWith("/r/")) return { title: "Nurture referral", description: "Continue a referred Nurture experience while preserving attribution." };
  if (path.startsWith("/survey/")) return { title: "Nurture survey", description: "Share feedback through a Nurture survey." };
  return { title: "Nurture", description: "Nurture is a general-purpose customer lifecycle application hub." };
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

export function applyPublicMetadata(path: string) {
  const page = resolveMetadata(path);
  const canonicalUrl = `https://nurture.accelanalysis.com${path}`;
  document.title = page.title;
  setMeta('meta[name="description"]', "name", "description", page.description);
  setMeta('meta[property="og:title"]', "property", "og:title", page.title);
  setMeta('meta[property="og:description"]', "property", "og:description", page.description);
  setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
  setMeta('meta[property="og:type"]', "property", "og:type", "website");

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;
}

export function trackPublicEvent(name: PublicAnalyticsEvent, detail: Record<string, string> = {}) {
  window.dispatchEvent(new CustomEvent("nurture:public-analytics", {
    detail: {
      name,
      path: window.location.pathname,
      ...detail,
    },
  }));
}
