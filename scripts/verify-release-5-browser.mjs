import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from '@playwright/test';

const output = 'test-results/release-5';
await mkdir(output, { recursive: true });
// Dedicated harness is never linked from the production router or imported by its entrypoint.
const server = await createServer({ configFile: false, root: resolve('tests/release5'), plugins: [react()], server: { host: '127.0.0.1', port: 4175, strictPort: true, fs: { allow: [process.cwd()] } } });
let browser, page;
const errors = [], passed = [];
try {
  await server.listen();
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4175');
  const card = (name) => page.getByRole('article', { name, exact: true });
  await card('Registrations completed').locator('.r5-value').filter({ hasText: '3' }).waitFor();
  assert.equal(await page.locator('.r5-stages button').count(), 7);
  await page.getByRole('button', { name: /Secondary Experience/ }).click();
  await card('Secondary Experience participants').waitFor();
  assert.equal(await card('Meaningfully active participants').count(), 0);
  await page.getByRole('button', { name: 'Show all lifecycle measures' }).click();
  passed.push('seven-stage view with separate secondary Experience and return paths');
  await card('Attributed referrals').locator('.r5-status').filter({ hasText: 'unavailable' }).waitFor();
  assert.match(await card('Attributed referrals').locator('.r5-value').innerText(), /—/);
  await card('Registrations completed').getByText('Definition and data lineage', { exact: true }).click();
  assert.match(await card('Registrations completed').innerText(), /registration.completed/);
  passed.push('missing source is unavailable, definitions and sources are inspectable');
  await page.getByLabel('Data mode', { exact: true }).selectOption('test');
  await page.getByText('Test records only — not production performance', { exact: false }).waitFor();
  await card('Registrations completed').locator('.r5-status').filter({ hasText: 'available' }).waitFor();
  passed.push('live/test mode and refreshed results remain explicit');
  await page.getByRole('button', { name: 'Switch fixture role' }).click();
  assert.equal(await card('Current base-plan MRR').count(), 0);
  passed.push('financial cards excluded without billing permission');
  await page.getByRole('button', { name: 'Switch fixture role' }).click();
  await card('Registrations completed').locator('.r5-value').filter({ hasText: '3' }).waitFor();
  await page.getByRole('button', { name: 'Toggle delayed fixture' }).click();
  await page.getByRole('button', { name: 'Refresh metrics' }).click();
  await page.waitForTimeout(350); // Request for A is now in flight.
  await page.getByRole('button', { name: 'Switch fixture organization' }).click();
  await card('Registrations completed').locator('.r5-value').filter({ hasText: '1' }).waitFor();
  await page.waitForTimeout(1600);
  assert.match(await card('Registrations completed').locator('.r5-value').innerText(), /^1\D/);
  passed.push('late response from prior tenant cannot replace current-tenant results');
  await page.getByRole('button', { name: 'Toggle R4 fixture gate' }).click();
  await page.getByRole('button', { name: 'Refresh metrics' }).click();
  await page.getByText('Release 4 fixture gate is closed.', { exact: false }).first().waitFor();
  assert.match(await card('Registrations completed').locator('.r5-value').innerText(), /—/);
  passed.push('closed R4 gate has no fabricated numeric performance');
  await page.getByRole('button', { name: 'Toggle demo fixture' }).click();
  await page.getByText('Demo session: real analytics is unavailable.', { exact: false }).waitFor();
  assert.match(await card('Registrations completed').locator('.r5-value').innerText(), /—/);
  passed.push('demo sessions cannot borrow live results');
  await page.screenshot({ path: `${output}/analytics-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/analytics-mobile-${scheme}.png`, fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByLabel('Start date (UTC)', { exact: true }).focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName === 'INPUT'), true);
  passed.push('mobile light/dark, reduced motion, enlarged text, semantic keyboard controls');
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ passed, pageErrors: errors, kind: 'isolated component fixture', notTested: ['real Firebase authentication', 'App Check', 'Firestore rules', 'R4 source binding', 'production data'] }, null, 2));
  console.log('Release 5 browser fixture checks passed:', passed.join('; '));
} catch (error) {
  if (page) await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${output}/failure.json`, JSON.stringify({ error: String(error), errors, passed }, null, 2));
  throw error;
} finally { await browser?.close(); await server.close(); }
