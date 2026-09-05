import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateAnnualPricing,
  describeAnnualComparison,
} from "../../../shared/billing/pricing.js";
import type { OfferPrice } from "../../../shared/billing/contracts.js";

function price(interval: "month" | "year", unitAmountMinor: number): OfferPrice {
  return {
    id: `test-${interval}`,
    interval,
    currency: "usd",
    unitAmountMinor,
    provider: "stripe",
    active: true,
  };
}

test("annual pricing uses 12M - A and A / 12", () => {
  const result = calculateAnnualPricing(4900, 49900);
  assert.equal(result.annualAtMonthlyRateMinor, 58800);
  assert.equal(result.annualSavingsMinor, 8900);
  assert.ok(Math.abs((result.annualSavingsPercent ?? 0) - (8900 / 58800) * 100) < 0.000001);
  assert.equal(result.equivalentMonthlyMinor, 4158);
  assert.equal(result.advertisesSavings, true);
});

test("zero-price offers never divide by zero or advertise savings", () => {
  const result = calculateAnnualPricing(0, 0);
  assert.equal(result.annualSavingsMinor, 0);
  assert.equal(result.annualSavingsPercent, null);
  assert.equal(result.equivalentMonthlyMinor, 0);
  assert.equal(result.advertisesSavings, false);
});

test("annual pricing at or above twelve monthly charges does not advertise savings", () => {
  const result = calculateAnnualPricing(1000, 12000);
  assert.equal(result.annualSavingsMinor, 0);
  assert.equal(result.annualSavingsPercent, null);
  assert.equal(result.advertisesSavings, false);
  assert.match(describeAnnualComparison(price("month", 1000), price("year", 12000)) ?? "", /billed annually/i);
  assert.doesNotMatch(describeAnnualComparison(price("month", 1000), price("year", 12000)) ?? "", /save/i);
});

test("minor-unit validation rejects fractional or negative amounts", () => {
  assert.throws(() => calculateAnnualPricing(10.5, 100));
  assert.throws(() => calculateAnnualPricing(100, -1));
});
