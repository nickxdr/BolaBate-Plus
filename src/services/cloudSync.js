// Cloud sync for BolaBate+ — mirrors the local store into a per-pelada Firestore
// document (cloud/{peladaId} or cloud-dev/{peladaId}). Admins of that pelada push
// changes; everyone else who has entered the pelada subscribes and receives live
// updates. Firestore's offline cache keeps the app usable with bad signal, syncing
// automatically when the connection returns.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { auth, db, ADMIN_UID, isRootAdminUid, firebaseConfig, IS_DEV_ENVIRONMENT } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  getAuth as getSecondaryAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

// Dev/local writes to an entirely separate collection than prod so testing never
// touches real league data — same Firebase project, same rules, isolated data.
// Both are keyed by the real peladaId (e.g. "bolabate"), not a fixed doc name.
const STATE_COLLECTION = IS_DEV_ENVIRONMENT ? "cloud-dev" : "cloud";

function cloudDocRef(peladaId) {
  return doc(db, STATE_COLLECTION, peladaId);
}
function avatarsColRef(peladaId) {
  return collection(db, STATE_COLLECTION, peladaId, "avatars");
}
function peladaDocRef(peladaId) {
  return doc(db, "peladas", peladaId);
}
function adminsColRef(peladaId) {
  return collection(db, "peladas", peladaId, "admins");
}

// Duplicated string literals (store.js owns the canonical exported constants) —
// kept as plain consts here rather than importing store.js, to avoid a circular
// import (store.js already imports this module).
const PELADA_ID_KEY = "bolabate_pelada_id_v1";
const PELADA_NAME_KEY = "bolabate_pelada_name_v1";
const PELADA_BLOCKED_KEY = "bolabate_pelada_blocked_v1";

// Default match rules for a pelada that was just created. Mirrors store.js's defaults
// — duplicated to avoid a circular import.
const DEFAULT_MATCH_DURATION_MS = 10 * 60 * 1000;
const DEFAULT_GOALS_TO_FINISH = 2;
const DEFAULT_WIN_STREAK_TO_REST = 3;

if (IS_DEV_ENVIRONMENT) {
  console.info(`[cloud] Dev/local environment — using the "${STATE_COLLECTION}" collection (production data is untouched).`);
}

// Re-exported for the settings UI (root admins can't be removed)
export { ADMIN_UID, isRootAdminUid };

/** Admin = a root admin (hardcoded, admin of every pelada) OR listed in that pelada's admins/ subcollection. */
async function isUserAdmin(user, peladaId) {
  if (!user || !peladaId) return false;
  if (isRootAdminUid(user.uid)) return true;
  try {
    const snap = await getDoc(doc(adminsColRef(peladaId), user.uid));
    return snap.exists();
  } catch (err) {
    console.error("[cloud] Admin check failed:", err);
    return false;
  }
}

/** Lists all registered admins of a pelada (admin-only; rules enforce). */
export async function listAdmins(peladaId) {
  if (!peladaId) return [];
  const snap = await getDocs(adminsColRef(peladaId));
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
}

/**
 * Signs up a new admin (email + password) for the given pelada and registers
 * them in Firestore. Uses a secondary Firebase app instance so the current
 * admin session on the main app is NOT replaced by the newly created account.
 */
export async function addAdminAccount(email, password, peladaId) {
  // Reuse existing secondary app if one was already created (prevents
  // "duplicate app" errors on double-clicks)
  const existingApps = getApps();
  const secondaryApp = existingApps.find(a => a.name === "admin-signup") || initializeApp(firebaseConfig, "admin-signup");
  const secondaryAuth = getSecondaryAuth(secondaryApp);
  try {
    console.log("[cloud] Creating auth account for:", email);
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password,
    );
    const newUid = cred.user.uid;
    console.log("[cloud] Auth account created, UID:", newUid);
    console.log(
      "[cloud] Current main auth user:",
      auth.currentUser ? auth.currentUser.uid : "none",
    );

    const adminDocData = {
      email,
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser ? auth.currentUser.uid : "unknown",
    };
    console.log(`[cloud] Writing peladas/${peladaId}/admins/${newUid}`, adminDocData);
    await setDoc(doc(adminsColRef(peladaId), newUid), adminDocData);
    console.log("[cloud] admin doc written successfully");

    await signOut(secondaryAuth);
    return { success: true, uid: newUid };
  } catch (err) {
    console.error("[cloud] addAdminAccount FAILED:", err);
    console.error("[cloud] Error code:", err.code);
    console.error("[cloud] Error message:", err.message);
    let message = err.message;
    if (err.code === "auth/email-already-in-use") {
      message =
        "Este e-mail já possui conta. Use a opção \"Registrar conta existente (por UID)\" abaixo para conceder privilégios de admin.";
    } else if (err.code === "auth/weak-password") {
      message = "A senha precisa ter pelo menos 6 caracteres.";
    } else if (err.code === "auth/invalid-email") {
      message = "E-mail inválido.";
    } else if (
      err.code === "permission-denied" ||
      err.message?.includes("permission")
    ) {
      message =
        "Permissão negada ao registrar admin. Verifique se as regras do Firestore foram publicadas.";
    }
    return { success: false, error: message };
  }
}

