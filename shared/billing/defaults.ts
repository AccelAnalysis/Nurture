import { RELEASE_ONE_REFERENCE_OFFER_CAPABILITIES } from "../experience/reference-capabilities.js";
import type { CommercialOffer } from "./contracts.js";

/**
 * Safe Release 1 preview templates. Amounts are illustrative test values only
 * and deliberately have no Stripe Price IDs. Paid publishing therefore fails
 * readiness validation until an administrator maps Stripe test-mode Prices.
 */
export function createReleaseOneDefaultOffers(organizationId: string): CommercialOffer[] {
  return [
    {
      id: "entry",
      organizationId,
      slug: "entry",
      name: "Entry",
      description: "A low-friction way to begin with the public Experience.",
      status: "published",
      visibility: "public",
      order: 10,
      recommended: false,
      marketingBenefits: ["Public Experience", "Core introductory resources"],
      capabilityKeys: [...RELEASE_ONE_REFERENCE_OFFER_CAPABILITIES.entry],
      prices: [
        { id: "entry-month", interval: "month", currency: "usd", unitAmountMinor: 0, provider: "stripe", active: true },
        { id: "entry-year", interval: "year", currency: "usd", unitAmountMinor: 0, provider: "stripe", active: true },
      ],
      version: 1,
    },
    {
      id: "primary",
      organizationId,
      slug: "primary",
      name: "Primary",
      description: "Ongoing access to the primary Experience and its protected core capabilities.",
      status: "draft",
      visibility: "public",
      order: 20,
      recommended: true,
      trialDays: 14,
      marketingBenefits: ["Primary Experience", "Progress continuity", "Participant resources"],
      capabilityKeys: [...RELEASE_ONE_REFERENCE_OFFER_CAPABILITIES.primary],
      prices: [
        { id: "primary-month", interval: "month", currency: "usd", unitAmountMinor: 2900, provider: "stripe", active: true },
        { id: "primary-year", interval: "year", currency: "usd", unitAmountMinor: 29000, provider: "stripe", active: true },
      ],
      version: 1,
    },
    {
      id: "premium",
      organizationId,
      slug: "premium",
      name: "Premium",
      description: "Expanded access for participants who need additional Experience capabilities.",
      status: "draft",
      visibility: "public",
      order: 30,
      recommended: false,
      marketingBenefits: ["Everything in Primary", "Premium Experience tools", "Expanded resources"],
      capabilityKeys: [...RELEASE_ONE_REFERENCE_OFFER_CAPABILITIES.premium],
      prices: [
        { id: "premium-month", interval: "month", currency: "usd", unitAmountMinor: 4900, provider: "stripe", active: true },
        { id: "premium-year", interval: "year", currency: "usd", unitAmountMinor: 49900, provider: "stripe", active: true },
      ],
      version: 1,
    },
  ];
}
