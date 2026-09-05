import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const external = process.env.R1_SMOKE_BASE_URL;
const base = external ?? 'http://127.0.0.1:4173';
const server = external ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173'], { stdio: 'ignore' });
let browser;
const output = 'test-results/release-1';
const results = [];
try {
  await mkdir(output, { recursive: true });
  let started = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) { started = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(started, 'The application must respond before browser verification.');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const route of ['/', '/offers', '/offers/primary', '/experience', '/experience/deep-dive', '/register', '/sign-in', '/app/experience', '/org/nurture-demo/admin/brand-site', '/platform']) {
    await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.trim().length > 80);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} must not overflow horizontally`);
    results.push({ route, destination: new URL(page.url()).pathname, meaningfulContent: true });
  }
  await page.goto(base);
  await page.locator('h1').waitFor();
  assert.equal(await page.locator('img[src="/brand/logo/nurture-n.svg"]').first().evaluate((img) => img.complete && img.naturalWidth > 0), true, 'Canonical N logo must load.');
  await page.screenshot({ path: `${output}/home-desktop.png`, fullPage: true });
  await page.goto(`${base}/experience`);
  for (const choice of ['Very clear', 'Strong momentum', 'A focused prompt']) await page.getByRole('button', { name: choice, exact: true }).click();
  await page.getByRole('heading', { name: 'You have a clearer signal for what to do next.' }).waitFor();
  await page.screenshot({ path: `${output}/experience-complete.png`, fullPage: true });
  await page.getByRole('button', { name: 'Create account to continue', exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/app/experience/review');
  assert.equal(new URL(page.url()).searchParams.get('organizationId'), 'nurture-demo');
  assert.equal(await page.getByRole('button', { name: 'Create account', exact: true }).isDisabled(), true);
  await page.evaluate(() => {
    sessionStorage.setItem('nurture-demo-role', 'owner');
    sessionStorage.setItem('nurture-demo-platform-role', 'administrator');
    localStorage.setItem('nurture:organization-configuration:v1:nurture-demo', JSON.stringify({ organizationId: 'nurture-demo', publication: { configurationVersionId: 'forged' }, versions: [{ id: 'forged', effectiveConfiguration: { brand: { applicationName: 'FORGED PUBLIC BRAND' } } }] }));
  });
  await page.goto(`${base}/platform`);
  await page.waitForURL('**/sign-in?**');
  assert.equal(await page.getByRole('button', { name: 'Platform admin demo' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).isDisabled(), true);
  await page.goto(base);
  assert.equal(await page.getByText('FORGED PUBLIC BRAND').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/offers', '/experience', '/register']) {
    await page.goto(`${base}${route}`);
    await page.waitForFunction(() => document.body.innerText.trim().length > 80);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} must reflow at 390px`);
    await page.screenshot({ path: `${output}/${route.slice(1) || 'home'}-mobile.png`, fullPage: true });
  }
  assert.deepEqual(errors, [], 'The browser must not throw application errors.');
  await writeFile(`${output}/results.json`, JSON.stringify({ base, passed: true, routes: results, pageErrors: errors, tested: ['public completion', 'registration handoff', 'N logo', 'desktop/mobile reflow', 'demo-role forgery rejected', 'local configuration forgery ignored', 'unavailable account form disabled'], notTested: ['real authentication', 'Firestore rules', 'Stripe checkout/webhook', 'durable configuration publishing', 'real YouTube playback'] }, null, 2));
  console.log('Release 1 Hosting browser checks passed. Backend acceptance remains separate.');
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
