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
  getDocFromServer,
  getDocs,
  onSnapshot,
  runTransaction,
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

// --- Cloud write model ---------------------------------------------------------
// The whole league is ONE document, so a plain overwrite from a device holding an
// outdated copy (a phone back from the background, a second admin with the app open)
// silently erases newer changes — goals, a finished pelada, etc. Instead:
//  - Admin actions (store methods in ADMIN_ONLY_METHODS) are recorded as operations
//    (recordCloudOp) and persisted, so they survive the app being killed.
//  - A flush writes inside a transaction guarded by a `revision` counter (firestore.rules
//    also requires every update to bump it by exactly one). If the server is still at the
//    revision this device's copy was built on, the local state is written as-is.
//  - If another device saved first, this device loads the server version, re-applies its
//    pending operations on top of it (replay) and writes THAT — never a blind overwrite.
//    Operations that no longer apply (e.g. another device took the pelada's control)
//    are dropped and the admin is told.
const FLUSH_DEBOUNCE_MS = 400;
const RETRY_DELAY_MS = 5000;
// After opening the app or returning from the background, admin actions wait this long at
// most for the server's current version (then the revision check is the safety net).
const SYNC_GRACE_MS = 6000;

let storeRef = null;
let started = false;

// writes: this device's recent saves ({ writeId, seq } = which actions each one carried).
// A save can land on the server while its confirmation is lost (signal drops right then);
// recognising it later keeps its actions from being applied twice.
let sync = { baseRevision: null, ops: [], seq: 0, writes: [] };
let flushTimer = null;
let retryTimer = null;
let flushing = false;
let flushAgain = false;
let deferredRemote = null; // server data that arrived while we still had pending operations
let syncGraceTimer = null;

function syncKey() {
  return storeRef.scopedKey("_sync");
}

