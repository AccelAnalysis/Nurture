import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const external = process.env.RELEASE_SMOKE_BASE_URL ?? process.env.R1_SMOKE_BASE_URL;
const base = external ?? 'http://127.0.0.1:4173';
const server = external ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173'], { stdio: 'ignore' });
let browser;
let page;
const errors = [];
const output = 'test-results/release-2';
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
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  const routeChecks = [
    '/', '/offers', '/offers/primary', '/experience', '/experience/deep-dive', '/register', '/sign-in', '/app/experience',
    '/org/nurture-demo/admin/brand-site', '/org/nurture-demo/admin/customers', '/org/nurture-demo/admin/lifecycle',
    '/org/nurture-demo/admin/communications', '/platform', '/platform/operations',
  ];
  for (const route of routeChecks) {
    console.log(`Checking ${route}`);
    await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.innerText.trim().length > 80);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} must not overflow horizontally`);
    results.push({ route, destination: new URL(page.url()).pathname, meaningfulContent: true });
  }
  for (const protectedRoute of ['/org/nurture-demo/admin/customers', '/org/nurture-demo/admin/lifecycle', '/org/nurture-demo/admin/communications', '/platform/operations']) {
    await page.goto(`${base}${protectedRoute}`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/sign-in?**');
    assert.equal(new URL(page.url()).pathname, '/sign-in', `${protectedRoute} must remain behind the trusted identity boundary in the fail-closed production bundle`);
  }
  await page.goto(base);
  await page.locator('h1').waitFor();
  assert.match(await page.evaluate(() => getComputedStyle(document.body).fontFamily), /sans-serif/, 'Canonical system typography must be applied.');
  assert.equal(await page.locator('.public-header .header-actions > a.button').evaluate((button) => getComputedStyle(button).color), 'rgb(255, 255, 255)', 'Primary header CTA must preserve contrasting white text.');
  assert.equal(await page.locator('img[src="/brand/logo/nurture-n.svg"]').first().evaluate((img) => img.complete && img.naturalWidth > 0), true, 'Canonical N logo must load.');
  await page.screenshot({ path: `${output}/home-desktop.png`, fullPage: true });
  console.log('Checking reference Experience completion');
  await page.goto(`${base}/experience`, { waitUntil: 'domcontentloaded' });
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
  await writeFile(`${output}/results.json`, JSON.stringify({
    base,
    release: '2-integration',
    passed: true,
    routes: results,
    pageErrors: errors,
    tested: ['public completion', 'registration handoff', 'N logo', 'desktop/mobile reflow', 'R2 protected-route fail-closed behavior', 'demo-role forgery rejected', 'local configuration forgery ignored', 'unavailable account form disabled'],
    notTested: ['real authentication', 'Firestore rules', 'durable acquisition store/worker', 'R2 lifecycle projection persistence', 'real SendGrid delivery/callback', 'Stripe checkout/webhook', 'durable configuration publishing', 'real YouTube playback'],
  }, null, 2));
  console.log('Release 2 Hosting browser checks passed. Backend/provider acceptance remains separate.');
} catch (error) {
  if (page) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${output}/failure.json`, JSON.stringify({ url: page.url(), error: String(error), pageErrors: errors, body: await page.locator('body').innerText().catch(() => 'unavailable'), results }, null, 2));
    console.error('Browser failure at', page.url(), 'page errors:', errors);
    console.error(await page.locator('body').innerText().catch(() => 'unavailable'));
  }
  throw error;
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
