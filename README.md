# Nurture

Nurture is a configurable application foundation: **Configurable Shell + Pluggable Experience + Lifecycle Engine**. The Experience can be anything; Nurture owns the customer lifecycle around it.

## Product specification — start here

The canonical target definition is [`docs/product/nurture-product-spec.md`](docs/product/nurture-product-spec.md). Read it before building or changing architecture. It preserves the owner's 33-section baseline and separates the configurable shell from the Experience and lifecycle engine.

See the [product documentation index](docs/product/README.md) for the Experience module contract, lifecycle model, Apple HIG / Nurture design requirements, linked stock-media and YouTube requirements, release plan, and acceptance tests.

The repository specification is authoritative for builds; chat is a working session for proposed changes. Target requirements are not claims that the features are implemented. Earlier business-management/CRM concepts may become Experiences, but are not the Nurture shell itself.

## Core stack

- **Firebase / Firestore** — hosting, authentication, database, storage, functions, messaging, analytics, feature controls, and monitoring
- **Stripe** — payments and subscriptions
- **Twilio + SendGrid** — SMS and email communications
- **GitHub** — source control and CI/CD
- **nurture.accelanalysis.com** — production domain

## Brand system

The shared Nurture brand system lives in [`brand/`](brand/README.md). It contains the canonical Nurture **N** logo, platform-neutral design tokens, CSS variables and glass-material fallbacks, accessibility rules, and a static visual preview.

All app modules and future builds should consume the shared brand assets rather than creating local copies of colors, radii, typography, glass values, or logo artwork.

## Firebase project

Project ID: `nurture-12398`

Use the current Firebase CLI through `npx -y firebase-tools@latest` for Firebase commands.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app intentionally starts even before Firebase web configuration is populated. Once the Firebase web app is registered, place the returned public web SDK configuration in `.env.local`.

## Register the Firebase web app

```bash
npx -y firebase-tools@latest login
npx -y firebase-tools@latest use nurture-12398
npx -y firebase-tools@latest apps:create web Nurture --project nurture-12398
npx -y firebase-tools@latest apps:sdkconfig <APP_ID> --project nurture-12398
```

Map the returned values into `.env.local` using `.env.example` as the template.

> Firebase web SDK configuration is public application configuration. Stripe secret keys, Twilio Auth Tokens/API secrets, and SendGrid API keys are server-side secrets and must never be committed or exposed through `VITE_*` variables.

## Build and Firebase Hosting

```bash
npm run build
npm run firebase:emulate
npm run firebase:preview
npm run firebase:deploy
```

The Hosting target is the existing Firebase project `nurture-12398`. After the first successful deployment, connect `nurture.accelanalysis.com` as the custom domain in Firebase Hosting and add the DNS records Firebase provides at the `accelanalysis.com` DNS provider.

## Current bootstrap status

- GitHub repository configured
- React + TypeScript + Vite app shell
- Firebase modular web SDK wired for Auth, Firestore, and Storage
- Firebase Hosting configuration bound to `nurture-12398`
- CI build workflow included
- Stripe account connected externally; payment implementation will remain in test mode until the billing stage is built
- Twilio account established; SendGrid requires its own `SG.*` API key and domain authentication before production email
