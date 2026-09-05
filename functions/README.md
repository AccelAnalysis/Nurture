# Server integration boundaries

This directory contains strict TypeScript contracts and deliberately unavailable adapters, **not deployed function handlers**. No Functions resource is provisioned, no runtime dependency is installed, and no live external call is made. The existing Firebase project remains `nurture-12398`.

When implementing the first feature, use the appropriate official Firebase agent skills, confirm the existing Functions region/runtime and database edition, then add handlers to the established project. Do not run a replacement-project initialization. Add runtime dependencies only for that feature and test against emulators.

Every callable must validate Firebase Auth (including verified email where relevant), App Check where appropriate, tenant membership/permission, input schemas, and idempotency independently of Firestore Rules. Admin SDK operations bypass Security Rules. Client-provided role, owner, price, entitlement, organization affiliation, referral ownership, or reward status is never authoritative.

Secrets belong in Functions Secret Manager bindings. Stripe starts in test mode. SendGrid and Twilio adapters must enforce consent, suppression, sender verification, recipient local send windows, caps, provider webhook signature verification, idempotent delivery records, and bounded retries. Never log credentials, invitation tokens, message bodies, or unnecessary personal information.

Invitation acceptance needs a transaction that consumes a hashed single-use token and creates an explicit membership for the verified recipient email. Organization creation and ownership transfer are separate protected workflows. Survey and feedback submission need rate/size/type limits; file content must be validated on the server. Reward issuance and reversals need a server-owned ledger; no monetary payouts are part of this skeleton.
