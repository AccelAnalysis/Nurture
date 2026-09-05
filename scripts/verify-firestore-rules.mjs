import assert from "node:assert/strict";

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "nurture-12398";
const authBase = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`;
const firestoreBase = `http://${process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080"}/v1/projects/${projectId}/databases/(default)/documents`;

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (value && typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])) } };
  }
  throw new Error(`Unsupported Firestore test value: ${String(value)}`);
}

function document(value) {
  return { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])) };
}

async function signUp(email) {
  const response = await fetch(`${authBase}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Release2!Rules123", returnSecureToken: true }),
  });
  if (response.status !== 200) throw new Error(`Auth emulator sign-up failed: ${await response.text()}`);
  return response.json();
}

async function firestore(path, { token, method = "GET", body } = {}) {
  return fetch(`${firestoreBase}/${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(document(body)) } : {}),
  });
}

function profile(uid, email) {
  const now = "2026-09-05T15:00:00.000Z";
  return {
    customerId: `customer_${uid}`,
    identityId: uid,
    email,
    displayName: "Rules Test",
    firstName: null,
    lastName: null,
    phone: null,
    status: "active",
    onboardingStatus: "not-started",
    preferences: { theme: "system", emailNotifications: true, smsNotifications: false, pushNotifications: true },
    createdAt: now,
    updatedAt: now,
  };
}

const alice = await signUp("alice-r2@example.test");
const bob = await signUp("bob-r2@example.test");
const alicePath = `identityCustomers/${encodeURIComponent(alice.localId)}`;

let response = await firestore(alicePath, { token: alice.idToken, method: "PATCH", body: profile(alice.localId, alice.email) });
assert.equal(response.status, 200, `owner create must succeed: ${await response.text()}`);

response = await firestore(alicePath, { token: alice.idToken });
assert.equal(response.status, 200, "owner read must succeed");

response = await firestore(`identityOnboarding/${encodeURIComponent(alice.localId)}`, {
  token: alice.idToken,
  method: "PATCH",
  body: { identityId: alice.localId, customerId: `customer_${alice.localId}`, flowId: "default", status: "in-progress" },
});
assert.equal(response.status, 200, `owner onboarding write must succeed: ${await response.text()}`);

response = await firestore(alicePath, {
  token: alice.idToken,
  method: "PATCH",
  body: { ...profile(alice.localId, alice.email), customerId: "customer_forged" },
});
assert.equal(response.status, 403, "owner must not rewrite stable customer identity");

response = await firestore(alicePath, { token: bob.idToken });
assert.equal(response.status, 403, "cross-identity read must be denied");

response = await firestore(alicePath, { token: bob.idToken, method: "PATCH", body: profile(alice.localId, alice.email) });
assert.equal(response.status, 403, "cross-identity write must be denied");

response = await firestore("organizations/org-a/lifecycleEvents/forged", {
  token: alice.idToken,
  method: "PATCH",
  body: { organizationId: "org-a", eventType: "checkout.completed", source: "provider_webhook" },
});
assert.equal(response.status, 403, "browser lifecycle authority must be denied");

response = await firestore("organizations/org-a/customers/customer-forged", {
  token: alice.idToken,
  method: "PATCH",
  body: { organizationId: "org-a", customerId: "customer-forged", status: "active" },
});
assert.equal(response.status, 403, "browser customer relationship mutation must be denied");

response = await firestore(alicePath);
assert.equal(response.status, 403, "unauthenticated identity read must be denied");

console.log("Release 2 Firestore rules negative/identity-scope checks passed.");
