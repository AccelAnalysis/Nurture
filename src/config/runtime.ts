export const APP_VERSION = '0.2.0-skeleton';
export const FIREBASE_PROJECT_ID = 'nurture-12398';
/** Demo builds never initialize Firebase. A production query string cannot enable demo mode. */
export const DEMO_MODE =
  import.meta.env.VITE_DEMO_MODE === 'true' && (import.meta.env.DEV || import.meta.env.MODE === 'demo');
export const USE_EMULATORS = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true';
export const providerFlags = {
  google: import.meta.env.VITE_AUTH_GOOGLE_ENABLED === 'true',
  apple: import.meta.env.VITE_AUTH_APPLE_ENABLED === 'true',
  anonymous: import.meta.env.VITE_AUTH_ANONYMOUS_ENABLED === 'true' || USE_EMULATORS,
};
