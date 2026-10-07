import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// `npm run dev:local` sets this to run against the local emulators instead of a real project.
const EMULATORS = import.meta.env.VITE_EMULATORS === "1";

// Everyone shares one login; the group only ever types the password.
export const GROUP_EMAIL = "group@tagledger.app";
// A second login, kept by the owner, that can also restore backups.
export const ADMIN_EMAIL = "admin@tagledger.app";
// The database rules enforce the same 1 hour (see firestore.rules).
export const LOCK_MS = 60 * 60 * 1000;

async function loadConfig() {
  const env = import.meta.env;
  if (EMULATORS) return { apiKey: "demo", projectId: "demo-tag-ledger", appId: "demo" };
  if (env.VITE_FIREBASE_API_KEY) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    };
  }
  // Firebase Hosting serves the project's web config at this address.
  const res = await fetch("/__/firebase/init.json");
  if (!res.ok) throw new Error("no config");
  return res.json();
}

export const firebaseReady = loadConfig().then((config) => {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (EMULATORS) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  return { auth, db };
});
