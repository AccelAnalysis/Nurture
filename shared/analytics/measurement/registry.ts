import type { Dimension, EventSelector, MetricDefinition, MetricDomain, SubjectUnit } from "./contracts.js";

export const REGISTRY_VERSION = "5.1.0";
export const CALCULATION_VERSION = "5.1.0";
const trusted = ["trusted_server", "domain_action", "provider_webhook", "scheduler", "administrator"] as const;
const financial = ["trusted_server", "provider_webhook"] as const;
const observed = [...trusted, "browser"] as const;
const common = "UTC half-open periods [from,to); exact event/idempotency deduplication; only the selected tenant and live/test mode. Unknown history is not zero.";
const dimensions: Record<MetricDomain, readonly Dimension[]> = {
  acquisition: ["acquisitionSource"], activation: ["experienceId", "experienceModuleId", "experienceModuleVersion"],
  experience: ["experienceId", "experienceModuleId", "experienceModuleVersion"], commercial: ["offerId"],
  automation: ["automationId", "automationVersion"], satisfaction: ["surveyId", "surveyVersion"],
  referrals: ["referralProgramId", "referralProgramVersion"], retention: ["offerId"],
};
export const event = (eventType: string, trust: "trusted" | "financial" | "observed" = "trusted"): EventSelector => ({ eventType, sources: trust === "financial" ? financial : trust === "observed" ? observed : trusted });
function count(metricId: string, name: string, domain: MetricDomain, owner: MetricDefinition["owner"], selector: EventSelector, subject: SubjectUnit = "customer"): MetricDefinition {
  return {
    metricId, version: 1, owner, domain, name,
    description: `Distinct ${subject === "event" ? "accepted events" : subject + " keys"} with ${selector.eventType} during the selected period.`,
    unit: "count", calculation: "count", subject, selectors: [selector], sources: [selector.eventType], dimensions: dimensions[domain],
    permissions: ["analytics.view", ...(domain === "commercial" ? ["billing.view" as const] : domain === "satisfaction" ? ["surveys.view" as const] : domain === "referrals" ? ["referrals.view" as const] : [])],
    numerator: `Distinct ${subject} keys for ${selector.eventType}.`, denominator: null, timeBasis: "occurredAt", limitations: [common],
  };
}
function cohort(metricId: string, name: string, domain: MetricDomain, owner: MetricDefinition["owner"], entry: EventSelector, outcome: EventSelector, subject: SubjectUnit = "customer"): MetricDefinition {
  const def = count(metricId, name, domain, owner, entry, subject);
  return { ...def, calculation: "cohort-rate", unit: "percent", timeBasis: "cohort-entry", outcome, defaultObservationDays: 7,
    sources: [entry.eventType, outcome.eventType],
    description: `First ${entry.eventType} per ${subject} in the entry window, followed by ${outcome.eventType} within the observation window.`,
    numerator: `Entry subjects with a subsequent ${outcome.eventType} before their observation deadline.`,
    denominator: `Distinct ${subject} keys entering through ${entry.eventType} in the selected entry window.`,
    limitations: [common, "One entry per subject per selected window; not a lifetime-first cohort. Outcomes before entry do not count. Immature rates stay null; observed counts and pending follow-ups remain visible. Attribution is association, not causal lift."],
  };
}
const c = (id: string, name: string, type: string, subject: SubjectUnit = "customer", observedSource = false) => count(id, name, "acquisition", "C", event(type, observedSource ? "observed" : "trusted"), subject);
const a = (id: string, name: string, entry: string, outcome: string) => cohort(id, name, "acquisition", "C", event(entry), event(outcome));
const list: MetricDefinition[] = [
  c("acquisition.visitors", "Tracked visitors", "public.page_viewed", "visitor", true),
  c("acquisition.ctas", "CTA selections", "public.cta_selected", "event", true),
  c("acquisition.leads", "Leads created", "lead.created", "lead"),
  c("acquisition.registrations", "Registrations completed", "registration.completed"),
  c("acquisition.verified", "Verified identities", "identity.verified", "identity"),
  c("acquisition.onboarding-started", "Onboarding starts", "onboarding.started"),
  c("acquisition.onboarding-completed", "Onboarding completions", "onboarding.completed"),
  { ...a("acquisition.lead-registration", "Lead-to-registration cohort", "lead.created", "registration.completed"), sources: ["lead.created", "registration.completed", "identity.links"] },
  a("acquisition.registration-onboarding", "Registration-to-onboarding cohort", "registration.completed", "onboarding.completed"),
  a("acquisition.onboarding-completion", "Onboarding completion cohort", "onboarding.started", "onboarding.completed"),
  { ...a("acquisition.onboarding-hours", "Median time to onboarding", "onboarding.started", "onboarding.completed"), calculation: "median-duration", unit: "hours", numerator: "Median elapsed hours among observed completers.", limitations: [common, "Median among completers only, not all entrants. Immature cohorts are partial; no completers means unavailable value."] },
  count("experience.secondary", "Secondary Experience participants", "experience", "B", { ...event("experience.milestone_reached"), where: { slot: "secondary" } }),
  count("experience.started", "Experience participants", "experience", "B", event("experience.started", "observed")),
  count("experience.meaningful", "Meaningfully active participants", "experience", "B", event("experience.milestone_reached")),
  count("experience.premium-requests", "Premium capability requests", "experience", "B", event("experience.premium_feature_requested", "observed")),
  count("experience.reference-deep-dive", "Reference deep-dive participants", "experience", "B", event("experience.reference-assessment.deep_dive_completed")),
  cohort("activation.registration", "Registration-to-activation cohort", "activation", "B", event("registration.completed"), event("experience.milestone_reached")),
  cohort("activation.onboarding", "Onboarding-to-activation cohort", "activation", "B", event("onboarding.completed"), event("experience.milestone_reached")),
  count("commercial.offer-views", "Offer views", "commercial", "D", event("offer.viewed", "observed"), "event"),
  count("commercial.checkouts", "Checkout starts", "commercial", "D", event("checkout.started", "observed"), "event"),
  count("commercial.purchases", "Verified purchasing customers", "commercial", "D", event("checkout.completed", "financial")),
  count("commercial.subscriptions", "New subscriptions", "commercial", "D", event("subscription.started", "financial"), "subscription"),
  cohort("commercial.checkout-conversion", "Checkout-to-purchase cohort", "commercial", "D", event("checkout.started", "observed"), event("checkout.completed", "financial")),
  count("commercial.renewals", "Renewed subscriptions", "commercial", "D", event("subscription.renewed", "financial"), "subscription"),
  count("commercial.cancellations", "Cancellation events", "commercial", "D", event("subscription.cancelled", "financial"), "subscription"),
];
for (const [suffix, label, type] of [
  ["enrolled", "Automation enrollments", "automation.enrolled"], ["suppressed", "Suppressed runs", "automation.suppressed"],
  ["cancelled", "Cancelled runs", "automation.cancelled"], ["scheduled", "Scheduled actions", "automation.action_scheduled"],
] as const) list.push(count(`automation.${suffix}`, label, "automation", "F", event(type), "run"));
for (const [suffix, label] of [["attempted", "Attempted messages"], ["sent", "Sent messages"], ["delivered", "Delivered messages"], ["failed", "Failed messages"], ["responded", "Responded messages"]] as const) {
  list.push(count(`communication.${suffix}`, label, "automation", "F", event(`communication.${suffix}`), "communication"));
}
list.push(cohort("automation.purchase-association", "Post-delivery purchase association", "automation", "F", event("communication.delivered"), event("checkout.completed", "financial")));
list.push(count("satisfaction.invited", "Survey invitations", "satisfaction", "F", event("survey.invited"), "invitation"));
list.push(count("satisfaction.responses", "Survey responses", "satisfaction", "F", event("survey.completed"), "invitation"));
list.push(cohort("satisfaction.response-rate", "Survey response cohort", "satisfaction", "F", event("survey.invited"), event("survey.completed"), "invitation"));
list.push({ ...count("satisfaction.nps", "Net Promoter Score", "satisfaction", "F", { ...event("survey.completed"), where: { questionType: "nps" } }, "invitation"), calculation: "nps", unit: "score", valueField: "npsScore", numerator: "Promoters (9–10) minus detractors (0–6).", denominator: "Valid integer NPS answers 0–10, one per invitation.", limitations: [common, "Question type and answer mapping require the accepted survey contract. No private answer text is returned. NPS is not an anonymity claim."] });
list.push(count("satisfaction.recovery", "Service recovery handoffs", "satisfaction", "F", event("survey.service_recovery_requested"), "invitation"));
for (const [suffix, label, type] of [
  ["created", "Attributed referrals", "referral.created"], ["qualified", "Qualified referrals", "referral.qualified"],
  ["rewarded", "Rewarded referrals", "referral.reward_issued"], ["reversed", "Reversed referral rewards", "referral.reward_reversed"],
] as const) list.push(count(`referrals.${suffix}`, label, "referrals", "F", event(type, suffix === "rewarded" || suffix === "reversed" ? "financial" : "trusted"), "referral"));
list.push(cohort("referrals.qualification", "Referral qualification cohort", "referrals", "F", event("referral.created"), event("referral.qualified"), "referral"));
list.push(count("retention.reactivated", "Reactivated customers", "retention", "F", event("customer.reactivated")));
list.push(count("retention.reengaged", "Re-engaged customers", "retention", "F", event("customer.reengaged")));
list.push(count("retention.winback-enrolled", "Win-back enrollments", "retention", "F", event("winback.enrolled")));
list.push(cohort("retention.winback", "Win-back reactivation cohort", "retention", "F", event("winback.enrolled"), event("customer.reactivated")));
list.push(count("retention.payment-recovered", "Recovered payments", "retention", "D", event("payment.recovered", "financial"), "subscription"));
for (const [id, label, type] of [["collected", "Cash collected", "payment.collected"], ["refunded", "Cash refunded", "payment.refunded"]] as const) {
  list.push({ ...count(`commercial.${id}`, label, "commercial", "D", event(type, "financial"), "transaction"), calculation: "sum", unit: "minor", valueField: "amountMinor", numerator: `Sum of trusted ${type} amounts in the selected currency.`, limitations: [common, "Currency required; integer minor units. Not recognized revenue or MRR. Requires a reviewed payment ledger mapping, not subscription.started or a return URL."] });
}
list.push({ ...list.find((d) => d.metricId === "commercial.collected")!, metricId: "commercial.net-collected", name: "Net cash collected", calculation: "net-collected", selectors: [event("payment.collected", "financial"), event("payment.refunded", "financial")], sources: ["payment.collected", "payment.refunded"], numerator: "Cash collected minus cash refunded in this period and currency; refunds may refer to earlier receipts." });
list.push({ ...count("commercial.current-mrr", "Current base-plan MRR", "commercial", "D", event("subscription.updated", "financial"), "subscription"), calculation: "current-mrr", unit: "minor/month", selectors: [], sources: ["subscriptions.current"], timeBasis: "current-snapshot", numerator: "Active fixed-price base amounts: monthly + annual/12, summed before rounding.", limitations: [common, "Current snapshot, not historical period revenue. One fixed base plan per subscription; before discounts, taxes, metering, proration and usage adjustments. Trials/past-due excluded; scheduled cancellation remains until no longer active. No FX conversion."] });
list.push({ ...list.find((d) => d.metricId === "commercial.current-mrr")!, metricId: "commercial.current-active", name: "Current active subscriptions", calculation: "current-subscriptions", unit: "count", numerator: "Distinct active subscriptions in the trusted current snapshot." });
for (const [calc, name] of [["churn", "Opening-base subscription churn"], ["retention", "Opening-base subscription retention"]] as const) {
  list.push({ ...count(`commercial.${calc}`, name, "commercial", "D", event("subscription.updated", "financial"), "subscription"), calculation: calc, unit: "percent", selectors: [], sources: ["subscriptions.opening", "subscriptions.closing"], timeBasis: "opening-closing-snapshots", numerator: calc === "churn" ? "Opening active subscription IDs not active at close." : "Opening active subscription IDs still active at close.", denominator: "Distinct active subscriptions at period opening; new period subscriptions excluded.", limitations: [common, "Requires complete as-of opening and closing snapshots. Cancellation counts alone cannot establish churn. Reactivated opening subscriptions active at close are retained. Subscription-level, not customer-level churn."] });
}
for (const definition of list) {
  const commercialSource = [...definition.selectors, ...(definition.outcome ? [definition.outcome] : [])].some((selector) => /^(checkout\.completed|subscription\.|payment\.)/.test(selector.eventType));
  if ((definition.owner === "D" || commercialSource) && !definition.permissions.includes("billing.view")) definition.permissions = [...definition.permissions, "billing.view"];
  // Cross-event filters use cohort-entry attributes. Outcome need not repeat acquisition/campaign context.
  if (definition.calculation === "cohort-rate" || definition.calculation === "median-duration") definition.limitations = [...definition.limitations, "Filters select cohort entry records, not outcome records. Version filters never relabel historical events."];
}
if (new Set(list.map((d) => d.metricId)).size !== list.length) throw new Error("Duplicate metric IDs");
export const METRIC_REGISTRY: readonly MetricDefinition[] = Object.freeze(list.map((d) => Object.freeze(d)));
export const METRICS_BY_ID: ReadonlyMap<string, MetricDefinition> = new Map(METRIC_REGISTRY.map((d) => [d.metricId, d]));
export const LIFECYCLE_STAGES = [
  { id: "marketing", name: "Marketing", metrics: ["acquisition.visitors", "acquisition.leads"] },
  { id: "offers", name: "Offers", metrics: ["commercial.offer-views", "commercial.purchases"] },
  { id: "registration", name: "Registration + Onboarding", metrics: ["acquisition.registrations", "acquisition.onboarding-completed"] },
  { id: "primary", name: "App Experience", metrics: ["experience.started", "experience.meaningful"] },
  { id: "secondary", name: "Secondary Experience", metrics: ["experience.secondary"] },
  { id: "recurring", name: "Upsell / Recurring Offer", metrics: ["experience.premium-requests", "commercial.renewals"] },
  { id: "feedback", name: "Feedback + Referral", metrics: ["satisfaction.responses", "referrals.qualified"] },
] as const;