function loadSyncState() {
  try {
    const raw = localStorage.getItem(syncKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    sync = {
      baseRevision: Number.isFinite(parsed.baseRevision) ? parsed.baseRevision : null,
      ops: Array.isArray(parsed.ops) ? parsed.ops : [],
      seq: Number(parsed.seq) || 0,
      writes: Array.isArray(parsed.writes) ? parsed.writes : [],
    };
  } catch (err) {
    console.error("[cloud] Could not load pending sync state:", err);
  }
}

function persistSyncState() {
  try {
    localStorage.setItem(syncKey(), JSON.stringify(sync));
  } catch (err) {
    console.error("[cloud] Could not persist pending sync state:", err);
  }
}

function revisionOf(data) {
  return Number(data?.revision) || 0;
}

function isOwnWrite(data) {
  return !!data?.writeId && sync.writes.some((w) => w.writeId === data.writeId);
}

/** Server data carrying one of our saves: those actions are confirmed, the rest stay pending. */
function confirmOwnWrite(data) {
  const write = sync.writes.find((w) => w.writeId === data?.writeId);
  if (!write) return false;
  const revision = revisionOf(data);
  if (sync.baseRevision === null || revision >= sync.baseRevision) sync.baseRevision = revision;
  sync.ops = sync.ops.filter((op) => op.seq > write.seq);
  persistSyncState();
  return true;
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function serialize(store) {
  return {
    players: store.players,
    activePelada: store.activePelada,
    history: store.history,
    monthlyStats: store.monthlyStats,
    teamSize: store.teamSize,
    matchDurationMs: store.matchDurationMs,
    goalsToFinish: store.goalsToFinish,
    goalLimitEnabled: store.goalLimitEnabled,
    winLimitEnabled: store.winLimitEnabled,
    winStreakToRest: store.winStreakToRest,
    swapEnabled: store.swapEnabled,
    rankingTopZone: store.rankingTopZone,
    rankingBottomZone: store.rankingBottomZone,
    goalkeeperMode: store.goalkeeperMode,
    savedAt: new Date().toISOString(),
    savedBy: auth.currentUser ? auth.currentUser.uid : "unknown",
    writeId: `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

function applyRemoteData(data, { notify = true } = {}) {
  const store = storeRef;
  if (!store) return;

  try {
    // A brand-new pelada's roster is legitimately empty — must still be applied,
    // not treated as "no data yet" (that used to leave a stale/seeded local
    // roster in place forever and let it get pushed back up as if real).
    if (Array.isArray(data.players)) {
      store.players = data.players;
    }
    if (data.activePelada && data.activePelada.status) {
      // Snapshots from older app versions lack the goalkeeper fields.
      store.activePelada = store.normalizeActivePelada(data.activePelada);
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
    if (typeof data.goalLimitEnabled === "boolean") {
      store.goalLimitEnabled = data.goalLimitEnabled;
    }
    if (typeof data.winLimitEnabled === "boolean") {
      store.winLimitEnabled = data.winLimitEnabled;
    }
    if (Number.isFinite(data.winStreakToRest) && data.winStreakToRest > 0) {
      store.winStreakToRest = data.winStreakToRest;
    }
    if (typeof data.swapEnabled === "boolean") {
      store.swapEnabled = data.swapEnabled;
    }
    if (store.clampRankingZone(data.rankingTopZone) !== null) {
      store.rankingTopZone = store.clampRankingZone(data.rankingTopZone);
    }
    if (store.clampRankingZone(data.rankingBottomZone) !== null) {
      store.rankingBottomZone = store.clampRankingZone(data.rankingBottomZone);
    }
    if (["none", "fixed", "multi"].includes(data.goalkeeperMode)) {
      store.goalkeeperMode = data.goalkeeperMode;
    }
    // A snapshot from another device can still carry an over-filled team (older data) — trim
    // it here so every client converges on the same, correctly-sized rosters.
    store.enforceTeamSizeLimit();
    store.hydrateMonthlyStats();
    store.syncCareerStatsFromMonthly({ silent: true });
    store.persistLocal(); // cache for offline; does NOT re-push to cloud
    if (notify) store.notify();
  } catch (err) {
    console.error("[cloud] Error applying remote state:", err);
  }
}

/** Records one admin action (called by the store's ADMIN_ONLY_METHODS wrapper) and schedules a save. */
export function recordCloudOp(name, args) {
  if (!storeRef) return;
  let clonedArgs = [];
  try {
    clonedArgs = JSON.parse(JSON.stringify(args ?? []));
  } catch (err) {
    console.error("[cloud] Could not record action arguments:", err);
  }
  sync.seq += 1;
  sync.ops.push({ seq: sync.seq, name, args: clonedArgs, at: Date.now() });
  persistSyncState();
  setStatus(isOffline() ? "pending" : "saving");
  scheduleFlush();
}

function scheduleFlush(delay = FLUSH_DEBOUNCE_MS) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, delay);
}

/** Re-runs the pending operations on freshly loaded server state; returns the ones that no longer apply. */
function replayOps(store) {
  const dropped = [];
  store._replaying = true;
  store._suppressNotify = true;
  try {
    sync.ops.forEach((op) => {
      try {
        const fn = store[op.name];
        const result = typeof fn === "function" ? fn(...(op.args || [])) : { success: false };
        if (result?.success === false) dropped.push(op);
      } catch (err) {
        console.error(`[cloud] Replay of ${op.name} failed:`, err);
        dropped.push(op);
      }
    });
  } finally {
    store._replaying = false;
    store._suppressNotify = false;
  }
  return dropped;
}

async function flush() {
  const store = storeRef;
  if (!store || !store.isAdmin || !store.peladaId || !sync.ops.length) return;
  if (flushing) {
    flushAgain = true;
    return;
  }
  // No connection: a transaction would just hang. The "online" event retries.
  if (isOffline()) {
    setStatus("pending");
    return;
  }
  flushing = true;
  flushAgain = false;
  clearTimeout(retryTimer);
  retryTimer = null;
  setStatus("saving");

  let rebased = false;
  let dropped = [];
  let written = null;
  let discardedUpTo = 0;
  try {
    const ref = cloudDocRef(store.peladaId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? snap.data() : null;
      const serverRevision = data ? revisionOf(data) : 0;
      rebased = false;
      dropped = [];
      written = null;
      discardedUpTo = 0;
      // Our previous save did land (its confirmation got lost): the local state already
      // is that version plus the actions still pending — no replay, or they'd double.
      confirmOwnWrite(data);
      if (!sync.ops.length) return; // nothing left to save
      if (data && serverRevision !== sync.baseRevision) {
        // Someone else saved since this device's copy — rebuild on top of their version.
        applyRemoteData(data, { notify: false });
        sync.baseRevision = serverRevision;
        dropped = replayOps(store);
        rebased = true;
        // None of our actions apply anymore — the server version is already the result.
        if (dropped.length === sync.ops.length) {
          discardedUpTo = sync.seq;
          return;
        }
      }
      const payload = serialize(store);
      payload.revision = serverRevision + 1;
      written = { writeId: payload.writeId, seq: sync.seq, revision: payload.revision };
      sync.writes = [...sync.writes.slice(-19), { writeId: written.writeId, seq: written.seq }];
      persistSyncState();
      tx.set(ref, payload);
    });

    if (written) {
      confirmOwnWrite({ writeId: written.writeId, revision: written.revision });
    } else if (discardedUpTo) {
      sync.ops = sync.ops.filter((op) => op.seq > discardedUpTo);
      persistSyncState();
    }
    store.persistLocal();
    if (rebased) {
      store.notify();
      if (dropped.length && store.onNotice) {
        store.onNotice(
          `⚠️ Outro admin alterou a pelada antes — ${dropped.length} ação(ões) sua(s) não puderam ser aplicadas.`,
        );
      }
    }
    // A newer version from another device that arrived while we were saving.
    if (!sync.ops.length && deferredRemote && revisionOf(deferredRemote) > sync.baseRevision) {
      applyRemoteData(deferredRemote);
      sync.baseRevision = revisionOf(deferredRemote);
      persistSyncState();
    }
    deferredRemote = null;
    setStatus(sync.ops.length ? "saving" : "admin");
    if (sync.ops.length) flushAgain = true;
  } catch (err) {
    console.error("[cloud] Save failed:", err);
    const offline =
      err?.code === "unavailable" ||
      err?.code === "deadline-exceeded" ||
      (typeof navigator !== "undefined" && navigator.onLine === false);
    setStatus(offline ? "pending" : "error", err?.message);
    // New actions recorded meanwhile ride along with this retry (no immediate retry loop).
    flushAgain = false;
    retryTimer = setTimeout(flush, RETRY_DELAY_MS);
  } finally {
    flushing = false;
    if (flushAgain) scheduleFlush(0);
  }
}

/** A version of the document confirmed by the server (not the local cache). */
function handleServerSnapshot(data) {
  markServerSynced();
  if (isOwnWrite(data)) {
    // Echo of our own save (possibly one whose confirmation was lost).
    confirmOwnWrite(data);
    if (sync.ops.length) scheduleFlush(0);
    return;
  }
  if (sync.ops.length) {
    // Never drop local actions: the next flush rebuilds them on top of this version.
    deferredRemote = data;
    scheduleFlush(0);
    return;
  }
  applyRemoteData(data);
  sync.baseRevision = revisionOf(data);
  persistSyncState();
}

/** Opening the app / back from the background: admin actions wait for the server's version. */
function beginServerSync() {
  const store = storeRef;
  if (!store) return;
  store.cloudSyncing = true;
  if (store.isAdmin) setStatus("syncing");
  clearTimeout(syncGraceTimer);
  syncGraceTimer = setTimeout(() => {
    if (!store.cloudSyncing) return;
    store.cloudSyncing = false;
    if (store.isAdmin) setStatus(sync.ops.length ? "pending" : "error", "Sem conexão com a nuvem");
  }, SYNC_GRACE_MS);
}

function markServerSynced() {
  const store = storeRef;
  clearTimeout(syncGraceTimer);
  if (store.cloudSyncing) {
    store.cloudSyncing = false;
  }
  setStatus(store.isAdmin ? (sync.ops.length ? "saving" : "admin") : "online");
}

/** Asks the server directly for the current version (used when coming back to the app). */
function refreshFromServer() {
  const store = storeRef;
  if (!store?.peladaId) return;
  getDocFromServer(cloudDocRef(store.peladaId))
    .then((snap) => {
      if (snap.exists()) handleServerSnapshot(snap.data());
      else markServerSynced();
    })
    .catch((err) => console.warn("[cloud] Refresh from server failed:", err?.message));
}

function setStatus(status, detail) {
  if (storeRef && storeRef._setCloudStatus)
    storeRef._setCloudStatus(status, detail);
}

export function initCloudSync(store) {
  if (started) return;
  started = true;
  storeRef = store;
  if (store.peladaId) loadSyncState();
  beginServerSync();

  // Back from the background (phone locked, app switched — iOS freezes installed web apps):
  // this device's copy may be stale, so re-check the server before allowing admin actions,
  // and send any actions still waiting.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !store.peladaId) return;
    beginServerSync();
    refreshFromServer();
    if (sync.ops.length) scheduleFlush(0);
  });
  window.addEventListener("online", () => {
    if (!store.peladaId) return;
    refreshFromServer();
    if (sync.ops.length) scheduleFlush(0);
  });
  window.addEventListener("offline", () => {
    if (store.isAdmin && sync.ops.length) setStatus("pending");
  });

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

    // Live subscription — every signed-in device receives updates instantly. Only versions
    // confirmed by the server are used: the local Firestore cache can be hours old.
    onSnapshot(
      cloudDocRef(store.peladaId),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
        if (!snap.exists()) {
          markServerSynced();
          setStatus(store.isAdmin ? "admin" : "empty");
          return;
        }
        handleServerSnapshot(snap.data());
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
    store.adminIdentity = newIsAdmin && user ? { uid: user.uid, email: user.email || "" } : null;
    setStatus(
      store.cloudSyncing && newIsAdmin
        ? "syncing"
        : newIsAdmin
          ? (sync.ops.length ? "saving" : "admin")
          : user
            ? "online"
            : "connecting",
    );
    if (newIsAdmin && sync.ops.length) scheduleFlush();

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

/**
 * Root-admin-only: permanently deletes a pelada — its prod and dev league data, their
 * avatar subcollections, its admins list and finally the peladas/{id} doc itself.
 * The pelada doc goes last: the cloud rules read it (isPeladaBlocked), so it must
 * still exist — and be unblocked — while the rest is deleted.
 */
export async function deletePelada(peladaId) {
  await waitForAuthUser();
  const peladaRef = peladaDocRef(peladaId);
  const snap = await getDoc(peladaRef);
  if (!snap.exists()) return { success: false, error: "Pelada não encontrada." };
  if (snap.data().blocked) await setDoc(peladaRef, { blocked: false }, { merge: true });

  const deleteAll = async (colRef) => {
    const docs = await getDocs(colRef);
    await Promise.all(docs.docs.map((d) => deleteDoc(d.ref)));
  };
  for (const stateCollection of ["cloud", "cloud-dev"]) {
    await deleteAll(collection(db, stateCollection, peladaId, "avatars"));
    await deleteDoc(doc(db, stateCollection, peladaId));
  }
  await deleteAll(collection(db, "peladas", peladaId, "admins"));
  await deleteDoc(peladaRef);
  return { success: true };
}

// Mirrors the default `activePelada` shape store.js's loadPelada() falls back to —
// keep the two in sync if that shape ever changes.
function createEmptyActivePelada() {
  return {
    status: "idle",
    teamCount: 4,
    presentPlayerIds: [],
    attendancePlayerIds: [],
    diaristaPlayerIds: [],
    teams: [],
    stats: {},
    departedPlayerIds: [],
    guestSlots: [],
    events: [],
    rotation: null,
    goalkeeperMode: "none",
    goalkeeperIds: [],
    goalkeeperSides: { left: null, right: null },
    goalkeepersByTeam: {},
    departedGoalkeeperIds: [],
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
    goalLimitEnabled: true,
    winLimitEnabled: true,
    winStreakToRest: DEFAULT_WIN_STREAK_TO_REST,
    swapEnabled: false,
    rankingTopZone: 4,
    rankingBottomZone: 4,
    goalkeeperMode: "none",
    revision: 0,
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
