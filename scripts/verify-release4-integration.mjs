import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const failures = [];
const requireCondition = (condition, message) => { if (!condition) failures.push(message); };

const [bootstrap, contracts, events, rewards, functionsIndex, router, hosting, backend, release3Contracts, release3Runtime] = await Promise.all([
  read("functions/src/feedback/bootstrap.ts"),
  read("shared/feedback/contracts.ts"),
  read("shared/analytics/contracts.ts"),
  read("functions/src/feedback/rewards.ts"),
  read("functions/src/index.ts"),
  read("src/app/routing/AppRouter.tsx"),
  read(".github/workflows/firebase-hosting.yml"),
  read(".github/workflows/firebase-backend.yml"),
  read("shared/release3/contracts.ts"),
  read("functions/src/lifecycle/release3-runtime.ts"),
]);

requireCondition(bootstrap.includes('RELEASE4_R3_BASE_SHA = "7dfc66c1892c44661d77869865d94a08ad82e95f"'), "Release 4 must pin the merged Release 3 base commit.");
requireCondition(contracts.includes('SurveyPrivacy = "identified" | "anonymous"'), "Survey privacy modes are missing.");
requireCondition(contracts.includes('ReferralStatus = "attributed"') && contracts.includes('"qualified"') && contracts.includes('"reversed"'), "Referral attribution/qualification/reversal states are incomplete.");
for (const event of ["survey.completed", "survey.nps.promoter", "survey.nps.detractor", "referral.created", "referral.qualified", "referral.reward_issued", "referral.reward_reversed"]) {
  requireCondition(events.includes(`"${event}"`) && events.slice(events.indexOf(`"${event}"`), events.indexOf(`"${event}"`) + 220).includes('allowedSources: ["trusted_server"]'), `${event} must be registered as trusted-server sourced.`);
}
requireCondition(rewards.includes('scope.dataMode === "test" || scope.dataMode === "development"'), "Reward execution must remain test/development only.");
requireCondition(rewards.includes('Live incentives remain disabled'), "Live incentive denial must remain explicit.");
for (const fn of ["feedbackCommand", "r4GetFeedbackRuntimeControl", "r4SetFeedbackRuntimeControl", "r4QualifyReferralOnSubscription"]) requireCondition(functionsIndex.includes(fn), `Missing Release 4 Function export: ${fn}.`);
for (const route of ["/survey", "/app/referrals", 'section === "surveys"', 'section === "referrals"']) requireCondition(router.includes(route), `Missing Release 4 route/surface: ${route}.`);
requireCondition(router.includes('route.path === "/app/settings" ? <CustomerLifecyclePreferencesPage />'), "Release 3 participant settings route must remain intact.");
requireCondition(release3Contracts.includes('"survey"') && release3Contracts.includes('"referral"'), "Release 4 treatment kinds are not composed into the accepted lifecycle contract.");
requireCondition(release3Runtime.includes('executeFeedbackInApp') && release3Runtime.includes('createRelease4FeedbackComposition'), "Release 4 feedback treatments are not composed through the durable lifecycle worker.");
const hostingProvenanceIsAdditive = hosting.includes("release:'4-integration'") || hosting.includes("release:'5-integration'");
requireCondition(
  hostingProvenanceIsAdditive
    && hosting.includes("VITE_RELEASE4_BACKEND_READY")
    && hosting.includes("VITE_FIREBASE_APP_CHECK_SITE_KEY")
    && hosting.includes("backendActivated"),
  "Hosting provenance must preserve the Release 4 backend/App Check activation gate under later-release provenance.",
);
requireCondition(backend.includes("R4_FEEDBACK_TOKEN_KEY_V1") && backend.includes("feedbackCommand") && backend.includes("r4QualifyReferralOnSubscription"), "Backend deployment workflow is missing Release 4 secret/export readiness checks.");

if (failures.length) {
  console.error("Release 4 integration acceptance failed:");
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("Release 4 integration acceptance passed: exact R3 base, survey/referral contracts, trusted events, test-only rewards, routes, worker composition, and Firebase promotion gates are present, including additive later-release Hosting provenance.");
