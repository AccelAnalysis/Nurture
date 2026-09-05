/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_FIREBASE_FUNCTIONS_REGION?: string;
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_USE_EMULATORS?: string;
  readonly VITE_AUTH_GOOGLE_ENABLED?: string;
  readonly VITE_AUTH_APPLE_ENABLED?: string;
  readonly VITE_AUTH_ANONYMOUS_ENABLED?: string;
}
