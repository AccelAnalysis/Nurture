import type { AnnualPricingSummary, BillingInterval, CommercialOffer, OfferPrice } from "./contracts.js";

export function assertMinorAmount(value: number, field = "amount") {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer in currency minor units.`);
  }
}

export function calculateAnnualPricing(
  monthlyUnitAmountMinor: number,
  annualUnitAmountMinor: number,
): AnnualPricingSummary {
  assertMinorAmount(monthlyUnitAmountMinor, "monthlyUnitAmountMinor");
  assertMinorAmount(annualUnitAmountMinor, "annualUnitAmountMinor");

  const annualAtMonthlyRateMinor = monthlyUnitAmountMinor * 12;
  const rawSavings = annualAtMonthlyRateMinor - annualUnitAmountMinor;
  const annualSavingsMinor = Math.max(0, rawSavings);
  const advertisesSavings = annualAtMonthlyRateMinor > 0 && rawSavings > 0;

  return {
    annualAtMonthlyRateMinor,
    annualSavingsMinor,
    annualSavingsPercent: advertisesSavings
      ? (annualSavingsMinor / annualAtMonthlyRateMinor) * 100
      : null,
    equivalentMonthlyMinor: Math.round(annualUnitAmountMinor / 12),
    advertisesSavings,
  };
}

export function currencyMinorUnitExponent(currency: string, locale?: string) {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  // ECMA-402's currency formatter uses the ISO 4217 minor-unit digits as the
  // default fraction digits (for example JPY=0, USD=2, KWD=3).
  return formatter.resolvedOptions().minimumFractionDigits;
}

export function formatMinorAmount(unitAmountMinor: number, currency: string, locale?: string) {
  assertMinorAmount(unitAmountMinor, "unitAmountMinor");
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  const exponent = formatter.resolvedOptions().minimumFractionDigits;
  return formatter.format(unitAmountMinor / (10 ** exponent));
}

export function getActivePrice(offer: CommercialOffer, interval: BillingInterval): OfferPrice | null {
  return offer.prices.find((price) => price.interval === interval && price.active) ?? null;
}

export function describePrice(price: OfferPrice, locale?: string) {
  const amount = formatMinorAmount(price.unitAmountMinor, price.currency, locale);
  return price.interval === "month" ? `${amount} / month` : `${amount} billed annually`;
}

export function describeAnnualComparison(monthly: OfferPrice | null, annual: OfferPrice | null, locale?: string) {
  if (!monthly || !annual || monthly.currency.toUpperCase() !== annual.currency.toUpperCase()) return null;

  const summary = calculateAnnualPricing(monthly.unitAmountMinor, annual.unitAmountMinor);
  const equivalent = formatMinorAmount(summary.equivalentMonthlyMinor, annual.currency, locale);
  const savings = summary.advertisesSavings
    ? ` Save ${formatMinorAmount(summary.annualSavingsMinor, annual.currency, locale)} (${Math.round(summary.annualSavingsPercent ?? 0)}%).`
    : "";

  return `${equivalent} / month equivalent, billed annually.${savings}`;
}
