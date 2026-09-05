import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function enter(page: Page, role = 'Organization owner') {
  await page.goto('/demo');
  await page.getByRole('button', { name: role }).click();
  await expect(page).toHaveURL(role === 'Ordinary member' ? /\/app$/ : /\/org\/demo-org$/);
  await expect(page.locator('h1')).toBeVisible();
}
async function checkPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('h1')).not.toHaveText(/Unable to continue|Something went wrong/);
  await expect(page.getByText('This page isn’t part of the journey', { exact: true })).toHaveCount(0);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
const publicPaths = [
  '/',
  '/features',
  '/how-it-works',
  '/offers',
  '/offers/welcome',
  '/offers/continuity',
  '/experience',
  '/about',
  '/help',
  '/contact',
  '/privacy',
  '/terms',
  '/accessibility',
  '/preferences',
  '/r/NURTURE-DEMO',
  '/survey/demo-survey',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/invite/demo-invite',
  '/invite/expired',
  '/invite/accepted',
  '/organizations/new',
  '/demo',
];
const customerPaths = [
  '/app',
  '/app/experience',
  '/app/secondary',
  '/app/offers',
  '/app/upgrade',
  '/app/notifications',
  '/app/feedback',
  '/app/referrals',
  '/app/profile',
  '/app/account',
  '/app/settings',
  '/app/billing',
  '/app/help',
];
const orgPaths = [
  '',
  '/dashboard',
  '/profile',
  '/members',
  '/invitations',
  '/invitations/new',
  '/roles',
  '/contacts',
  '/contacts/new',
  '/contacts/import',
  '/contacts/c-avery',
  '/contacts/c-avery/edit',
  '/lifecycle',
  '/sequences',
  '/sequences/new',
  '/sequences/post-experience',
  '/templates',
  '/templates/new',
  '/templates/template-thankYou',
  '/templates/template-sms-followup',
  '/surveys',
  '/surveys/new',
  '/surveys/demo-survey',
  '/surveys/demo-survey/preview',
  '/surveys/demo-survey/results',
  '/offers',
  '/offers/new',
  '/offers/continuity',
  '/referrals',
  '/analytics',
  '/feedback',
  '/billing',
  '/settings',
];

