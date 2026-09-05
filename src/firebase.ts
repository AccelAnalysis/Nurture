import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { DEMO_MODE, FIREBASE_PROJECT_ID, USE_EMULATORS } from './config/runtime';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (USE_EMULATORS ? 'local-emulator-key' : undefined),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (USE_EMULATORS ? 'localhost' : undefined),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    (USE_EMULATORS ? `${FIREBASE_PROJECT_ID}.firebasestorage.app` : undefined),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || (USE_EMULATORS ? 'local-emulator-app' : undefined),
};
let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;
let functions: Functions | undefined;
let initializationError: string | null = null;
const complete = Boolean(config.apiKey && config.authDomain && config.appId && config.storageBucket);
if (!DEMO_MODE) {
  if (config.projectId !== FIREBASE_PROJECT_ID)
    initializationError = 'This application must use Firebase project nurture-12398.';
  else if (!complete)
    initializationError =
      'Firebase client configuration is missing. Configure the existing project environment; demo mode is an explicit separate build.';
  else {
    try {
      if (USE_EMULATORS && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname))
        throw new Error('Emulators are restricted to local development hosts.');
      const existing = getApps().length > 0;
      if (existing && getApp().options.projectId !== FIREBASE_PROJECT_ID)
        throw new Error('The existing Firebase app belongs to a different project.');
      app = existing ? getApp() : initializeApp(config);
      auth = getAuth(app);
      db = getFirestore(app);
      storage = getStorage(app);
      functions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1');
      if (USE_EMULATORS && !existing) {
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        connectFirestoreEmulator(db, '127.0.0.1', 8080);
        connectStorageEmulator(storage, '127.0.0.1', 9199);
        connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      }
    } catch (error) {
      initializationError = error instanceof Error ? error.message : 'Firebase initialization failed.';
      auth = undefined;
      db = undefined;
      storage = undefined;
      functions = undefined;
    }
  }
}
const firebaseConfigured = !DEMO_MODE && complete && !initializationError;
export { app, auth, db, storage, functions, firebaseConfigured, initializationError };
