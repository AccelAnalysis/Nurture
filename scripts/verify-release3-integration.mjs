import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const failures = [];
function requireCondition(condition, message) { if (!condition) failures.push(message); }

const [contracts, projections, runtime, admin, functionIndex, router, rules, indexes] = await Promise.all([
  read("shared/release3/contracts.ts"),
  read("shared/release3/retention-projections.ts"),
  read("functions/src/lifecycle/release3-runtime.ts"),
  read("functions/src/lifecycle/release3-admin.ts"),
  read("functions/src/index.ts"),
  read("src/app/routing/AppRouter.tsx"),
  read("firestore.rules"),
  read("firestore.indexes.json"),
]);

requireCondition(contracts.includes('export type LifecycleChannel = "email" | "in-app"'), "Release 3 channel contract must stay email/in-app only; SMS is not approved.");
requireCondition(!contracts.includes('LifecycleChannel = "email" | "sms"'), "SMS must not enter the Release 3 lifecycle action contract.");
requireCondition(projections.includes('"payment.failed": { allowedSources: ["provider_webhook", "trusted_server"]'), "Payment health must remain provider/server authoritative.");
requireCondition(projections.includes('event.eventType === "subscription.renewed"') && projections.includes('event.source === "provider_webhook" || event.source === "trusted_server"'), "Subscription state must remain provider/server authoritative.");
requireCondition(runtime.includes('if (effect.action.type === "email")') && runtime.includes('reason: "channel-not-ready"'), "Outbound lifecycle email must remain hard-held in the Release 3 worker.");
requireCondition(runtime.includes('commercial-handoff') && runtime.includes('never mutates billing'), "Commercial handoff must not mutate billing/entitlement state.");
requireCondition(admin.includes('assertOrganizationCapability') && admin.includes('getOrganizationCustomer'), "Release 3 callables must retain organization-admin and customer-scope authorization boundaries.");
requireCondition(functionIndex.includes('r3ProjectLifecycleEvent') && functionIndex.includes('r3DrainLifecycleRuns') && functionIndex.includes('r3RequestCancellation'), "Cloud Functions export surface is incomplete for Release 3.");
requireCondition(router.includes('RetentionLifecycleStudioPage') && router.includes('ExperienceRetentionHost'), "Release 3 organization and Experience routing is not composed.");
requireCondition(rules.includes('match /organizations/{organizationId}/{document=**}') && rules.includes('allow read, write: if false;'), "Organization Firestore state must remain browser-inaccessible.");
requireCondition(indexes.includes('"collectionGroup": "release3Runs"') && indexes.includes('"dueAt"'), "Durable Release 3 worker query index is missing.");

const release3Sources = [contracts, projections, runtime, admin].join("\n");
requireCondition(!/survey/i.test(release3Sources), "Surveys are outside Release 3 and must not be composed into its contract/runtime.");
requireCondition(!/referral/i.test(release3Sources), "Referrals are outside Release 3 and must not be composed into its contract/runtime.");
requireCondition(!/release5|release 5/i.test(release3Sources), "Release 5 analytics must not be composed into Release 3.");

if (failures.length) {
  console.error("Release 3 integration acceptance failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Release 3 integration acceptance passed: canonical contract, trust boundaries, fail-closed outbound behavior, routing, Functions exports, rules, and durable runtime index are composed.");
