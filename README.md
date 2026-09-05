# Nurture

A general-purpose application hub organized around a seven-stage customer lifecycle: marketing → offers → registration → primary experience → secondary experience → recurring/upgrade → feedback and referral → acquisition.

This repository retains the existing React + TypeScript + Vite frontend and Firebase infrastructure. Project: **`nurture-12398`**. Production domain: **`nurture.accelanalysis.com`**. Hosting remains Firebase Hosting; no replacement service or new Firebase project is required.

## Run the isolated walkthrough

Use Node 24, matching GitHub Actions.

```bash
npm ci
npm run dev:demo
```

Open the printed local URL and follow **Demo guide** to `/demo`. Choose Organization owner, Administrator, Experience manager, or Ordinary member. All people, prices, contacts, metrics, and messages are fictional. Edits are memory-only and reset on reload. No Firebase, Stripe, Twilio, or SendGrid request is made in demo mode.

```bash
npm run build:demo
npm run preview:demo
```

The separate demo output is `dist-demo`. Do not deploy this directory as production. `npm run build` always uses production mode; a query parameter or stored demo identity cannot enable demo authorization in that build.

## Firebase-enabled development

Copy `.env.example` to ignored `.env.local` and supply the existing Firebase application's public Web SDK configuration. Use the modular SDK. Never place server secrets or service-account credentials in Vite variables.

```bash
npm run dev
```

Public pages work even when Firebase configuration is absent; authentication explains the missing configuration. Google, Apple, and anonymous provider controls remain hidden unless explicitly configured through the corresponding flags. A flag does not enable a provider in Firebase. Confirm existing provider settings and authorized domains before using them. No provider is provisioned by the application.

### Local emulators

The official Firebase CLI is always invoked with `npx -y firebase-tools@latest`. Use Java 21 or a version supported by the current emulator tools. Set `VITE_USE_EMULATORS=true` in `.env.local`, then run the emulator suite and Vite in separate terminals:

```bash
npm run firebase:emulate
npm run dev
```

Emulators bind to loopback: Auth 9099, Firestore 8080, Storage 9199, Hosting 5000, UI 4000. Build `dist` first to review Hosting itself. Local-only fallback configuration is supplied for emulator development; it is not used for production. The Functions client integration point is present, but there are no deployable function handlers or Functions emulator in this phase.

## Checks

```bash
npm run format:check
npm run check
npm run build:demo
npx playwright install chromium
npm run test:browser
npm run test:emulators
```

`check` runs strict frontend/server-contract typechecking, unit tests, and the production build. Browser tests cover desktop/mobile routes and interaction/accessibility checks against separate local demo and production previews. Rules tests require Firestore and Storage emulator host variables; `test:emulators` supplies them and never falls back to live services.

## Architecture

- [Application structure and component boundaries](docs/ARCHITECTURE.md)
- [Complete page tree and demo paths](docs/ROUTES.md)
- [Firestore paths, ownership, timestamps, queries, and indexes](docs/FIRESTORE.md)
- [Security model, prototype rules, and release requirements](docs/SECURITY.md)
- [Implemented foundation, explicit placeholders, and next increments](docs/IMPLEMENTATION_STATUS.md)
- [Server integration contracts](functions/README.md)

The most important distinction is **User ≠ Organization Membership ≠ Experience Contact**. Contact participation and referral attribution never grant organization access. Privileged production mutations stay unavailable until a trusted, validated backend is implemented.

## Deployment

The existing production Hosting workflow remains manually triggered through GitHub Actions and uses the existing Firebase project and service-account secret reference. This skeleton does not merge or deploy itself. The Hosting-only command does not publish Firestore/Storage rules or Functions.

```bash
npm run firebase:preview
# After review and explicit release approval:
npm run firebase:deploy
```

The rules are a reviewed-test starting point, not a certification, and are not deployed by this change. Live database edition, configured providers, and deployed policies must be verified before enabling production persistence. Privacy and terms content is explicitly marked as placeholder pending approval.