/** Removes admin privileges within one pelada (cannot remove a root admin). */
export async function removeAdminAccount(uid, peladaId) {
  if (isRootAdminUid(uid)) {
    return {
      success: false,
      error: "Um administrador raiz não pode ser removido.",
    };
  }
  await deleteDoc(doc(adminsColRef(peladaId), uid));
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
    teamSize: store.teamSize,
    matchDurationMs: store.matchDurationMs,
    goalsToFinish: store.goalsToFinish,
    winLimitEnabled: store.winLimitEnabled,
    winStreakToRest: store.winStreakToRest,
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
    // A brand-new pelada's roster is legitimately empty — must still be applied,
    // not treated as "no data yet" (that used to leave a stale/seeded local
    // roster in place forever and let it get pushed back up as if real).
    if (Array.isArray(data.players)) {
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
    if (data.teamSize === 5 || data.teamSize === 6) {
      store.teamSize = data.teamSize;
    }
    if (Number.isFinite(data.matchDurationMs) && data.matchDurationMs > 0) {
      store.matchDurationMs = data.matchDurationMs;
    }
    if (Number.isFinite(data.goalsToFinish) && data.goalsToFinish > 0) {
      store.goalsToFinish = data.goalsToFinish;
    }
    if (typeof data.winLimitEnabled === "boolean") {
      store.winLimitEnabled = data.winLimitEnabled;
    }
    if (Number.isFinite(data.winStreakToRest) && data.winStreakToRest > 0) {
      store.winStreakToRest = data.winStreakToRest;
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
  if (!store.isAdmin || !store.peladaId) return; // Security Rules also block non-admin writes
  const payload = serialize(store);
  lastWriteId = payload.writeId;
  try {
    pushInFlight = setDoc(cloudDocRef(store.peladaId), payload, { merge: false });
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
  if (!store.isAdmin || !store.peladaId) return;
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

  // The Listen subscription must not start until we actually HAVE an auth
  // token (anonymous or admin) — Firestore rejects an unauthenticated Listen
  // with permission-denied, and unlike transient errors it never retries a
  // listener after that; it would stay dead for the rest of the session even
  // once sign-in completes a moment later. So we subscribe only once, from
  // inside onAuthStateChanged, the first time `user` is non-null.
  let snapshotSubscribed = false;
  function ensureSnapshotSubscription() {
    if (snapshotSubscribed) return;
    // No pelada chosen yet (splash screen hasn't completed) — nothing to
    // subscribe to. Entering a pelada reloads the page, so this function
    // runs again fresh with store.peladaId already set by then.
    if (!store.peladaId) return;
    snapshotSubscribed = true;

    // Live subscription — every signed-in device receives updates instantly
    onSnapshot(
      cloudDocRef(store.peladaId),
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

  // Watches this device's own pelada for the root admin flipping `blocked` to
  // true — takes effect immediately for anyone already logged in, not just on
  // their next visit (this is a `get`-type Listen on a single doc, which stays
  // allowed by firestore.rules' `allow get` even once the pelada is blocked, so
  // the device still finds out).
  let peladaStatusSubscribed = false;
  function ensurePeladaStatusSubscription() {
    if (peladaStatusSubscribed) return;
    if (!store.peladaId) return;
    peladaStatusSubscribed = true;
    onSnapshot(
      peladaDocRef(store.peladaId),
      (snap) => {
        if (snap.exists() && snap.data().blocked) {
          try {
            localStorage.removeItem(PELADA_ID_KEY);
            localStorage.removeItem(PELADA_NAME_KEY);
            localStorage.setItem(PELADA_BLOCKED_KEY, "1");
          } catch (e) {
            // ignore — reload still kicks them back to the login splash either way
          }
          location.reload();
        }
      },
      (err) => console.error("[cloud] Pelada status subscription error:", err),
    );
  }

  // Track auth state → sets store.isAdmin (admin UID) or anonymous (read-only).
  // Firebase persists the session automatically, so a returning admin stays
  // logged in across page refreshes and app restarts. We only fall back to
  // anonymous sign-in when there is NO restored session at all.
  onAuthStateChanged(auth, async (user) => {
    const newIsAdmin = await isUserAdmin(user, store.peladaId);
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
      return; // wait for the resulting onAuthStateChanged(user) call below
    }

    ensureSnapshotSubscription();
    ensurePeladaStatusSubscription();
  });
}

let avatarsStarted = false;

/**
 * Live-syncs player avatars — a per-pelada subcollection (anyone signed in, admin or
 * anonymous, who has entered the pelada can read/write) since customizing an avatar is
 * purely cosmetic and isn't gated like the rest of the league data. Only starts
 * listening once auth resolves, same reasoning as ensureSnapshotSubscription above (a
 * Listen with no auth token yet is rejected for good).
 */
export function initAvatarSync(store) {
  if (avatarsStarted) return;
  avatarsStarted = true;

  let subscribed = false;
  function ensureSubscription() {
    if (subscribed) return;
    if (!store.peladaId) return; // see ensureSnapshotSubscription's note above
    subscribed = true;
    onSnapshot(
      avatarsColRef(store.peladaId),
      (snap) => {
        const avatars = {};
        snap.forEach((docSnap) => {
          avatars[docSnap.id] = docSnap.data().config;
        });
        store.avatars = avatars;
        try {
          localStorage.setItem(store.avatarsKey(), JSON.stringify(avatars));
        } catch (e) {
          // ignore — in-memory state is still correct
        }
        store.notify();
      },
      (err) => console.error("[cloud] Avatar subscription error:", err),
    );
  }

  onAuthStateChanged(auth, (user) => {
    if (user) ensureSubscription();
  });
}

/** Saves one player's avatar config — callable by anyone, admin or anonymous, inside a pelada. */
export async function pushAvatarConfig(playerId, config, peladaId) {
  if (!peladaId) return;
  await setDoc(doc(avatarsColRef(peladaId), playerId), {
    config,
    updatedAt: new Date().toISOString(),
  });
}

/** Push the current local state to the cloud immediately (admin only). */
export async function pushStateNow(store) {
  if (!store.isAdmin) {
    throw new Error("Apenas administradores podem enviar dados para a nuvem.");
  }
  clearTimeout(pushTimer);
  await doPush(store);
}

/** Admin email/password login (still global to a Firebase Auth account — admin *status* is what's scoped per pelada). */
export async function loginAdmin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logoutAdmin() {
  // Going back to anonymous read-only access
  await signOut(auth);
  await signInAnonymously(auth).catch(() => {});
}

/** Clears the local admin cache (useful for troubleshooting). */
export function clearAdminCache() {
  localStorage.removeItem("bolabate_admin_cache");
}

export async function cloudStateExists(peladaId) {
  const snap = await getDoc(cloudDocRef(peladaId));
  return snap.exists();
}

// --- Pelada (tenant) login / creation ---
// The pelada id+password is a single SHARED passphrase (like a room code) — anyone
// who knows it gets into that pelada as a base "player". It's layered underneath,
// and separate from, the personal admin email/password login above. Verifying it
// requires an authenticated (even anonymous) Firestore session, since peladas/{id}
// must be readable pre-login (see firestore.rules) — waitForAuthUser covers the
// brief window before the automatic anonymous sign-in above completes.
const DEFAULT_PBKDF2_ITERATIONS = 100000;

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
function randomSaltHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
async function hashPassword(password, saltHex, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function waitForAuthUser(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    const timer = setTimeout(() => {
      unsub();
      reject(new Error("Tempo esgotado conectando. Verifique sua internet e tente novamente."));
    }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        clearTimeout(timer);
        unsub();
        resolve(user);
      }
    });
  });
}

/** Verifies a pelada login attempt (id + shared password). Does not sign anyone in — it's not a personal account. */
export async function verifyPeladaLogin(peladaId, password) {
  await waitForAuthUser();
  const snap = await getDoc(peladaDocRef(peladaId));
  if (!snap.exists()) {
    return { success: false, error: "Pelada não encontrada. Verifique o ID." };
  }
  const data = snap.data();
  const hash = await hashPassword(password, data.passwordSalt, data.iterations || DEFAULT_PBKDF2_ITERATIONS);
  if (hash !== data.passwordHash) {
    // Deliberately checked before the blocked flag below, so someone without the
    // real password can't use this to probe whether a given pelada id is blocked.
    return { success: false, error: "Senha incorreta." };
  }
  if (data.blocked) {
    return {
      success: false,
      blocked: true,
      error: "Assinatura expirada. Fale com o administrador da pelada para renovar o acesso.",
    };
  }
  return { success: true, name: data.name || peladaId };
}

// --- Invite link ---
// A single permanent per-pelada alternative to typing the shared password:
// whoever opens the link (?pelada=<id>&invite=<token>, built in settingsView.js)
// is let straight in. Exactly one token exists per pelada, stored as a plain
// field on its own peladas/{peladaId} doc (not a subcollection) — "get or
// create" always returns the same link once one has been generated, which is
// what makes it a stable, shareable link rather than a one-shot invite.

/** Any of the pelada's own admins (not root-only) can fetch/mint this pelada's one permanent invite token. */
export async function getOrCreatePeladaInviteToken(peladaId) {
  await waitForAuthUser();
  const snap = await getDoc(peladaDocRef(peladaId));
  const existing = snap.exists() ? snap.data().inviteToken : null;
  if (existing) return existing;

  const token = randomSaltHex(16); // 32 hex chars — 128 bits, not brute-forceable
  await setDoc(peladaDocRef(peladaId), { inviteToken: token }, { merge: true });
  return token;
}

/** Redeems the invite link in place of the shared password. Same shape/semantics as verifyPeladaLogin. */
export async function loginWithInviteToken(peladaId, token) {
  await waitForAuthUser();
  const peladaSnap = await getDoc(peladaDocRef(peladaId));
  if (!peladaSnap.exists()) {
    return { success: false, error: "Pelada não encontrada." };
  }
  const data = peladaSnap.data();
  if (!data.inviteToken || data.inviteToken !== token) {
    return { success: false, error: "Link de convite inválido." };
  }
  if (data.blocked) {
    return {
      success: false,
      blocked: true,
      error: "Assinatura expirada. Fale com o administrador da pelada para renovar o acesso.",
    };
  }
  return { success: true, name: data.name || peladaId };
}

/** Root-admin-only: lists every pelada that exists (enforced by firestore.rules' `list` restriction). */
export async function listAllPeladas() {
  const snap = await getDocs(collection(db, "peladas"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
}

/** Root-admin-only: blocks/unblocks a pelada — enforced server-side by firestore.rules (see isPeladaBlocked). */
export async function setPeladaBlocked(peladaId, blocked) {
  await setDoc(peladaDocRef(peladaId), { blocked }, { merge: true });
}

// Mirrors the default `activePelada` shape store.js's loadPelada() falls back to —
// keep the two in sync if that shape ever changes.
function createEmptyActivePelada() {
  return {
    status: "idle",
    teamCount: 4,
    presentPlayerIds: [],
    diaristaPlayerIds: [],
    teams: [],
    stats: {},
    departedPlayerIds: [],
    guestSlots: [],
    events: [],
    rotation: null,
  };
}

/** Root-admin-only: creates a brand-new, empty pelada (enforced server-side by firestore.rules). */
export async function createPelada(peladaId, name, password) {
  await waitForAuthUser();
  const existing = await getDoc(peladaDocRef(peladaId));
  if (existing.exists()) {
    return { success: false, error: "Já existe uma pelada com esse ID." };
  }
  const salt = randomSaltHex();
  const passwordHash = await hashPassword(password, salt, DEFAULT_PBKDF2_ITERATIONS);
  const now = new Date().toISOString();
  const createdBy = auth.currentUser ? auth.currentUser.uid : "unknown";

  await setDoc(peladaDocRef(peladaId), {
    id: peladaId,
    name: name || peladaId,
    passwordHash,
    passwordSalt: salt,
    iterations: DEFAULT_PBKDF2_ITERATIONS,
    blocked: false,
    createdAt: now,
    createdBy,
  });

  const emptyState = {
    players: [],
    activePelada: createEmptyActivePelada(),
    history: [],
    monthlyStats: {},
    teamSize: 5,
    matchDurationMs: DEFAULT_MATCH_DURATION_MS,
    goalsToFinish: DEFAULT_GOALS_TO_FINISH,
    winLimitEnabled: true,
    winStreakToRest: DEFAULT_WIN_STREAK_TO_REST,
    savedAt: now,
    savedBy: createdBy,
    writeId: `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
  // Seed both environments' state docs so dev testing of the new pelada doesn't
  // 404 against a doc that only exists in prod.
  await setDoc(doc(db, "cloud", peladaId), emptyState);
  await setDoc(doc(db, "cloud-dev", peladaId), emptyState);

  return { success: true };
}
