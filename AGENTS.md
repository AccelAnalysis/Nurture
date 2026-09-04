# Nurture agent instructions

## Firebase

Always look for and use the appropriate official Firebase agent skill before performing Firebase work. The Firebase project for this repository is `nurture-12398`.

Use `npx -y firebase-tools@latest` for Firebase CLI operations rather than a globally installed or unversioned `firebase` command.

For this web app, use classic Firebase Hosting unless the architecture explicitly changes to a framework/SSR requirement that calls for Firebase App Hosting.

Use the Firebase modular Web SDK. Keep Firebase client configuration environment-specific. Never commit server credentials or service-account JSON.

## Payments and communications

Stripe integration must begin in test mode. Keep Stripe secret/restricted keys and webhook secrets server-side only.

Twilio Auth Tokens/API Key secrets and SendGrid `SG.*` API keys are server-side secrets. Never expose them in browser bundles or `VITE_*` environment variables.
