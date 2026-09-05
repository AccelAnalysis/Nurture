export { app, auth, db, firebaseConfigured, storage } from "../../firebase";

// This module is the stable Firebase client boundary for feature owners.
// It intentionally re-exports the existing modular SDK initialization rather
// than creating another Firebase app or another project configuration.
