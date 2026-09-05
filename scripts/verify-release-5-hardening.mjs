import assert from 'node:assert/strict';
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
console.log('Release 5: 2 additional hardening checks passed. Controlled fixtures are not production acceptance.');
