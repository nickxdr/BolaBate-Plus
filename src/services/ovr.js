// Dynamic player "overall rating" (OVR), 40-99, like a FIFA/EA FC card number but with no
// underlying attributes (shooting/passing/pace, etc). It blends the player's star rating with
// how their per-game form (goals, assists, win rate, awards) compares to the rest of the league —
// a z-score against the group's own average — so OVR stays meritocratic as a season goes on
// instead of every player's number quietly drifting up together as raw career totals grow.
//
// OVR itself is a single running number that carries forward month to month — it never resets.
// The rankings table shows a historical snapshot of it (what the player's OVR was at the end of
// a given period), not a rating recomputed from just that period's isolated stats.
//
// It's built from store.monthlyStats — the same running per-period ledger the rankings table and
// player profile already read from — rather than re-deriving totals from store.history. History
// only records finished peladas; monthlyStats is the actual source of truth for a player's stats
// (it also carries admin-entered manual corrections that have no matching history entry).

import { emptyPlayerStats, addPlayerStats, periodKey as buildPeriodKey } from "./periodStats.js";

const OVR_MIN = 40;
const OVR_MAX = 99;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** Star rating alone maps to a base OVR, leaving headroom above/below for a performance swing. */
function starBase(stars) {
  const s = clamp(Number(stars) || 1, 1, 5);
  return 42 + ((s - 1) / 4) * 33; // 1★ -> 42, 5★ -> 75
}

/** A single per-game "form" number blending goal involvement, win rate and awards. */
function formIndex(stats) {
  if (!stats.games) return 0;
  const gpg = stats.goals / stats.games;
  const apg = stats.assists / stats.games;
  const awardsPerGame = (stats.craque + stats.puskas + stats.selecao) / stats.games;
  const bagrePerGame = stats.bagre / stats.games;
  const decisive = stats.wins + stats.losses;
  const winRate = decisive ? stats.wins / decisive : 0.5;
  return gpg * 3 + apg * 2 + winRate * 6 + awardsPerGame * 4 - bagrePerGame * 3;
}

function toFormStats(raw) {
  return {
    games: Number(raw?.participacao) || 0,
    goals: Number(raw?.goals) || 0,
    assists: Number(raw?.assists) || 0,
    craque: Number(raw?.craque) || 0,
    puskas: Number(raw?.puskas) || 0,
    selecao: Number(raw?.selecao) || 0,
    bagre: Number(raw?.bagre) || 0,
    wins: Number(raw?.wins) || 0,
    losses: Number(raw?.losses) || 0,
  };
}

function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function quantile(arr, q) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
}

/**
 * Grades every player's OVR from a {playerId: statsShape} map, all in one league-relative pass.
 *
 * Uses the group's median absolute deviation (a robust stand-in for standard deviation) instead
 * of the mean/stdDev — a couple of standout stars racking up huge numbers otherwise drag the
 * baseline up and make everyone else's relative performance look worse than it is.
 *
 * The "zero swing" pivot is the group's 25th percentile rather than the median, so most of the
 * roster — anyone contributing a respectable amount, not just the top half — sits in positive-
 * swing territory; only the genuinely weak bottom quarter lands in negative territory. Above the
 * pivot, the swing grows with the square root of the z-score rather than linearly: a standout
 * performance still climbs the highest, but a merely-good one doesn't need to be nearly as
 * extreme relative to the pack to also read as a solid, respectable rating. Below the pivot the
 * swing stays small and linear — a quiet month shouldn't crater a player's rating.
 */
function computeOVRs(players, statsById) {
  const forms = players
    .map(p => statsById[p.id])
    .filter(s => s && s.games > 0)
    .map(formIndex);

  const pivot = quantile(forms, 0.25);
  const robustStd = median(forms.map(f => Math.abs(f - median(forms)))) * 1.4826;

  const map = {};
  players.forEach(p => {
    const stats = statsById[p.id];
    const base = starBase(p.stars);
    if (!stats || !stats.games || !robustStd) {
      map[p.id] = Math.round(clamp(base, OVR_MIN, OVR_MAX));
      return;
    }
    const z = (formIndex(stats) - pivot) / robustStd;
    const swing = z >= 0 ? clamp(9.9 * Math.sqrt(z), 0, 28) : clamp(z * 4, -12, 0);
    map[p.id] = Math.round(clamp(base + swing, OVR_MIN, OVR_MAX));
  });
  return map;
}

/** Sums every monthlyStats period up to and including `cutoffKey` (YYYY-MM), per player. */
function cumulativeRawStatsUpTo(store, cutoffKey) {
  const raw = {};
  store.players.forEach(p => { raw[p.id] = emptyPlayerStats(); });
  Object.entries(store.monthlyStats || {}).forEach(([key, period]) => {
    if (key > cutoffKey) return;
    Object.entries(period?.players || {}).forEach(([pid, stats]) => {
      if (!raw[pid]) raw[pid] = emptyPlayerStats();
      addPlayerStats(raw[pid], stats);
    });
  });
  return raw;
}

/**
 * OVR as it stood at the end of a given ranking period — a historical snapshot of the running
 * career rating, not a rating recomputed from that period's stats alone (OVR doesn't reset every
 * month). If the period is the current one (or later), this also folds in the current pelada's
 * not-yet-archived goals/assists, mirroring how the ranking table's getLiveStatsOverlay keeps
 * stats live before finishPelada() commits them.
 */
export function computeCumulativeOVRsAsOf(store, year, month, isAnnual) {
  const cutoffKey = isAnnual ? `${year}-12` : buildPeriodKey(year, month);
  const currentKey = store.currentPeriodKey();
  const isCurrentOrFuture = cutoffKey >= currentKey;

  const raw = cumulativeRawStatsUpTo(store, isCurrentOrFuture ? currentKey : cutoffKey);

  if (isCurrentOrFuture && typeof store.getLiveStatsOverlay === "function") {
    Object.entries(store.getLiveStatsOverlay()).forEach(([pid, stats]) => {
      if (!raw[pid]) raw[pid] = emptyPlayerStats();
      addPlayerStats(raw[pid], stats);
    });
  }

  const statsById = {};
  store.players.forEach(p => { statsById[p.id] = toFormStats(raw[p.id]); });
  return computeOVRs(store.players, statsById);
}

/** The player's OVR right now — used in the profile modal and the live pitch view. */
export function computeCurrentOVRs(store) {
  const now = new Date();
  return computeCumulativeOVRsAsOf(store, now.getFullYear(), now.getMonth() + 1, false);
}
