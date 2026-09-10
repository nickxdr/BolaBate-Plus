// Firebase initialization for BolaBate+ cloud sync
// Note: the apiKey below is a public identifier (not a secret) — access control
// is enforced by Firestore Security Rules (see firestore.rules).
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { Capacitor } from "@capacitor/core";

export const firebaseConfig = {
  apiKey: "AIzaSyAQpRUQKM3-S_EKsbkPu3bEEUbWU0K0mPs",
  authDomain: "bola-bate-plus.firebaseapp.com",
  projectId: "bola-bate-plus",
  storageBucket: "bola-bate-plus.firebasestorage.app",
  messagingSenderId: "828299661968",
  appId: "1:828299661968:web:1d4611e0155f7e78f07e15",
};

export const ADMIN_UID = "ArLRIkCZT7VNTa7nmvpjUOGpoWh2";

// Dev/local and prod share this one Firebase project (same Auth users, same
// security rules) but must NEVER share the same data document — see
// cloudSync.js, which picks "cloud/state-dev" instead of "cloud/state" when
// this is true. Add other standing preview hostnames here if you create more.
const DEV_HOSTNAMES = ["localhost", "127.0.0.1", "bola-bate-plus-develop.vercel.app"];

// Capacitor's Android/iOS WebView serves the packaged app from "https://localhost" by
// default (capacitor.config.json sets no explicit server.hostname) — the exact same
// hostname used above to detect the local `npm run dev` server. Without this check,
// every built APK/IPA would be misdetected as dev and silently write to
// cloud/state-dev instead of the real cloud/state, no matter how it was built.
const isNativeApp = Capacitor.isNativePlatform();

export const IS_DEV_ENVIRONMENT =
  !isNativeApp &&
  (Boolean(import.meta.env.DEV) ||
    (typeof window !== "undefined" && DEV_HOSTNAMES.includes(window.location.hostname)));

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline-first Firestore: works offline, syncs when the connection returns.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
