export type PublicRegistrationEntryPoint = "public" | "offer" | "trial" | "organization-invitation" | "referral";

export interface PublicRegistrationHandoff {
  organizationId: string;
  entryPoint?: PublicRegistrationEntryPoint;
  returnTo?: string;
  offerId?: string;
  referralCode?: string;
  source?: string;
}

function safeReturnTo(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

/**
 * Structural adapter for Track C's RegistrationHandoff query contract. Track A
 * stays decoupled from identity implementation while preserving the approved
 * public organization candidate across registration.
 */
export function buildRegistrationHandoffHref({
  organizationId,
  entryPoint = "public",
  returnTo,
  offerId,
  referralCode,
  source = "public-shell",
}: PublicRegistrationHandoff) {
  const query = new URLSearchParams();
  query.set("entryPoint", entryPoint);
  query.set("organizationId", organizationId);
  query.set("source", source);
  const safeReturn = safeReturnTo(returnTo);
  if (safeReturn) query.set("returnTo", safeReturn);
  if (offerId) query.set("offerId", offerId);
  if (referralCode) query.set("referralCode", referralCode);
  return `/register?${query.toString()}`;
}

/** Add public registration context to a configurable CTA without changing other destinations. */
export function resolvePublicHandoffHref(href: string, organizationId: string) {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const parsed = new URL(href, "https://nurture.invalid");
  if (parsed.pathname !== "/register") return href;

  const query = new URLSearchParams(parsed.search);
  if (!query.has("entryPoint")) query.set("entryPoint", "public");
  if (!query.has("organizationId")) query.set("organizationId", organizationId);
  if (!query.has("source")) query.set("source", "public-shell");
  return `${parsed.pathname}?${query.toString()}${parsed.hash}`;
}
