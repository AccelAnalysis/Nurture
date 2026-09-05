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
  await expect(page.locator('h1')).toHaveText('Thank you for sharing.');
  await expect(page.getByText(/does not subscribe you to marketing/)).toBeVisible();
});
test('referral context survives public experience and anonymous registration', async ({ page }) => {
  await page.goto('/r/NURTURE-DEMO?campaign=community');
  await page.getByRole('link', { name: 'Explore Nurture' }).click();
  await page.getByRole('link', { name: 'Start an experience', exact: true }).click();
  await page.getByRole('button', { name: 'Try as a guest' }).click();
  await expect(page.getByText(/Your guest identity is ready/)).toBeVisible();
  const uid = await page.evaluate(() => JSON.parse(sessionStorage.getItem('nurture:demo:identity')!).uid);
  await page.getByRole('link', { name: 'Save progress with an account' }).click();
  await expect(page.getByText('Your referral connection is preserved.')).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('new.person@example.test');
  await page.getByLabel('Password', { exact: true }).fill('NurtureDemo123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL('/onboarding');
  await page.getByLabel('Display name').fill('New Person');
  await page.getByRole('button', { name: 'Save and begin' }).click();
  await expect(page).toHaveURL('/app');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('nurture:demo:identity')!).uid)).toBe(uid);
  await expect(page.getByRole('link', { name: 'Organization', exact: true })).toHaveCount(0);
});
test('feedback dialog supports keyboard dismissal and return focus; sign out returns to public', async ({
  page,
}) => {
  await enter(page);
  await page.goto('/app');
  const feedback = page.getByRole('button', { name: 'Share feedback', exact: true });
  await feedback.click();
  const dialog = page.getByRole('dialog', { name: 'Share your perspective' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(feedback).toBeFocused();
  await feedback.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(feedback).toBeFocused();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=/);
});
test('representative pages pass accessibility scans and screenshots', async ({ page }, testInfo) => {
  await page.goto('/');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/home-${testInfo.project.name}.png`, fullPage: true });
  await enter(page);
  await page.screenshot({ path: `test-results/overview-${testInfo.project.name}.png`, fullPage: true });
  const scans = [
    ['/org/demo-org/contacts', 'contacts'],
    ['/org/demo-org/sequences/post-experience', 'sequence'],
    ['/survey/demo-survey', 'survey'],
  ];
  for (const [path, name] of scans) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/${name}-${testInfo.project.name}.png`, fullPage: true });
  }
  await page.goto('/app');
  const feedback = page.getByRole('button', { name: 'Share feedback', exact: true });
  await feedback.click();
  const dialog = page.getByRole('dialog', { name: 'Share your perspective' });
  await dialog.getByLabel('What would you like us to know?').fill('A thoughtful next connection.');
  await dialog.getByRole('button', { name: 'Save demo feedback' }).click();
  await expect(dialog.getByRole('status')).toContainText('Feedback preview saved in demo memory');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await page.goto('/app/settings');
  await page.getByLabel('Appearance').selectOption('dark');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.goto('/app');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/customer-dark-${testInfo.project.name}.png`, fullPage: true });
});
test('production has public pages, no demo bypass, and a clear unconfigured-auth state', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByText('Demo workspace', { exact: true })).toHaveCount(0);
  await page.goto('http://127.0.0.1:4174/demo?demo=true');
  await expect(page.getByText('Demo mode is not enabled in this build.')).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.setItem(
      'nurture:demo:identity',
      JSON.stringify({ uid: 'demo-owner', isAnonymous: false, emailVerified: true, displayName: 'Owner' }),
    ),
  );
  await page.goto('http://127.0.0.1:4174/app?demo=true');
  await expect(page.getByText(/Firebase configuration is not available/)).toBeVisible();
  await page.goto('http://127.0.0.1:4174/login');
  await expect(page.getByText('Firebase is not configured for this environment.')).toBeVisible();
});
