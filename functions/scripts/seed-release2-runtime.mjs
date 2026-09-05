import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) initializeApp();
const db = getFirestore();
const status = process.argv[2] || "preparing";
const commit = process.env.GITHUB_SHA || process.env.RELEASE_COMMIT || "unknown";
const now = new Date().toISOString();

await db.collection("_platformRuntime").doc("acquisition").set({
  paused: true,
  pauseReason: "release-2-backend-deployment",
  deploymentCommit: commit,
  updatedAt: now,
}, { merge: true });

await db.collection("_runtimeHealth").doc("release2").set({
  schemaVersion: 1,
  release: "2-backend",
  commit,
  status,
  backendActivated: false,
  acquisitionPaused: true,
  updatedAt: now,
}, { merge: true });

console.log(JSON.stringify({ release: "2-backend", commit, status, acquisitionPaused: true }));
