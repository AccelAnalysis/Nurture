import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getMetadata } from 'firebase/storage';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST)
  throw new Error('Rules tests require Firestore AND Storage emulators. Never run against live services.');
let environment;
const stamp = Timestamp.fromMillis(1700000000000);
const profile = (uid) => ({
  uid,
  email: `${uid}@example.test`,
  displayName: uid,
  firstName: '',
  lastName: '',
  photoURL: null,
  phone: null,
  status: 'active',
  createdAt: stamp,
  updatedAt: stamp,
  onboardingStatus: 'notStarted',
  defaultOrganizationId: null,
  preferences: {
    theme: 'system',
    timeZone: 'UTC',
    emailMarketing: false,
    smsMarketing: false,
    inAppNotifications: true,
  },
});
const context = (uid, verified = true) =>
  environment.authenticatedContext(uid, {
    email: `${uid}@example.test`,
    email_verified: verified,
    firebase: { sign_in_provider: 'password' },
  });
const database = (uid, verified = true) => context(uid, verified).firestore();
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'nurture-12398',
    firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 9199, rules: await readFile('storage.rules', 'utf8') },
  });
  await environment.clearFirestore();
  await environment.clearStorage();
  await environment.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    for (const uid of [
      'owner',
      'administrator',
      'manager',
      'member',
      'other',
      'unverified',
      'suspended',
      'mismatch',
    ])
      await setDoc(doc(db, `users/${uid}`), profile(uid));
    for (const id of ['org-a', 'org-b'])
      await setDoc(doc(db, `organizations/${id}`), {
        id,
        name: id,
        status: 'active',
        ownerId: id === 'org-a' ? 'owner' : 'other',
      });
    for (const [uid, role] of [
      ['owner', 'owner'],
      ['administrator', 'administrator'],
      ['manager', 'manager'],
      ['member', 'member'],
      ['unverified', 'owner'],
      ['suspended', 'owner'],
    ])
      await setDoc(doc(db, `organizationMemberships/org-a_${uid}`), {
        organizationId: 'org-a',
        userId: uid,
        role,
        status: uid === 'suspended' ? 'suspended' : 'active',
      });
    await setDoc(doc(db, 'organizationMemberships/org-b_other'), {
      organizationId: 'org-b',
      userId: 'other',
      role: 'owner',
      status: 'active',
    });
    await setDoc(doc(db, 'organizationMemberships/org-a_mismatch'), {
      organizationId: 'org-b',
      userId: 'mismatch',
      role: 'owner',
      status: 'active',
    });
    for (const id of ['org-a', 'org-b']) {
      for (const path of [
        'contacts/c1',
        'sequences/s1',
        'surveys/s1',
        'surveys/s1/responses/r1',
        'messageTemplates/t1',
        'invitations/i1',
        'subscriptions/sub1',
        'referralRewards/reward1',
      ])
        await setDoc(doc(db, `organizations/${id}/${path}`), { organizationId: id, status: 'active' });
    }
    await setDoc(doc(db, 'publicOffers/published'), {
      status: 'published',
      visibility: 'public',
      name: 'Public offer',
    });
    await setDoc(doc(db, 'publicOffers/draft'), {
      status: 'draft',
      visibility: 'public',
      name: 'Draft offer',
    });
    await setDoc(doc(db, 'publicSurveys/published'), {
      status: 'published',
      visibility: 'public',
      title: 'Public survey',
    });
    await setDoc(doc(db, 'publicSurveys/private'), {
      status: 'published',
      visibility: 'private',
      title: 'Private survey',
    });
    await uploadBytes(ref(admin.storage(), 'users/owner/feedback/example.png'), new Uint8Array([1, 2, 3]), {
      contentType: 'image/png',
    });
  });
});
after(async () => {
  if (environment) await environment.cleanup();
});
test('users can read only their own profile; profile listing is denied', async () => {
  const db = database('owner');
  await assertSucceeds(getDoc(doc(db, 'users/owner')));
  await assertFails(getDoc(doc(db, 'users/other')));
  await assertFails(getDocs(collection(db, 'users')));
});
test('unverified registered users can create a neutral own profile', async () => {
  const db = database('new-user', false);
  await assertSucceeds(
    setDoc(doc(db, 'users/new-user'), {
      ...profile('new-user'),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
});
test('profile creation cannot inject organization ownership, roles or referral benefits', async () => {
  for (const patch of [
    { defaultOrganizationId: 'org-a' },
    { role: 'owner' },
    { referredBy: { referralCode: 'FORGED' } },
    { status: 'suspended' },
    { email: 'owner@example.test' },
  ])
    await assertFails(
      setDoc(doc(database('attacker'), 'users/attacker'), {
        ...profile('attacker'),
        ...patch,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
});
test('editable preferences are allowed but immutable identity and privilege fields are not', async () => {
  const own = doc(database('owner'), 'users/owner');
  await assertSucceeds(updateDoc(own, { displayName: 'Updated owner', updatedAt: serverTimestamp() }));
  for (const patch of [
    { uid: 'other' },
    { status: 'suspended' },
    { defaultOrganizationId: 'org-b' },
    { referralCode: 'FORGED' },
    { role: 'owner' },
    { preferences: { ...profile('owner').preferences, admin: true } },
  ])
    await assertFails(updateDoc(own, { ...patch, updatedAt: serverTimestamp() }));
});
test('owner, administrator and manager can read their tenant contacts', async () => {
  for (const uid of ['owner', 'administrator', 'manager'])
    await assertSucceeds(getDocs(collection(database(uid), 'organizations/org-a/contacts')));
});
test('ordinary members, other tenants, unverified users and suspended memberships cannot read contacts', async () => {
  for (const uid of ['member', 'other', 'suspended', 'mismatch'])
    await assertFails(getDoc(doc(database(uid), 'organizations/org-a/contacts/c1')));
  await assertFails(getDoc(doc(database('unverified', false), 'organizations/org-a/contacts/c1')));
});
test('member can read its organization identity but not the other tenant', async () => {
  const db = database('member');
  await assertSucceeds(getDoc(doc(db, 'organizations/org-a')));
  await assertFails(getDoc(doc(db, 'organizations/org-b')));
});
test('membership queries must be scoped and members cannot grant themselves roles', async () => {
  const db = database('member');
  await assertSucceeds(
    getDocs(query(collection(db, 'organizationMemberships'), where('userId', '==', 'member'))),
  );
  await assertFails(getDocs(collection(db, 'organizationMemberships')));
  await assertFails(updateDoc(doc(db, 'organizationMemberships/org-a_member'), { role: 'owner' }));
  await assertFails(
    setDoc(doc(db, 'organizationMemberships/org-b_member'), {
      organizationId: 'org-b',
      userId: 'member',
      role: 'owner',
      status: 'active',
    }),
  );
});
test('only administrators can query the organization member list', async () => {
  const scoped = (uid) =>
    getDocs(
      query(collection(database(uid), 'organizationMemberships'), where('organizationId', '==', 'org-a')),
    );
  await assertSucceeds(scoped('owner'));
  await assertFails(scoped('manager'));
});
test('all organization writes are closed until trusted mutations are implemented', async () => {
  for (const uid of ['owner', 'member'])
    await assertFails(
      setDoc(doc(database(uid), 'organizations/org-a/contacts/injected'), {
        organizationId: 'org-a',
        name: 'Injected',
      }),
    );
});
test('client billing and reward writes are denied even for an owner', async () => {
  const db = database('owner');
  for (const path of [
    'organizations/org-a/subscriptions/sub1',
    'organizations/org-a/referralRewards/reward1',
    'users/owner/subscriptions/sub1',
    'referralRewards/injected',
  ])
    await assertFails(setDoc(doc(db, path), { status: 'active', rewardValue: 1000 }));
});
test('public access is limited to published, explicitly public projections', async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'publicOffers/published')));
  await assertSucceeds(getDoc(doc(db, 'publicSurveys/published')));
  await assertFails(getDoc(doc(db, 'publicOffers/draft')));
  await assertFails(getDoc(doc(db, 'publicSurveys/private')));
  await assertSucceeds(
    getDocs(
      query(
        collection(db, 'publicOffers'),
        where('status', '==', 'published'),
        where('visibility', '==', 'public'),
      ),
    ),
  );
});
test('private responses and invitations are never public; public submission writes are denied', async () => {
  const db = environment.unauthenticatedContext().firestore();
  for (const path of [
    'organizations/org-a/surveys/s1',
    'organizations/org-a/surveys/s1/responses/r1',
    'organizations/org-a/invitations/i1',
  ])
    await assertFails(getDoc(doc(db, path)));
  await assertFails(
    setDoc(doc(db, 'organizations/org-a/surveys/s1/responses/forged'), {
      organizationId: 'org-a',
      answers: {},
    }),
  );
  await assertFails(setDoc(doc(db, 'publicSurveys/forged'), { status: 'published', visibility: 'public' }));
});
test('anonymous Auth sessions cannot read or create private profiles', async () => {
  const db = environment
    .authenticatedContext('guest', { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
  await assertFails(getDoc(doc(db, 'users/owner')));
  await assertFails(
    setDoc(doc(db, 'users/guest'), {
      ...profile('guest'),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(getDoc(doc(db, 'publicOffers/published')));
});
test('a registered stranger cannot create an organization or claim its ownership', async () => {
  await assertFails(
    setDoc(doc(database('member'), 'organizations/new-org'), {
      id: 'new-org',
      status: 'active',
      ownerId: 'member',
    }),
  );
});
test('Storage stays closed until upload authorization is implemented', async () => {
  for (const ctx of [context('owner'), environment.unauthenticatedContext()]) {
    await assertFails(
      uploadBytes(ref(ctx.storage(), 'users/owner/feedback/new.png'), new Uint8Array([1]), {
        contentType: 'image/png',
      }),
    );
    await assertFails(getMetadata(ref(ctx.storage(), 'users/owner/feedback/example.png')));
  }
});
