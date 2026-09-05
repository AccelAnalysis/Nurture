import { defineBoolean, defineSecret, defineString } from "firebase-functions/params";
import Stripe from "stripe";

export const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
export const appBaseUrl = defineString("APP_BASE_URL", {
  default: "https://nurture.accelanalysis.com",
});

/** Trials are configurable in Offer drafts but remain launch-gated by NUR-06. */
export const billingTrialsEnabled = defineBoolean("BILLING_TRIALS_ENABLED", {
  default: false,
});

export function getStripeClient() {
  const secret = stripeSecretKey.value();
  if (!secret.startsWith("sk_test_")) {
    throw new Error("Release 1 billing is test-mode only; STRIPE_SECRET_KEY must be a Stripe test secret key.");
  }
  return new Stripe(secret, {
    appInfo: {
      name: "Nurture",
      version: "release-1-track-d",
    },
  });
}

export function getApplicationBaseUrl() {
  const value = appBaseUrl.value().trim().replace(/\/$/, "");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("APP_BASE_URL must use HTTPS.");
  return parsed.origin;
}