test('public destinations render, including all invitation states', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of publicPaths) await checkPage(page, path);
  expect(errors).toEqual([]);
});
test('all customer destinations render without an admin role', async ({ page }) => {
  await enter(page, 'Ordinary member');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of customerPaths) await checkPage(page, path);
  await expect(page.getByRole('link', { name: 'Organization', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('all organization destinations render and demo makes no external calls', async ({ page }) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4173') && !request.url().startsWith('data:'))
      external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  for (const path of orgPaths) await checkPage(page, `/org/demo-org${path}`);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
test('ordinary members and managers cannot bypass role and tenant guards', async ({ page }) => {
  await enter(page, 'Ordinary member');
  await page.goto('/org/demo-org/contacts');
  await expect(
    page.getByText('Your current role does not allow access to this part of the organization.'),
  ).toBeVisible();
  await enter(page, 'Experience manager');
  for (const path of ['/members', '/billing', '/referrals']) {
    await page.goto(`/org/demo-org${path}`);
    await expect(
      page.getByText('Your current role does not allow access to this part of the organization.'),
    ).toBeVisible();
  }
  await page.goto('/org/another-organization/contacts');
  await expect(page.getByText('You do not have access to this organization.')).toBeVisible();
});
test('contacts search and add preserve the contact-versus-user distinction', async ({ page }) => {
  await enter(page);
  await page.goto('/org/demo-org/contacts');
  await page.getByLabel('Search contacts').fill('Avery');
  await expect(page.getByRole('table').getByRole('link')).toHaveCount(1);
  await page.getByRole('link', { name: /Add contact/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('Jamie Example');
  await page.getByLabel('Email', { exact: true }).fill('jamie@example.test');
  await page.getByRole('button', { name: 'Save demo contact' }).click();
  await expect(page.locator('h1')).toHaveText('Jamie Example');
  await expect(page.getByText('Not registered / not linked')).toBeVisible();
  await expect(page.getByText('unknown', { exact: true })).toHaveCount(4);
});
test('sequence editing changes configuration, never schedules messages', async ({ page }) => {
  await enter(page);
  await page.goto('/org/demo-org/sequences/post-experience');
  await expect(page.getByText(/Every day value is measured from the trigger/)).toBeVisible();
  const delays = page.getByLabel(/Step \d+ days from trigger/);
  await expect(delays).toHaveCount(5);
  await delays.nth(1).fill('3');
  await page.getByRole('button', { name: /Save draft/ }).click();
  await expect(page.getByRole('status')).toContainText(/demo|configuration/i);
  await expect(delays.nth(1)).toHaveValue('3');
});
test('template editor previews escaped text and does not send', async ({ page }) => {
  await enter(page);
  await page.goto('/org/demo-org/templates/template-sms-followup');
  await page.getByLabel('Message body').fill('Hi {{first_name}}, <script>not executable</script>');
  await expect(page.getByText('Hi Avery, <script>not executable</script>', { exact: true })).toBeVisible();
  await expect(page.locator('script').filter({ hasText: 'not executable' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save template' }).click();
  await expect(page.getByRole('status')).toContainText('No message sent');
});
test('survey preview does not submit; public survey accepts a demo response', async ({ page }) => {
  await enter(page);
  await page.goto('/org/demo-org/surveys/demo-survey/preview');
  await page.locator('input[name="q1"][value="5"]').check();
  await page.getByRole('button', { name: 'Preview completion' }).click();
  await expect(page.getByText(/No response was submitted/)).toBeVisible();
  await page.goto('/survey/demo-survey');
  await page.locator('input[name="q1"][value="5"]').check();
  await page.getByRole('button', { name: 'Submit demo response' }).click();
  await expect(page.getByText(/saved in this demo session/)).toBeVisible();
});
test('referral survives guest registration without granting organization membership', async ({ page }) => {
  await page.goto('/r/NURTURE-DEMO');
  await page.getByRole('link', { name: 'Try an experience' }).click();
  await page.getByRole('button', { name: 'Try a guest session' }).click();
  await expect(page.getByRole('button', { name: 'Guest session active' })).toBeDisabled();
  const guestUid = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('nurture:demo:identity')!).uid as string,
  );
  await page.getByRole('link', { name: 'Create an account to continue' }).click();
  await expect(page.getByText(/Referral code NURTURE-DEMO is saved/)).toBeVisible();
  await page.getByLabel('Your name').fill('Casey Example');
  await page.getByLabel('Email', { exact: true }).fill('casey@example.test');
  await page.getByLabel('Password', { exact: true }).fill('demonstration-only');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole('link', { name: 'Do this later' }).click();
  await expect(page).toHaveURL(/\/app$/);
  const registered = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('nurture:demo:identity')!) as { uid: string; isAnonymous: boolean },
  );
  expect(registered.uid).toBe(guestUid);
  expect(registered.isAnonymous).toBe(false);
  await expect(page.getByRole('link', { name: 'Organization', exact: true })).toHaveCount(0);
});
test('feedback dialog restores focus and sign out protects routes', async ({ page }) => {
  await enter(page);
  const trigger = page.getByRole('button', { name: 'Share feedback', exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.getByLabel('Account menu').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=/);
});
test('light and dark screens pass automated accessibility checks', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.screenshot({ path: `test-results/home-${testInfo.project.name}.png`, fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations,
  ).toEqual([]);
  await enter(page);
  for (const [name, path] of [
    ['overview', '/org/demo-org'],
    ['contacts', '/org/demo-org/contacts'],
    ['sequence', '/org/demo-org/sequences/post-experience'],
    ['survey', '/survey/demo-survey'],
  ]) {
    await checkPage(page, path);
    await page.screenshot({ path: `test-results/${name}-${testInfo.project.name}.png`, fullPage: true });
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations,
    ).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await checkPage(page, '/app');
  await page.screenshot({ path: `test-results/customer-dark-${testInfo.project.name}.png`, fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations,
  ).toEqual([]);
});
test('production cannot activate demo through query or browser storage', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/');
  await page.evaluate(() =>
    sessionStorage.setItem(
      'nurture:demo:identity',
      JSON.stringify({
        uid: 'demo-owner',
        email: 'owner@example.test',
        displayName: 'Alex',
        emailVerified: true,
        isAnonymous: false,
      }),
    ),
  );
  await page.goto('http://127.0.0.1:4174/demo?demo=true');
  await expect(page.getByText('Demo mode is not enabled in this build')).toBeVisible();
  await expect(page.getByRole('button', { name: /Organization owner/ })).toHaveCount(0);
  await page.goto('http://127.0.0.1:4174/org/demo-org');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/Firebase client configuration is missing/)).toBeVisible();
});
