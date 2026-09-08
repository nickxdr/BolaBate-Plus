// Cloud sync for BolaBate+ — mirrors the local store into a single Firestore
// document (cloud/state). Admins push changes; everyone else subscribes and
// receives live updates. Firestore's offline cache keeps the app usable with
// bad signal, syncing automatically when the connection returns.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { auth, db, ADMIN_UID, firebaseConfig } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  getAuth as getSecondaryAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

const CLOUD_DOC = doc(db, "cloud", "state");
const ADMINS_COL = collection(db, "admins");

// Re-exported for the settings UI (bootstrap admin can't be removed)
export { ADMIN_UID };

/** Admin = bootstrap UID (hardcoded, first admin) OR listed in Firestore admins/. */
async function isUserAdmin(user) {
  if (!user) return false;
  if (user.uid === ADMIN_UID) return true;
  try {
    const snap = await getDoc(doc(db, "admins", user.uid));
    return snap.exists();
  } catch (err) {
    console.error("[cloud] Admin check failed:", err);
    return false;
  }
}

/** Lists all registered admins (admin-only; rules enforce). */
export async function listAdmins() {
  const snap = await getDocs(ADMINS_COL);
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
}

/**
 * Signs up a new admin (email + password) and registers them in Firestore.
 * Uses a secondary Firebase app instance so the current admin session on the
 * main app is NOT replaced by the newly created account.
 */
export async function addAdminAccount(email, password) {
  const secondaryApp = initializeApp(firebaseConfig, "admin-signup");
  const secondaryAuth = getSecondaryAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password,
    );
    const newUid = cred.user.uid;
    await setDoc(doc(db, "admins", newUid), {
      email,
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser ? auth.currentUser.uid : "unknown",
    });
    await signOut(secondaryAuth);
    return { success: true, uid: newUid };
  } catch (err) {
    let message = err.message;
    if (err.code === "auth/email-already-in-use") {
      message =
        "Este e-mail já possui conta. Se for um usuário existente, o cadastro precisa ser feito no console do Firebase.";
    } else if (err.code === "auth/weak-password") {
      message = "A senha precisa ter pelo menos 6 caracteres.";
    } else if (err.code === "auth/invalid-email") {
      message = "E-mail inválido.";
    }
    return { success: false, error: message };
  }
}

/** Removes admin privileges (cannot remove the bootstrap admin). */
export async function removeAdminAccount(uid) {
  if (uid === ADMIN_UID) {
    return {
      success: false,
      error: "O administrador raiz (bootstrap) não pode ser removido.",
    };
  }
  await deleteDoc(doc(db, "admins", uid));
  return { success: true };
}
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
  onAuthStateChanged(auth, async (user) => {
    const newIsAdmin = await isUserAdmin(user);
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
