// Cloud sync for BolaBate+ — mirrors the local store into a single Firestore
// document (cloud/state). Admins push changes; everyone else subscribes and
// receives live updates. Firestore's offline cache keeps the app usable with
// bad signal, syncing automatically when the connection returns.
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { auth, db, ADMIN_UID } from "./firebase.js";
import {
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

const CLOUD_DOC = doc(db, "cloud", "state");
const PUSH_DEBOUNCE_MS = 600;

let storeRef = null;
let lastWriteId = null; // echoes of our own writes are ignored
let pushTimer = null;
let pushInFlight = null;
let started = false;

function serialize(store) {
  return {
    players: store.players,
    activePelada: store.activePelada,
    history: store.history,
    monthlyStats: store.monthlyStats,
    savedAt: new Date().toISOString(),
    savedBy: auth.currentUser ? auth.currentUser.uid : "unknown",
    writeId: `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

function applyRemote(data) {
  const store = storeRef;
  if (!store) return;

  // Ignore the echo of our own push
  if (data.writeId && data.writeId === lastWriteId) return;

  try {
    if (Array.isArray(data.players) && data.players.length > 0) {
      store.players = data.players;
    }
    if (data.activePelada && data.activePelada.status) {
      store.activePelada = data.activePelada;
    }
    if (Array.isArray(data.history)) {
      store.history = data.history;
    }
    if (data.monthlyStats && typeof data.monthlyStats === "object") {
      store.monthlyStats = data.monthlyStats;
    }
    store.hydrateMonthlyStats();
    store.syncCareerStatsFromMonthly({ silent: true });
    store.persistLocal(); // cache for offline; does NOT re-push to cloud
    store.notify();
  } catch (err) {
    console.error("[cloud] Error applying remote state:", err);
  }
}

async function doPush(store) {
  if (!store.isAdmin) return; // Security Rules also block non-admin writes
  const payload = serialize(store);
  lastWriteId = payload.writeId;
  try {
    pushInFlight = setDoc(CLOUD_DOC, payload, { merge: false });
    await pushInFlight;
    pushInFlight = null;
    setStatus("online");
  } catch (err) {
    pushInFlight = null;
    console.error("[cloud] Push failed:", err);
    setStatus("error", err.message);
  }
}

function schedulePush(store) {
  if (!store.isAdmin) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => doPush(store), PUSH_DEBOUNCE_MS);
}

function setStatus(status, detail) {
  if (storeRef && storeRef._setCloudStatus)
    storeRef._setCloudStatus(status, detail);
}

/** Debounced push hook — called from store.save() on every mutation. */
export function scheduleCloudPush(store) {
  schedulePush(store);
}

export function initCloudSync(store) {
  if (started) return;
  started = true;
  storeRef = store;

  // Track auth state → sets store.isAdmin (admin UID) or anonymous (read-only).
  // Firebase persists the session automatically, so a returning admin stays
  // logged in across page refreshes and app restarts. We only fall back to
  // anonymous sign-in when there is NO restored session at all.
  onAuthStateChanged(auth, (user) => {
    const newIsAdmin = !!user && user.uid === ADMIN_UID;
    const newUserType = user ? (newIsAdmin ? "admin" : "anon") : null;
    const roleChanged = store.isAdmin !== newIsAdmin || store.cloudUserType !== newUserType;

    store.isAdmin = newIsAdmin;
    store.cloudUserType = newUserType;
    setStatus(newIsAdmin ? "admin" : user ? "online" : "connecting");

    // Only re-render the views when the role actually changed (login/logout).
    // Re-rendering on every auth tick caused a visible screen flash.
    if (roleChanged) store.notify();

    if (!user) {
      // First visit or explicit logout → anonymous read-only access
      signInAnonymously(auth).catch((err) => {
        console.error("[cloud] Anonymous sign-in failed:", err);
        setStatus("error", err.message);
      });
    }
  });

  // Live subscription — every signed-in device receives updates instantly
  onSnapshot(
    CLOUD_DOC,
    (snap) => {
      if (!snap.exists()) {
        setStatus(store.isAdmin ? "admin" : "empty");
        return;
      }
      setStatus(store.isAdmin ? "admin" : "online");
      applyRemote(snap.data());
    },
    (err) => {
      console.error("[cloud] Subscription error:", err);
      setStatus("error", err.message);
    },
  );
}

/** Push the current local state to the cloud immediately (admin only). */
export async function pushStateNow(store) {
  if (!store.isAdmin) {
    throw new Error("Apenas administradores podem enviar dados para a nuvem.");
  }
  clearTimeout(pushTimer);
  await doPush(store);
}

/** Admin email/password login. */
export async function loginAdmin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logoutAdmin() {
  // Going back to anonymous read-only access
  await signOut(auth);
  await signInAnonymously(auth).catch(() => {});
}

/** Used by the migration helper: checks whether the cloud doc already exists. */
export async function cloudStateExists() {
  const snap = await getDoc(CLOUD_DOC);
  return snap.exists();
}
