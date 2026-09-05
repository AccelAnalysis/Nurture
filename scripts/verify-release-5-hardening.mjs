import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = resolve(process.env.R5_BUILD_ROOT ?? '.release-5-test');
const load = (path) => import(pathToFileURL(resolve(root, path)).href);
const { calculateMetrics } = await load('shared/analytics/measurement/engine.js');
const { queryAnalytics } = await load('functions/src/analytics/service.js');
const time = '2026-08-31T00:00:00.000Z';
const query = (id) => ({ organizationId: 'org-a', dataMode: 'test', from: '2026-08-01T00:00:00.000Z', to: '2026-08-10T00:00:00.000Z', observationDays: 7, metricIds: [id], filters: {}, currency: 'USD' });
const result = calculateMetrics(query('commercial.current-active'), {
  events: [], calculatedAt: time,
  coverage: { 'subscriptions.current': { organizationId: 'org-a', dataMode: 'test', bindingVersion: 1, from: '2026-07-01T00:00:00.000Z', through: time, checkedAt: time, complete: true } },
  currentSubscriptions: { organizationId: 'org-a', dataMode: 'test', observedAt: time, complete: true, records: [{ id: 'bad', organizationId: 'org-a', status: 'invalid', trustedAt: time, currency: 'USD', offerId: 'primary' }] },
})[0];
assert.equal(result.status, 'unavailable');
assert.equal(result.value, null);
console.log('PASS D: malformed subscription status is unavailable, not silently zero active');

let reads = 0;
const ports = {
  authorize: async (_org, _uid, capability) => { if (capability === 'billing.view') throw new Error('permission-denied'); },
  gate: () => ({ ready: true, acceptedR4Sha: 'fixture-only', reason: null }),
  read: async () => { reads++; throw new Error('Source reader must not be reached'); },
  saveDerived: async () => { throw new Error('Write must not be reached'); },
  now: () => time,
};
for (const id of ['automation.purchase-association', 'retention.payment-recovered']) await assert.rejects(queryAnalytics(query(id), 'manager', ports), /permission-denied/);
assert.equal(reads, 0);
console.log('PASS E: indirect paid-outcome metrics require billing permission before source reads');

const source = (path) => readFileSync(resolve(path), 'utf8');
const endpoints = source('functions/src/analytics/endpoints.ts');
const registry = source('shared/analytics/measurement/registry.ts');
const billing = source('functions/src/billing/webhook.ts');
const rules = source('firestore.rules');
const backend = source('.github/workflows/firebase-backend.yml');
const hosting = source('.github/workflows/firebase-hosting.yml');
const release = source('shared/analytics/measurement/release.ts');

assert.match(release, /2f721595030dfd300d99753de5f8d2d7b4213abd/);
assert.match(endpoints, /collection\("customers"\)/);
assert.match(endpoints, /linkedLeadId/);
assert.match(endpoints, /collection\("acquisitionEnrollments"\)/);
assert.match(endpoints, /collection\("release3Runs"\)/);
assert.match(endpoints, /collection\("communicationMessages"\)/);
assert.match(endpoints, /collection\("referralAttributions"\)/);
assert.match(endpoints, /collection\("surveyResponses"\)/);
assert.match(endpoints, /subscriptions\.opening/);
assert.match(endpoints, /subscriptions\.closing/);
assert.doesNotMatch(endpoints, /_analyticsControls/);
for (const canonical of ['survey.invitation_created', 'survey.service_recovery_started', 'communication.provider_accepted', 'payment.collected', 'payment.refunded']) assert.ok(registry.includes(canonical), `missing canonical R5 source ${canonical}`);
for (const obsolete of ['survey.invited', 'survey.service_recovery_requested', 'customer.reactivated', 'customer.reengaged', 'winback.enrolled']) assert.equal(registry.includes(`"${obsolete}"`), false, `obsolete alias remains: ${obsolete}`);
assert.match(billing, /invoice\.paid/);
assert.match(billing, /invoice\.payment_failed/);
assert.match(billing, /refund\.created/);
assert.match(billing, /payment\.collected/);
assert.match(billing, /payment\.refunded/);
assert.match(billing, /_billingPaymentMappings/);
assert.match(rules, /match \/organizations\/\{organizationId\}\/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
assert.match(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
assert.match(backend, /verify-release-5\.mjs/);
assert.match(backend, /queryOrganizationAnalytics/);
assert.match(hosting, /release:'5-integration'/);
assert.match(hosting, /verify-release-5-browser\.mjs/);
console.log('PASS E/F: accepted R2-R4 sources, privacy boundaries, payment ledger binding, and fail-closed Firebase promotion are composed into R5');

console.log('Release 5: 3 additional hardening/source-composition checks passed.');
