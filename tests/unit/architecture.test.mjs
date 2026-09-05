import assert from 'node:assert/strict';
import test from 'node:test';
import { can, isRole, membershipId, rolePermissions, permissions } from '../../src/domain/permissions.ts';
import { createUserProfile } from '../../src/domain/defaults.ts';
import {
  createAttribution,
  safeReturnPath,
  validateSequence,
  validateSurvey,
} from '../../src/domain/validation.ts';
import {
  stripeAdapter,
  twilioAdapter,
  sendGridAdapter,
  sequenceScheduler,
  invitationAdapter,
} from '../../functions/src/integrations.ts';
const membership = (role, status = 'active') => ({
  id: 'a_u',
  organizationId: 'a',
  userId: 'u',
  role,
  status,
  displayName: 'Example',
  invitedBy: null,
  invitedAt: null,
  joinedAt: null,
});
test('owners and administrators have every declared capability', () => {
  for (const role of ['owner', 'administrator'])
    for (const permission of permissions) assert.equal(can(membership(role), permission), true);
});
test('ordinary members never receive administrative navigation permissions', () => {
  for (const permission of permissions) assert.equal(can(membership('member'), permission), false);
});
test('managers cannot manage members, organization settings, referrals or billing', () => {
  for (const permission of ['members:manage', 'organization:manage', 'billing:manage'])
    assert.equal(can(membership('manager'), permission), false);
  assert.equal(can(membership('manager'), 'people:manage'), true);
});
test('unknown roles and inactive memberships fail closed', () => {
  for (const role of ['superuser', '__proto__', 'toString']) {
    assert.equal(isRole(role), false);
    assert.equal(can(membership(role), 'workspace:view'), false);
  }
  for (const status of ['invited', 'suspended'])
    assert.equal(can(membership('owner', status), 'workspace:view'), false);
  assert.equal(can(null, 'workspace:view'), false);
});
test('permissions are explicitly declared and membership IDs remain deterministic', () => {
  for (const values of Object.values(rolePermissions))
    assert.ok(values.every((value) => permissions.includes(value)));
  assert.equal(membershipId('org-a', 'user-a'), 'org-a_user-a');
});
test('neutral profiles grant no organization, referral benefit, or marketing permission', () => {
  const profile = createUserProfile(
    { uid: 'u', email: 'a@example.test', displayName: 'A', isAnonymous: false, emailVerified: false },
    new Date('2026-09-04T12:00:00Z'),
  );
  assert.equal(profile.defaultOrganizationId, null);
  assert.equal(profile.onboardingStatus, 'notStarted');
  assert.equal(profile.preferences.emailMarketing, false);
  assert.equal(profile.preferences.smsMarketing, false);
  assert.equal(profile.referredBy, undefined);
});
test('safe return paths preserve intended internal routes and query strings', () => {
  for (const path of [
    '/app',
    '/app/experience',
    '/org/demo-org/contacts?view=all',
    '/invite/token',
    '/onboarding',
  ])
    assert.equal(safeReturnPath(path), path);
});
test('external, encoded traversal, control-character, and scheme redirects are rejected', () => {
  for (const path of [
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/app/../../contact',
    '/app/%2e%2e/contact',
    '/app%5cevil',
    '/app\n/evil',
    '/not-an-app',
  ])
    assert.equal(safeReturnPath(path), '/app');
});
test('referral capture is untrusted, bounded, and expires after 30 days', () => {
  const now = new Date('2026-09-04T12:00:00Z');
  const record = createAttribution('NURTURE-DEMO', 'x'.repeat(200), 'y'.repeat(200), now);
  assert.equal(record.verification, 'pending');
  assert.equal(record.source.length, 80);
  assert.equal(Date.parse(record.expiresAt) - now.getTime(), 30 * 86400000);
  assert.equal(record.referringOrganizationId, undefined);
});
test('malformed referral codes are not captured', () => {
  for (const code of ['', 'ab', 'a'.repeat(65), '<script>', 'user@example.test', 'a/b', 'a b'])
    assert.equal(createAttribution(code), null);
});
const sequence = () => ({
  id: 's',
  organizationId: 'o',
  name: 'After an experience',
  trigger: 'experienceCompleted',
  status: 'draft',
  enabled: false,
  steps: [0, 2, 7, 21, 45].map((delayDays, i) => ({
    id: `step-${i}`,
    name: `Step ${i}`,
    delayDays,
    kind: 'email',
    templateId: 't',
    consentPurpose: 'marketing',
  })),
  timeZone: 'America/New_York',
  quietHours: { start: '20:00', end: '09:00' },
  frequencyCapPerDay: 2,
  stopOnConversion: true,
  version: 1,
  createdAt: '',
  updatedAt: '',
});
test('sequence delays are absolute offsets in nondecreasing order', () => {
  assert.equal(validateSequence(sequence()), null);
  const value = sequence();
  value.steps[2].delayDays = 1;
  assert.match(validateSequence(value), /ascending/);
});
test('negative and fractional sequence delays are rejected', () => {
  for (const offset of [-1, 1.5, 366]) {
    const value = sequence();
    value.steps[0].delayDays = offset;
    assert.ok(validateSequence(value));
  }
});
test('sequence settings validate quiet hours, caps, unique IDs and time zones', () => {
  for (const patch of [
    { frequencyCapPerDay: 0 },
    { timeZone: 'not-a-zone' },
    { quietHours: { start: '24:00', end: '09:00' } },
    { enabled: true },
  ])
    assert.ok(validateSequence({ ...sequence(), ...patch }));
  const value = sequence();
  value.steps[1].id = value.steps[0].id;
  assert.ok(validateSequence(value));
});
test('publishing requires referenced templates and relevant survey/offer identifiers', () => {
  const value = sequence();
  value.status = 'published';
  value.enabled = true;
  assert.equal(validateSequence(value), null);
  value.steps[0].templateId = null;
  assert.ok(validateSequence(value));
});
const survey = () => ({
  id: 's',
  organizationId: 'o',
  title: 'Your experience',
  description: '',
  status: 'draft',
  questions: [{ id: 'q', type: 'singleChoice', title: 'What next?', required: false, options: ['A', 'B'] }],
  completionMessage: 'Thank you',
  visibility: 'private',
  version: 1,
  createdAt: '',
  updatedAt: '',
});
test('surveys require a title, questions and valid unique choice options', () => {
  assert.equal(validateSurvey(survey()), null);
  assert.ok(validateSurvey({ ...survey(), title: '' }));
  assert.ok(validateSurvey({ ...survey(), questions: [] }));
  const value = survey();
  value.questions[0].options = ['A', 'A'];
  assert.ok(validateSurvey(value));
  value.questions[0].options = ['A', ''];
  assert.ok(validateSurvey(value));
});
test('server adapters fail explicitly instead of pretending to send or charge', async () => {
  for (const call of [
    () => stripeAdapter.createTestCheckout(),
    () => twilioAdapter.send(),
    () => sendGridAdapter.send(),
    () => sequenceScheduler.dispatchDue(),
    () => invitationAdapter.accept(),
  ])
    await assert.rejects(call, /not implemented/);
});
