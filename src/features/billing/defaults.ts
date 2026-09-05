import { DEMO_ORG_ID } from "../../data/demo";
import type { CommercialOffer } from "./contracts";

/**
 * Safe Release 1 preview defaults. Amounts are illustrative test values only and
 * deliberately have no Stripe Price IDs. Publishing a paid checkout requires an
 * administrator to attach Stripe test-mode Price IDs first.
 */
export const releaseOneDefaultOffers: CommercialOffer[] = [
  {
    id: "entry",
    organizationId: DEMO_ORG_ID,
    slug: "entry",
    name: "Entry",
    description: "A low-friction way to begin with the public Experience.",
    status: "published",
    visibility: "public",
    order: 10,
    recommended: false,
    marketingBenefits: ["Public Experience", "Core introductory resources"],
    capabilityKeys: ["experience.public"],
    prices: [
      { id: "entry-month", interval: "month", currency: "usd", unitAmountMinor: 0, provider: "stripe", active: true },
      { id: "entry-year", interval: "year", currency: "usd", unitAmountMinor: 0, provider: "stripe", active: true },
    ],
    version: 1,
  },
  {
    id: "primary",
    organizationId: DEMO_ORG_ID,
    slug: "primary",
    name: "Primary",
    description: "Ongoing access to the primary Experience and its protected core capabilities.",
    status: "draft",
    visibility: "public",
    order: 20,
    recommended: true,
    trialDays: 14,
    marketingBenefits: ["Primary Experience", "Progress continuity", "Participant resources"],
    capabilityKeys: ["experience.core", "experience.progress"],
    prices: [
      { id: "primary-month", interval: "month", currency: "usd", unitAmountMinor: 2900, provider: "stripe", active: true },
      { id: "primary-year", interval: "year", currency: "usd", unitAmountMinor: 29000, provider: "stripe", active: true },
    ],
    version: 1,
  },
  {
    id: "premium",
    organizationId: DEMO_ORG_ID,
    slug: "premium",
    name: "Premium",
    description: "Expanded access for participants who need additional Experience capabilities.",
    status: "draft",
    visibility: "public",
    order: 30,
    recommended: false,
    marketingBenefits: ["Everything in Primary", "Premium Experience tools", "Expanded resources"],
    capabilityKeys: ["experience.core", "experience.progress", "experience.premium"],
    prices: [
      { id: "premium-month", interval: "month", currency: "usd", unitAmountMinor: 4900, provider: "stripe", active: true },
      { id: "premium-year", interval: "year", currency: "usd", unitAmountMinor: 49900, provider: "stripe", active: true },
    ],
    version: 1,
  },
];

export function getDefaultOffer(offerId: string) {
  return releaseOneDefaultOffers.find((offer) => offer.id === offerId) ?? null;
}
