import { INITIAL_PLAYERS, INITIAL_MONTHLY_STATS } from '../data/seedData.js';
import {
  aggregateHistoryToMonthly,
  applyHistoryEntryToPeriod,
  removeHistoryEntryFromPeriod,
  addPlayerStats,
  periodKey,
  parseDateToPeriod,
  emptyPlayerStats,
  createEmptyPeriod,
  STAT_FIELDS,
} from '../services/periodStats.js';

import { initCloudSync, scheduleCloudPush, pushAvatarConfig, initAvatarSync } from '../services/cloudSync.js';

const STORAGE_KEY = 'bolabate_store_v2';
const THEME_KEY = 'bolabate_theme_v1'; // device-level UX pref — intentionally NOT scoped per pelada
const AVATARS_KEY = 'bolabate_avatars_v1';

// Which pelada (tenant) this device is currently signed into. Read once at
// construction; entering/leaving a pelada always reloads the page (see
// main.js/settingsView.js) rather than hot-swapping this mid-session.
export const PELADA_ID_KEY = 'bolabate_pelada_id_v1';
export const PELADA_NAME_KEY = 'bolabate_pelada_name_v1';
// Set right before a forced reload when the server tells us this pelada got
// blocked mid-session (see cloudSync.js's pelada-status subscription) — read
// once by the login splash to show the "renew your subscription" message.
export const PELADA_BLOCKED_KEY = 'bolabate_pelada_blocked_v1';

// The original, pre-multi-tenant production dataset was migrated to this pelada id.
// Its local seed/merge behavior (INITIAL_PLAYERS, INITIAL_MONTHLY_STATS) stays
// authoritative ONLY for this pelada — every other pelada starts genuinely empty.
const LEGACY_PELADA_ID = 'bolabate';

// The league's real data starts in August 2026 — no period selector (year or month)
// should ever offer anything earlier than that, since it can only ever be empty.
const LEAGUE_START_YEAR = 2026;
const LEAGUE_START_MONTH = 8;

// Store methods that mutate league data — reserved for the admin account.
// Everyone else gets read-only access (also enforced by Firestore Security Rules).
const ADMIN_ONLY_METHODS = [
  'addPlayer', 'updatePlayer', 'deletePlayer',
  'startPeladaSetup', 'updatePeladaTeams', 'startLivePelada',
  'recordGoal', 'recordAssist', 'removeGoal', 'removeAssist', 'assignTeamCompletion',
  'setTeamSize', 'setMatchDuration', 'setGoalsToFinish', 'setWinLimitEnabled', 'setWinStreakToRest',
  'markPlayerDeparted', 'revertPlayerDeparture', 'assignGuestSubstitute',
  'startMatchTimer', 'pauseMatchTimer', 'endCurrentMatch', 'ensureRotation',
  'startMatchBetween', 'reorderWaitingQueue', 'adjustMatchScore', 'substituteQueuedTeam',
  'finishPelada', 'updateHistoryAwards', 'cancelPelada', 'deleteHistoryEntry',
  'importFromJson', 'resetToDefaults',
];

const MATCH_TIMER_DURATION_MS = 10 * 60 * 1000; // default match length: 10 minutes

// Bounds + defaults for every rule the admin can tune on the "Regras da Partida"
// screen. Duration is expressed in minutes because that's the unit that UI works with.
export const MIN_MATCH_DURATION_MIN = 1;
export const MAX_MATCH_DURATION_MIN = 60;

const DEFAULT_GOALS_TO_FINISH = 2;       // goals a team needs to end the match early
const DEFAULT_WIN_LIMIT_ENABLED = true;  // winner steps aside after the configured win streak
const DEFAULT_WIN_STREAK_TO_REST = 3;    // consecutive wins before the winner steps aside

export const MIN_GOALS_TO_FINISH = 1;
export const MAX_GOALS_TO_FINISH = 10;
export const MIN_WIN_STREAK_TO_REST = 1;
export const MAX_WIN_STREAK_TO_REST = 10;

class Store {
  constructor() {
    this.listeners = new Set();
    this.theme = localStorage.getItem(THEME_KEY) || 'bolabate-dark';
    this.isAdmin = false;         // true only for the admin Firebase UID
    this.cloudUserType = null;    // 'admin' | 'anon' | null
    this.cloudStatus = 'connecting';
    this.onBlocked = null;        // set by main.js → shows a toast
    this.onCloudStatus = null;    // set by main.js → UI status updates
    // Must be set before any load*() call below — every scoped key is derived from it.
    this.peladaId = localStorage.getItem(PELADA_ID_KEY) || null;
    this.peladaName = localStorage.getItem(PELADA_NAME_KEY) || this.peladaId || '';
    this.players = this.loadPlayers();
    this.teamSize = this.loadTeamSize(); // 5 (default) or 6 — league-wide match format, synced via cloud
    this.matchDurationMs = this.loadMatchDuration(); // how long each match lasts — league-wide, synced via cloud
    this.goalsToFinish = this.loadGoalsToFinish(); // remaining league-wide match rules (Regras da Partida)
    this.winLimitEnabled = this.loadWinLimitEnabled();
    this.winStreakToRest = this.loadWinStreakToRest();
    this.avatars = this.loadAvatars(); // playerId -> avatar config; anyone can edit anyone's, synced independently
    this.activePelada = this.loadPelada();
    // Self-heal a team over-filled by an older build (e.g. a completion guest left behind
    // after the player it was covering came back) before the first save() below persists it.
    this.enforceTeamSizeLimit();
    this.history = this.loadHistory();
    this.monthlyStats = this.loadMonthlyStats();
    this.selectedPeriodKey = this.currentPeriodKey(); // default to current device month/year
    this.hydrateMonthlyStats();
    this.syncCareerStatsFromMonthly({ silent: true });
    this.applyTheme(this.theme);
    this.save();

    // Guard every mutating method: non-admins get a blocked toast instead
    for (const name of ADMIN_ONLY_METHODS) {
      const original = this[name].bind(this);
      this[name] = (...args) => {
        if (!this.isAdmin) {
          if (this.onBlocked) this.onBlocked(name);
          return undefined;
        }
        return original(...args);
      };
    }
  }

  /** Every tenant-scoped localStorage key is namespaced per pelada so switching peladas on the same device never mixes cached data. */
  scopedKey(suffix) {
    return `${STORAGE_KEY}${suffix}__${this.peladaId || 'none'}`;
  }

  avatarsKey() {
    return `${AVATARS_KEY}__${this.peladaId || 'none'}`;
  }

  loadPlayers() {
    try {
      const data = localStorage.getItem(this.scopedKey('_players'));
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (this.peladaId === LEGACY_PELADA_ID) {
            // Merge with INITIAL_PLAYERS to ensure official stars and new players exist —
            // only for the original migrated pelada; every other pelada manages its own
            // roster from scratch with zero influence from BolaBate's seed data.
            const map = new Map();
            parsed.forEach(p => map.set(p.name.toLowerCase(), p));

            INITIAL_PLAYERS.forEach(seed => {
              const existing = map.get(seed.name.toLowerCase());
              if (existing) {
                existing.stars = seed.stars; // update to official stars
              } else {
                parsed.push({ ...seed });
              }
            });
          }
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error loading players:', e);
    }
    return this.peladaId === LEGACY_PELADA_ID ? JSON.parse(JSON.stringify(INITIAL_PLAYERS)) : [];
  }

  loadTeamSize() {
    try {
      const raw = Number(localStorage.getItem(this.scopedKey('_team_size')));
      return raw === 6 ? 6 : 5;
    } catch (e) {
      return 5;
    }
  }

  /**
   * League-wide match format — 5v5 (default) or 6v6. Reshapes team assembly, the mini-pitch
   * formation and the completeness checks everywhere else in the pelada flow, so it's blocked
   * while a pelada is being set up or is live to avoid corrupting an in-progress roster.
   */
  setTeamSize(size) {
    const next = Number(size) === 6 ? 6 : 5;
    if (next === this.teamSize) return { success: true };
    if (this.activePelada.status !== 'idle') {
      return { success: false, error: 'Termine ou cancele a pelada atual antes de trocar o formato.' };
    }
    this.teamSize = next;
    this.save();
    return { success: true };
  }

  /** Match length in milliseconds — defaults to 10 minutes when it was never configured. */
  loadMatchDuration() {
    try {
      const raw = Number(localStorage.getItem(this.scopedKey('_match_duration_ms')));
      const minMs = MIN_MATCH_DURATION_MIN * 60 * 1000;
      const maxMs = MAX_MATCH_DURATION_MIN * 60 * 1000;
      if (Number.isFinite(raw) && raw >= minMs && raw <= maxMs) return raw;
    } catch (e) {
      console.error('Error loading match duration:', e);
    }
    return MATCH_TIMER_DURATION_MS;
  }

  /**
   * How long a single match lasts, in whole minutes — league-wide (like the match format)
   * and therefore admin-only + synced via cloud. A match that hasn't kicked off yet picks
   * up the new length immediately; one already underway keeps the clock it started with.
   */
  setMatchDuration(minutes) {
    const value = Math.round(Number(minutes));
    if (!Number.isFinite(value) || value < MIN_MATCH_DURATION_MIN || value > MAX_MATCH_DURATION_MIN) {
      return {
        success: false,
        error: `Escolha uma duração entre ${MIN_MATCH_DURATION_MIN} e ${MAX_MATCH_DURATION_MIN} minutos.`,
      };
    }

    const ms = value * 60 * 1000;
    if (ms === this.matchDurationMs) return { success: true };
    this.matchDurationMs = ms;

    const match = this.activePelada.rotation?.currentMatch;
    const notStarted =
      match && !match.timerRunning && match.timerRemainingMs === match.timerDurationMs;
    if (notStarted) {
      match.timerDurationMs = ms;
      match.timerRemainingMs = ms;
    }

    this.save();
    return { success: true };
  }

  /** Whole number of goals a team must reach before a match can be ended early. */
  loadGoalsToFinish() {
    try {
      const raw = Number(localStorage.getItem(this.scopedKey('_goals_to_finish')));
      if (Number.isFinite(raw) && raw >= MIN_GOALS_TO_FINISH && raw <= MAX_GOALS_TO_FINISH) {
        return Math.round(raw);
      }
    } catch (e) {
      console.error('Error loading goals-to-finish rule:', e);
    }
    return DEFAULT_GOALS_TO_FINISH;
  }

  setGoalsToFinish(goals) {
    const value = Math.round(Number(goals));
    if (!Number.isFinite(value) || value < MIN_GOALS_TO_FINISH || value > MAX_GOALS_TO_FINISH) {
      return {
        success: false,
        error: `Escolha um valor entre ${MIN_GOALS_TO_FINISH} e ${MAX_GOALS_TO_FINISH} gols.`,
      };
    }
    if (value === this.goalsToFinish) return { success: true };
    this.goalsToFinish = value;
    this.save();
    return { success: true };
  }

  /**
   * "Limite de vitórias" toggle. When on, a team that reaches the configured win streak
   * steps aside even though it just won; when off, the winner stays on the pitch until it
   * is finally beaten (no win limit).
   */
  loadWinLimitEnabled() {
    try {
      const raw = localStorage.getItem(this.scopedKey('_win_limit_enabled'));
      if (raw === 'true') return true;
      if (raw === 'false') return false;
    } catch (e) {
      console.error('Error loading win-limit rule:', e);
    }
    return DEFAULT_WIN_LIMIT_ENABLED;
  }

  setWinLimitEnabled(enabled) {
    const value = !!enabled;
    if (value === this.winLimitEnabled) return { success: true };
    this.winLimitEnabled = value;
    this.save();
    return { success: true };
  }

  /** How many wins in a row a team gets before it has to step aside (while the win limit is on). */
  loadWinStreakToRest() {
    try {
      const raw = Number(localStorage.getItem(this.scopedKey('_win_streak_to_rest')));
      if (Number.isFinite(raw) && raw >= MIN_WIN_STREAK_TO_REST && raw <= MAX_WIN_STREAK_TO_REST) {
        return Math.round(raw);
      }
    } catch (e) {
      console.error('Error loading win-streak rule:', e);
    }
    return DEFAULT_WIN_STREAK_TO_REST;
  }

  setWinStreakToRest(wins) {
    const value = Math.round(Number(wins));
    if (!Number.isFinite(value) || value < MIN_WIN_STREAK_TO_REST || value > MAX_WIN_STREAK_TO_REST) {
      return {
        success: false,
        error: `Escolha um valor entre ${MIN_WIN_STREAK_TO_REST} e ${MAX_WIN_STREAK_TO_REST} vitórias.`,
      };
    }
    if (value === this.winStreakToRest) return { success: true };
    this.winStreakToRest = value;
    this.save();
    return { success: true };
  }

  /**
   * Single source of truth for "can this match be ended now?" — mirrored by the store's
   * own endCurrentMatch() guard and by peladaView's button/label state. A match can end
   * once either team reaches the configured goal target, or the clock runs out.
   */
  canFinishMatch(match, remainingMs) {
    if (!match) return false;
    return (
      match.scoreA >= this.goalsToFinish ||
      match.scoreB >= this.goalsToFinish ||
      remainingMs <= 0
    );
  }

  loadAvatars() {
    try {
      const data = localStorage.getItem(this.avatarsKey());
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Error loading avatars:', e);
    }
    return {};
  }

  /**
   * Sets a player's avatar config (from the DiceBear-based creator in the Players screen).
   * Deliberately NOT admin-gated — it's a purely cosmetic, low-stakes feature, so anyone
   * (including anonymous visitors) can customize any player's avatar. Persists locally
   * right away for instant feedback, then mirrors to its own Firestore collection —
   * separate from the main admin-only synced document — so it reaches every device.
   */
  updatePlayerAvatar(playerId, config) {
    if (!playerId) return;
    this.avatars[playerId] = config;
    try {
      localStorage.setItem(this.avatarsKey(), JSON.stringify(this.avatars));
    } catch (e) {
      console.error('Error saving avatars:', e);
    }
    this.notify();
    pushAvatarConfig(playerId, config, this.peladaId).catch((err) => {
      console.error('[avatar] Failed to sync avatar:', err);
    });
  }

  loadPelada() {
    try {
      const data = localStorage.getItem(this.scopedKey('_pelada'));
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.status === 'idle') {
          parsed.presentPlayerIds = [];
        }
        if (!Array.isArray(parsed.diaristaPlayerIds)) {
          parsed.diaristaPlayerIds = [];
        }
        if (parsed.rotation === undefined) {
          parsed.rotation = null;
        }
        return parsed;
      }
    } catch (e) {
      console.error('Error loading pelada:', e);
    }
    return {
      status: 'idle', // 'idle' | 'setup' | 'live'
      teamCount: 4,
      presentPlayerIds: [],
      diaristaPlayerIds: [], // IDs of players playing as day-rate "Diarista" — stats don't count toward the ranking
      teams: [], // [ { id: 'team-1', name: 'Time 1', playerIds: [], color: '#...' } ]
      stats: {
        // playerId -> { goals: number, assists: number, guestGoals: number, guestAssists: number }
      },
      departedPlayerIds: [], // IDs of players who went home early
      guestSlots: [], // [ { teamId, originalPlayerId, guestPlayerId } ]
      events: [], // chronological list of goals/actions
      rotation: null, // "winner stays" carousel state — see buildInitialRotation()
    };
  }

  loadHistory() {
    try {
      const data = localStorage.getItem(this.scopedKey('_history'));
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Error loading history:', e);
    }
    return [];
  }

  save() {
    this.persistLocal();
    this.notify();
    // Admins mirror every change to the cloud (debounced)
    scheduleCloudPush(this);
  }

  /**
   * Same as save() but skips notify() — for hot-path mutations (goal/assist counters, match
   * timer, score correction) whose caller already patches the affected DOM nodes directly
   * (see peladaView's patch* functions). notify() drives main.js's global re-render, which
   * tears down and rebuilds the entire mounted view; doing that on every single tap during a
   * live match is what caused the whole screen to visibly flash. Persistence and cloud sync
   * (and therefore every OTHER client's own notify) are unaffected — this only skips the
   * redundant local re-render of a change this tab already reflected itself.
   */
  saveQuiet() {
    this.persistLocal();
    scheduleCloudPush(this);
  }

  /** Writes only to localStorage — used for offline cache & cloud snapshots. */
  persistLocal() {
    try {
      localStorage.setItem(this.scopedKey('_players'), JSON.stringify(this.players));
      localStorage.setItem(this.scopedKey('_pelada'), JSON.stringify(this.activePelada));
      localStorage.setItem(this.scopedKey('_history'), JSON.stringify(this.history));
      localStorage.setItem(this.scopedKey('_monthly'), JSON.stringify(this.monthlyStats || {}));
      localStorage.setItem(this.scopedKey('_selected_period'), this.selectedPeriodKey || '');
      localStorage.setItem(this.scopedKey('_team_size'), String(this.teamSize));
      localStorage.setItem(this.scopedKey('_match_duration_ms'), String(this.matchDurationMs));
      localStorage.setItem(this.scopedKey('_goals_to_finish'), String(this.goalsToFinish));
      localStorage.setItem(this.scopedKey('_win_limit_enabled'), String(this.winLimitEnabled));
      localStorage.setItem(this.scopedKey('_win_streak_to_rest'), String(this.winStreakToRest));
      localStorage.setItem(THEME_KEY, this.theme);
    } catch (e) {
      console.error('Error saving state:', e);
    }
  }

  /** Connects the store to Firebase (anonymous auth + live cloud subscription). */
  initCloud() {
    initCloudSync(this);
    initAvatarSync(this);
  }

  _setCloudStatus(status, detail) {
    this.cloudStatus = status;
    // NOTE: intentionally does NOT call notify() — status changes happen often
    // (every snapshot / auth tick) and re-rendering the whole view for a badge
    // update caused a visible screen flash. The badge is patched directly via
    // the onCloudStatus callback in main.js instead.
    if (this.onCloudStatus) this.onCloudStatus(status, detail);
  }

  loadMonthlyStats() {
    try {
      const data = localStorage.getItem(this.scopedKey('_monthly'));
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Error loading monthly stats:', e);
    }
    return {};
  }

  loadSelectedPeriod() {
    try {
      return localStorage.getItem(this.scopedKey('_selected_period')) || '';
    } catch (e) {
      return '';
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) {
      try {
        fn(this);
      } catch (err) {
        console.error('Listener error:', err);
      }
    }
  }

  setTheme(theme) {
    const valid = ['dark', 'light', 'bolabate-dark', 'bolabate-light'];
    this.theme = valid.includes(theme) ? theme : 'bolabate-dark';
    this.applyTheme(this.theme);
    this.save();
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  // --- Players Management ---
  getPlayer(id) {
    return this.players.find(p => p.id === id);
  }

  addPlayer(name, stars = 3.0, favoritePosition = '') {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const newPlayer = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: trimmed,
      stars: Math.max(0.5, Math.min(5.0, Number(stars) || 3.0)),
      favoritePosition: String(favoritePosition || ''),
      goals: 0,
      assists: 0,
      selecao: 0,
      puskas: 0,
      craque: 0,
      bagre: 0,
      participacao: 0
    };
    this.players.push(newPlayer);
    this.save();
    return newPlayer;
  }

  updatePlayer(id, updates) {
    const player = this.getPlayer(id);
    if (!player) return false;

    if (updates.name !== undefined) player.name = updates.name.trim();
    if (updates.stars !== undefined) player.stars = Math.max(0.5, Math.min(5.0, Number(updates.stars)));
    if (updates.favoritePosition !== undefined) player.favoritePosition = String(updates.favoritePosition || '');

    const hasStatUpdate = STAT_FIELDS.some(f => updates[f] !== undefined);
    if (hasStatUpdate && !this.isAnnualSelected()) {
      const key = this.selectedPeriodKey || parseDateToPeriod(new Date().toISOString());
      this.ensurePeriodByKey(key);
      if (!this.monthlyStats[key].players[id]) {
        this.monthlyStats[key].players[id] = emptyPlayerStats();
      }
      const target = this.monthlyStats[key].players[id];
      STAT_FIELDS.forEach(f => {
        if (updates[f] !== undefined) target[f] = Math.max(0, Number(updates[f]));
      });
      this.syncCareerStatsFromMonthly({ silent: true });
    }

    this.save();
    return true;
      target.draws = Number(stats.draws) || 0;
  }

  deletePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
    // Also remove from active pelada if present
    if (this.activePelada.presentPlayerIds) {
      this.activePelada.presentPlayerIds = this.activePelada.presentPlayerIds.filter(pid => pid !== id);
    }
    if (this.activePelada.teams) {
      this.activePelada.teams.forEach(t => {
        t.playerIds = t.playerIds.filter(pid => pid !== id);
      });
    }
    this.save();
  }

  // --- Pelada Workflow ---
  startPeladaSetup(teamCount = 4, selectedPlayerIds = [], diaristaPlayerIds = []) {
    this.activePelada = {
      status: 'setup',
      teamCount: Math.max(3, Math.min(6, teamCount)),
      presentPlayerIds: selectedPlayerIds,
      diaristaPlayerIds: diaristaPlayerIds.filter(id => selectedPlayerIds.includes(id)),
      teams: Array.from({ length: teamCount }, (_, i) => ({
        id: `team-${i + 1}`,
        name: `Time ${i + 1}`,
        color: this.getTeamColor(i),
        playerIds: []
      })),
      stats: {},
      departedPlayerIds: [],
      guestSlots: [],
      events: [],
      rotation: null,
      startedAt: new Date().toISOString()
    };
    this.save();
  }

  getTeamColor(index) {
    const colors = [
      '#10B981', // Emerald Green
      '#3B82F6', // Royal Blue
      '#F59E0B', // Amber / Orange
      '#EC4899', // Pink
      '#8B5CF6', // Purple
      '#06B6D4'  // Cyan
    ];
    return colors[index % colors.length];
  }

  updatePeladaTeams(teams) {
    this.activePelada.teams = teams;
    this.save();
  }

  startLivePelada() {
    // Initialize stats tracking for all participating players
    const stats = {};
    this.activePelada.teams.forEach(team => {
      team.playerIds.forEach(pid => {
        stats[pid] = { goals: 0, assists: 0, guestGoals: 0, guestAssists: 0 };
      });
    });

    this.activePelada.status = 'live';
    this.activePelada.stats = stats;
    this.activePelada.departedPlayerIds = [];
    this.activePelada.guestSlots = [];
    this.activePelada.events = [];
    this.activePelada.rotation = this.buildInitialRotation();
    this.save();
  }

  // --- "Winner stays" Rotation (Carrossel de Times) ---

  /** Extracts the numeric suffix from a team id (e.g. "team-3" -> 3), used as the tiebreak. */
  getTeamNumber(teamId) {
    const match = /(\d+)/.exec(teamId || '');
    return match ? Number(match[1]) : 0;
  }

  /** Counts match results per team from the rotation log. Used to archive the record into history when the pelada ends. */
  getTeamRecordFromLog(log) {
    const record = {};
    const bump = (teamId, field) => {
      if (!record[teamId]) record[teamId] = { wins: 0, draws: 0, losses: 0 };
      record[teamId][field] += 1;
    };
    (log || []).forEach(entry => {
      if (!entry.winnerId) {
        bump(entry.teamAId, 'draws');
        bump(entry.teamBId, 'draws');
        return;
      }
      const loserId = entry.winnerId === entry.teamAId ? entry.teamBId : entry.teamAId;
      bump(entry.winnerId, 'wins');
      bump(loserId, 'losses');
    });
    return record;
  }

  /**
   * How many players a team can currently field: present roster minus departures, plus any
   * guest fill-ins. `ignoreDepartedPlayerId` lets a caller ask "what would this team look
   * like WITHOUT the guest currently replacing that player?" — used when re-assigning a
   * substitute so swapping one guest for another isn't blocked by the size cap.
   */
  getTeamCompleteness(teamId, ignoreDepartedPlayerId = null) {
    const team = this.activePelada.teams.find(t => t.id === teamId);
    if (!team) return 0;
    const departed = new Set(this.activePelada.departedPlayerIds || []);
    const activeOriginal = team.playerIds.filter(pid => !departed.has(pid)).length;
    const activeGuests = (this.activePelada.guestSlots || [])
      .filter(g => g.teamId === teamId && (ignoreDepartedPlayerId === null || g.departedPlayerId !== ignoreDepartedPlayerId))
      .length;
    return activeOriginal + activeGuests;
  }

  /**
   * Guarantees no team ever fields more than `teamSize` players. Guest fill-ins that are no
   * longer needed — the departed player came back, or a completion guest was added on top of
   * an already-full team — are dropped so the waiting queue can never show e.g. "6/5
   * disponíveis". Substitutions tied to a real departed player are preserved for as long as
   * possible (undoing a substitution would be worse); optional completion guests go first,
   * earliest-added kept. Also drops stale slots whose player is no longer marked as departed.
   *
   * Returns the removed slots.
   */
  enforceTeamSizeLimit() {
    const pelada = this.activePelada;
    if (!pelada || !Array.isArray(pelada.teams) || !Array.isArray(pelada.guestSlots)) return [];

    const removed = [];
    const departed = new Set(pelada.departedPlayerIds || []);

    // Drop stale substitutions (their player is back) and slots pointing at a team that no
    // longer exists — neither can be legitimate, and both would inflate the headcount.
    pelada.guestSlots = pelada.guestSlots.filter(slot => {
      const stale = !!slot.departedPlayerId && !departed.has(slot.departedPlayerId);
      const orphan = !pelada.teams.some(t => t.id === slot.teamId);
      if (stale || orphan) {
        removed.push(slot);
        return false;
      }
      return true;
    });

    pelada.teams.forEach(team => {
      const activeOriginal = team.playerIds.filter(pid => !departed.has(pid)).length;
      let room = Math.max(0, this.teamSize - activeOriginal);
      const slots = pelada.guestSlots.filter(s => s.teamId === team.id);
      // Tied substitutions first, then optional completions — oldest first in both groups.
      const ordered = [
        ...slots.filter(s => s.departedPlayerId),
        ...slots.filter(s => !s.departedPlayerId),
      ];

      const surplus = new Set();
      ordered.forEach(slot => {
        if (room > 0) room -= 1;
        else surplus.add(slot);
      });

      if (surplus.size > 0) {
        pelada.guestSlots = pelada.guestSlots.filter(s => !surplus.has(s));
        removed.push(...surplus);
      }
    });

    return removed;
  }

  /** Sorts team ids by "most complete" first, then by team number ascending — used only as the initial suggested queue order; the admin can freely reorder it afterwards. */
  rankTeamsByAvailability(teamIds) {
    return [...teamIds].sort((a, b) => {
      const diff = this.getTeamCompleteness(b) - this.getTeamCompleteness(a);
      if (diff !== 0) return diff;
      return this.getTeamNumber(a) - this.getTeamNumber(b);
    });
  }

  createMatch(teamAId, teamBId) {
    return {
      teamAId,
      teamBId,
      scoreA: 0,
      scoreB: 0,
      timerDurationMs: this.matchDurationMs || MATCH_TIMER_DURATION_MS,
      timerRemainingMs: this.matchDurationMs || MATCH_TIMER_DURATION_MS,
      timerRunning: false,
      timerEndsAt: null,
      // A snapshot of every player's cumulative goals/assists at kickoff — activePelada.stats
      // itself never resets between matches (it's a whole-session running total), so this is
      // what lets us later work out who scored IN THIS MATCH specifically (see
      // computeMatchStatsDelta), instead of attributing a player's whole day to every
      // opponent they happened to face — used for head-to-head history.
      statsSnapshot: JSON.parse(JSON.stringify(this.activePelada.stats || {})),
    };
  }

  /** Per-player {goals, assists} scored between a match's kickoff snapshot and now (or its end). */
  computeMatchStatsDelta(statsBefore, statsAfter) {
    const delta = {};
    const ids = new Set([...Object.keys(statsBefore || {}), ...Object.keys(statsAfter || {})]);
    ids.forEach(pid => {
      const before = statsBefore?.[pid] || {};
      const after = statsAfter?.[pid] || {};
      const goals = (Number(after.goals) || 0) - (Number(before.goals) || 0);
      const assists = (Number(after.assists) || 0) - (Number(before.assists) || 0);
      if (goals || assists) delta[pid] = { goals, assists };
    });
    return delta;
  }

  /** Lazily builds rotation state for peladas started before this feature existed. */
  ensureRotation() {
    if (!this.activePelada.rotation) {
      this.activePelada.rotation = this.buildInitialRotation();
      this.save();
    }
  }

  /** All teams start in the waiting queue (ordered "most complete" first as a default suggestion) — the admin picks the actual first match manually via startMatchBetween(). */
  buildInitialRotation() {
    const ranked = this.rankTeamsByAvailability(this.activePelada.teams.map(t => t.id));
    return {
      currentMatch: null,
      waitingTeamIds: ranked,
      streakTeamId: null,
      streakCount: 0,
      log: [],
    };
  }

  /** Admin picks two waiting teams to kick off a match — used for the very first confrontation of the pelada (subsequent ones are assembled automatically by endCurrentMatch). */
  startMatchBetween(teamAId, teamBId) {
    const rotation = this.activePelada.rotation;
    if (!rotation) return { success: false, error: 'Pelada sem rotação ativa.' };
    if (rotation.currentMatch) return { success: false, error: 'Já existe uma partida em andamento.' };
    if (!teamAId || !teamBId || teamAId === teamBId) return { success: false, error: 'Selecione dois times diferentes.' };
    if (!rotation.waitingTeamIds.includes(teamAId) || !rotation.waitingTeamIds.includes(teamBId)) {
      return { success: false, error: 'Os times selecionados precisam estar na fila de espera.' };
    }

    rotation.waitingTeamIds = rotation.waitingTeamIds.filter(id => id !== teamAId && id !== teamBId);
    rotation.currentMatch = this.createMatch(teamAId, teamBId);
    const reclaimedGuests = this.reclaimGuestsForTeams([teamAId, teamBId]);
    this.save();
    return { success: true, reclaimedGuests };
  }

  /**
   * Swaps a waiting team into the current match in place of one of its two teams — an escape
   * hatch for when the rotation's automatic pick (winner-stays / next-from-queue) isn't who the
   * admin actually wants to play. Only allowed before the match has actually started (timer
   * never pressed, still 0-0), since once it's underway the result already belongs to whoever's
   * out there. The bumped team goes back into the exact queue slot the substitute came from, so
   * nobody's place in line changes because of the swap.
   */
  substituteQueuedTeam(queuedTeamId, replaceTeamId) {
    const rotation = this.activePelada.rotation;
    const match = rotation?.currentMatch;
    if (!match) return { success: false, error: 'Não há partida em andamento.' };

    const notStarted = !match.timerRunning && match.timerRemainingMs === match.timerDurationMs;
    if (!notStarted || match.scoreA !== 0 || match.scoreB !== 0) {
      return { success: false, error: 'Só é possível substituir o time antes de a partida começar.' };
    }
    if (replaceTeamId !== match.teamAId && replaceTeamId !== match.teamBId) {
      return { success: false, error: 'Time inválido para substituição.' };
    }
    const queueIdx = rotation.waitingTeamIds.indexOf(queuedTeamId);
    if (queueIdx === -1) {
      return { success: false, error: 'Time não está na fila de espera.' };
    }

    rotation.waitingTeamIds.splice(queueIdx, 1, replaceTeamId);

    const newTeamAId = match.teamAId === replaceTeamId ? queuedTeamId : match.teamAId;
    const newTeamBId = match.teamBId === replaceTeamId ? queuedTeamId : match.teamBId;
    rotation.currentMatch = this.createMatch(newTeamAId, newTeamBId);

    const reclaimedGuests = this.reclaimGuestsForTeams([queuedTeamId]);
    this.save();
    return { success: true, reclaimedGuests };
  }

  /** A player's true roster team — ignores any guest slot they may currently be filling elsewhere. */
  getHomeTeamId(playerId) {
    const team = this.activePelada.teams.find(t => t.playerIds.includes(playerId));
    return team ? team.id : null;
  }

  /**
   * A guest can't play for their adoptive team once their OWN team takes the pitch for
   * real — pulls back any guest whose home team is among `teamIds`, freeing them to play
   * for their real team. Returns the removed slots so the UI can prompt for a new
   * substitute on whichever team just lost its guest.
   */
  reclaimGuestsForTeams(teamIds) {
    const idSet = new Set((teamIds || []).filter(Boolean));
    if (idSet.size === 0) return [];
    const reclaimed = [];
    this.activePelada.guestSlots = (this.activePelada.guestSlots || []).filter(slot => {
      const homeTeamId = this.getHomeTeamId(slot.guestPlayerId);
      if (homeTeamId && idSet.has(homeTeamId)) {
        reclaimed.push(slot);
        return false;
      }
      return true;
    });
    return reclaimed;
  }

  /**
   * Replaces the waiting queue with an admin-chosen order — the array order itself IS the
   * priority (index 0 plays next). Any ids missing from `orderedTeamIds` (stale drag state,
   * teams that left the queue in the meantime) keep their relative order at the end.
   */
  reorderWaitingQueue(orderedTeamIds) {
    const rotation = this.activePelada.rotation;
    if (!rotation) return;
    const current = rotation.waitingTeamIds;
    const currentSet = new Set(current);
    const next = (orderedTeamIds || []).filter(id => currentSet.has(id));
    const seen = new Set(next);
    current.forEach(id => { if (!seen.has(id)) next.push(id); });
    rotation.waitingTeamIds = next;
    this.save();
  }

  startMatchTimer() {
    const match = this.activePelada.rotation?.currentMatch;
    if (!match || match.timerRunning) return;
    match.timerRunning = true;
    match.timerEndsAt = Date.now() + match.timerRemainingMs;
    this.saveQuiet();
  }

  pauseMatchTimer() {
    const match = this.activePelada.rotation?.currentMatch;
    if (!match || !match.timerRunning) return;
    match.timerRemainingMs = Math.max(0, match.timerEndsAt - Date.now());
    match.timerRunning = false;
    match.timerEndsAt = null;
    this.saveQuiet();
  }

  /** Ends the current match, applies the win-limit / win-streak / draw rules, and pulls in the next team(s). */
  endCurrentMatch() {
    const rotation = this.activePelada.rotation;
    const match = rotation?.currentMatch;
    if (!match) return { success: false, error: 'Nenhuma partida em andamento.' };

    // Mirrors the "Finalizar" button's disabled state — a match can only end once a team
    // has reached the configured goal target, or the clock has run out, even if this is
    // called directly.
    const remainingMs = match.timerRunning
      ? Math.max(0, match.timerEndsAt - Date.now())
      : match.timerRemainingMs;
    if (!this.canFinishMatch(match, remainingMs)) {
      return {
        success: false,
        error: `A partida só pode ser finalizada com ${this.goalsToFinish} gol(s) ou quando o tempo acabar.`,
      };
    }

    if (match.timerRunning) {
      match.timerRemainingMs = Math.max(0, match.timerEndsAt - Date.now());
      match.timerRunning = false;
      match.timerEndsAt = null;
    }

    const { teamAId, teamBId, scoreA, scoreB } = match;
    let winnerId = null;
    if (scoreA > scoreB) winnerId = teamAId;
    else if (scoreB > scoreA) winnerId = teamBId;

    rotation.log.unshift({
      teamAId, teamBId, scoreA, scoreB, winnerId,
      statsDelta: this.computeMatchStatsDelta(match.statsSnapshot, this.activePelada.stats),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    const outgoingIds = [];
    let stayingId = null;

    if (!winnerId) {
      // Draw — both teams go back to the waiting pool
      outgoingIds.push(teamAId, teamBId);
      rotation.streakTeamId = null;
      rotation.streakCount = 0;
    } else {
      const loserId = winnerId === teamAId ? teamBId : teamAId;
      outgoingIds.push(loserId);

      if (rotation.streakTeamId === winnerId) {
        rotation.streakCount += 1;
      } else {
        rotation.streakTeamId = winnerId;
        rotation.streakCount = 1;
      }

      // With the win limit on, a team that reaches the configured streak steps aside even
      // though it just won. With it off, the winner keeps playing until it is beaten.
      if (this.winLimitEnabled && rotation.streakCount >= this.winStreakToRest) {
        // Reached the configured win streak — steps aside even though it just won
        outgoingIds.push(winnerId);
        rotation.streakTeamId = null;
        rotation.streakCount = 0;
      } else {
        stayingId = winnerId;
      }
    }

    rotation.waitingTeamIds.push(...outgoingIds); // outgoing team(s) go to the BACK of the queue

    // Incoming team(s) come from the FRONT of the queue — its order is the admin's manual priority list.
    const neededCount = stayingId ? 1 : 2;
    const incomingIds = rotation.waitingTeamIds.slice(0, neededCount);
    rotation.waitingTeamIds = rotation.waitingTeamIds.slice(neededCount);

    const nextTeamAId = stayingId || incomingIds[0] || null;
    const nextTeamBId = stayingId ? (incomingIds[0] || null) : (incomingIds[1] || null);

    rotation.currentMatch = (nextTeamAId && nextTeamBId)
      ? this.createMatch(nextTeamAId, nextTeamBId)
      : null;

    // Only the newly-entering team(s) can possibly have a guest to reclaim — the team
    // that stayed on was already on the pitch, so its guests (if any) were already pulled.
    const reclaimedGuests = rotation.currentMatch ? this.reclaimGuestsForTeams(incomingIds) : [];

    this.save();
    return { success: true, winnerId, teamAId, teamBId, scoreA, scoreB, reclaimedGuests };
  }

  /** Finds which team a player currently belongs to (original roster or an active guest slot). */
  findPlayerTeamId(playerId) {
    const team = this.activePelada.teams.find(t => t.playerIds.includes(playerId));
    if (team) return team.id;
    const guestSlot = (this.activePelada.guestSlots || []).find(g => g.guestPlayerId === playerId);
    return guestSlot ? guestSlot.teamId : null;
  }

  /** Keeps the current match's live score in sync with goals scored by either side (all goals count, including guests/diaristas). */
  bumpMatchScore(teamId, delta) {
    const match = this.activePelada.rotation?.currentMatch;
    if (!match || !teamId) return;
    if (teamId === match.teamAId) match.scoreA = Math.max(0, match.scoreA + delta);
    else if (teamId === match.teamBId) match.scoreB = Math.max(0, match.scoreB + delta);
  }

  /**
   * Manually adjusts a team's match score without attributing it to any player —
   * used for own goals (gol contra) and score corrections, since the goal/assist
   * counters are always tied to a specific player and can't represent those.
   */
  adjustMatchScore(teamId, delta) {
    const match = this.activePelada.rotation?.currentMatch;
    if (!match || !teamId) return;
    this.bumpMatchScore(teamId, delta);

    this.activePelada.events.unshift({
      id: 'ev_' + Date.now(),
      type: 'manual-adjustment',
      teamId,
      delta,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    this.saveQuiet();
  }

  recordGoal(playerId, teamId, isGuest = false) {
    if (!this.activePelada.stats[playerId]) {
      this.activePelada.stats[playerId] = { goals: 0, assists: 0, guestGoals: 0, guestAssists: 0 };
    }

    if (isGuest) {
      this.activePelada.stats[playerId].guestGoals += 1;
    } else {
      this.activePelada.stats[playerId].goals += 1;
    }

    this.bumpMatchScore(teamId, 1);

    this.activePelada.events.unshift({
      id: 'ev_' + Date.now(),
      type: 'goal',
      playerId,
      teamId,
      isGuest,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    this.saveQuiet();
  }

  recordAssist(playerId, teamId, isGuest = false) {
    if (!this.activePelada.stats[playerId]) {
      this.activePelada.stats[playerId] = { goals: 0, assists: 0, guestGoals: 0, guestAssists: 0 };
    }

    if (isGuest) {
      this.activePelada.stats[playerId].guestAssists += 1;
    } else {
      this.activePelada.stats[playerId].assists += 1;
    }

    this.activePelada.events.unshift({
      id: 'ev_' + Date.now(),
      type: 'assist',
      playerId,
      teamId,
      isGuest,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    this.saveQuiet();
  }

  /** Undoing a goal/assist should also drop its entry from the live match timeline — removes
   *  the most recently recorded matching event (events are unshifted, so it's the first match). */
  removeMostRecentEvent(type, playerId, isGuest) {
    const idx = this.activePelada.events.findIndex(
      ev => ev.type === type && ev.playerId === playerId && !!ev.isGuest === !!isGuest
    );
    if (idx !== -1) this.activePelada.events.splice(idx, 1);
  }

  removeGoal(playerId, isGuest = false) {
    if (!this.activePelada.stats[playerId]) return;
    if (isGuest) {
      if (this.activePelada.stats[playerId].guestGoals > 0) {
        this.activePelada.stats[playerId].guestGoals -= 1;
      }
    } else {
      if (this.activePelada.stats[playerId].goals > 0) {
        this.activePelada.stats[playerId].goals -= 1;
      }
    }
    this.bumpMatchScore(this.findPlayerTeamId(playerId), -1);
    this.removeMostRecentEvent('goal', playerId, isGuest);
    this.saveQuiet();
  }

  removeAssist(playerId, isGuest = false) {
    if (!this.activePelada.stats[playerId]) return;
    if (isGuest) {
      if (this.activePelada.stats[playerId].guestAssists > 0) {
        this.activePelada.stats[playerId].guestAssists -= 1;
      }
    } else {
      if (this.activePelada.stats[playerId].assists > 0) {
        this.activePelada.stats[playerId].assists -= 1;
      }
    }
    this.removeMostRecentEvent('assist', playerId, isGuest);
    this.saveQuiet();
  }

  // Handle a player leaving early
  markPlayerDeparted(playerId, teamId) {
    if (!this.activePelada.departedPlayerIds.includes(playerId)) {
      this.activePelada.departedPlayerIds.push(playerId);
    }
    this.save();
  }

  // Revert a player departure (player returns to match)
  revertPlayerDeparture(playerId) {
    this.activePelada.departedPlayerIds = (this.activePelada.departedPlayerIds || []).filter(
      id => id !== playerId
    );
    // Remove any guest substitute slot assigned to replace this player
    this.activePelada.guestSlots = (this.activePelada.guestSlots || []).filter(
      slot => slot.departedPlayerId !== playerId
    );
    // The returning player can refill a spot a completion guest was covering — drop any
    // guest that would push the team past the roster limit again.
    const removedGuests = this.enforceTeamSizeLimit();
    this.save();
    return { success: true, removedGuests };
  }

  /**
   * Fills a team that started under-strength (fewer than 5 rostered players — e.g. the total
   * headcount didn't divide evenly across teams) with a guest from the waiting queue. Uses the
   * same guestSlots mechanism as a departure substitute, but with no specific player being
   * replaced — departedPlayerId stays null, and reclaimGuestsForTeams() pulls this guest back
   * exactly like any other once their real team takes the pitch.
   */
  assignTeamCompletion(teamId, guestPlayerId) {
    if (!guestPlayerId || !teamId) {
      return { success: false, error: 'Time ou jogador inválido.' };
    }
    // The team must still have room — never let the roster go past teamSize.
    if (this.getTeamCompleteness(teamId) >= this.teamSize) {
      return {
        success: false,
        error: `O time já está completo (${this.teamSize} jogadores).`,
      };
    }
    if ((this.activePelada.guestSlots || []).some(slot => slot.guestPlayerId === guestPlayerId)) {
      return { success: false, error: 'Este jogador já está completando outro time.' };
    }

    this.activePelada.guestSlots.push({ departedPlayerId: null, guestPlayerId, teamId });
    if (!this.activePelada.stats[guestPlayerId]) {
      this.activePelada.stats[guestPlayerId] = { goals: 0, assists: 0, guestGoals: 0, guestAssists: 0 };
    }
    this.enforceTeamSizeLimit();
    this.save();
    return { success: true };
  }

  // Assign guest completer to fill in for departed player
  assignGuestSubstitute(departedPlayerId, guestPlayerId, teamId) {
    if (guestPlayerId) {
      // Judge a swap against the team WITHOUT the guest it replaces — otherwise re-picking a
      // substitute on an already-complete team would be wrongly rejected.
      if (this.getTeamCompleteness(teamId, departedPlayerId) >= this.teamSize) {
        return {
          success: false,
          error: `O time já está completo (${this.teamSize} jogadores).`,
        };
      }
      const alreadyGuesting = (this.activePelada.guestSlots || []).some(
        slot => slot.guestPlayerId === guestPlayerId && slot.departedPlayerId !== departedPlayerId,
      );
      if (alreadyGuesting) {
        return { success: false, error: 'Este jogador já está jogando como convidado.' };
      }
    }

    // Remove previous guest slot for this departed player if exists
    this.activePelada.guestSlots = this.activePelada.guestSlots.filter(
      slot => slot.departedPlayerId !== departedPlayerId
    );

    if (guestPlayerId) {
      this.activePelada.guestSlots.push({
        departedPlayerId,
        guestPlayerId,
        teamId
      });

      if (!this.activePelada.stats[guestPlayerId]) {
        this.activePelada.stats[guestPlayerId] = { goals: 0, assists: 0, guestGoals: 0, guestAssists: 0 };
      }
    }

    this.enforceTeamSizeLimit();
    this.save();
    return { success: true };
  }

  // End Pelada & Apply to Ranking
  finishPelada() {
    const participatingPlayerIds = new Set();
    this.activePelada.teams.forEach(team => {
      team.playerIds.forEach(pid => participatingPlayerIds.add(pid));
    });

    const diaristaIds = new Set(this.activePelada.diaristaPlayerIds || []);
    const rotation = this.activePelada.rotation;
    const rotationLog = [...(rotation?.log || [])];
    const currentMatch = rotation?.currentMatch;
    if (currentMatch) {
      const remainingMs = currentMatch.timerRunning
        ? Math.max(0, currentMatch.timerEndsAt - Date.now())
        : currentMatch.timerRemainingMs;
      const canFinish = this.canFinishMatch(currentMatch, remainingMs);
      if (canFinish) {
        const winnerId = currentMatch.scoreA > currentMatch.scoreB
          ? currentMatch.teamAId
          : currentMatch.scoreB > currentMatch.scoreA
            ? currentMatch.teamBId
            : null;
        rotationLog.unshift({
          teamAId: currentMatch.teamAId,
          teamBId: currentMatch.teamBId,
          scoreA: currentMatch.scoreA,
          scoreB: currentMatch.scoreB,
          winnerId,
          statsDelta: this.computeMatchStatsDelta(currentMatch.statsSnapshot, this.activePelada.stats),
        });
      }
    }
    const teamRecord = this.getTeamRecordFromLog(rotationLog);

    const now = new Date();
    const historyEntry = this.normalizeHistoryEntry({
      id: 'pelada_' + now.getTime(),
      date: now.toLocaleDateString('pt-BR'),
      dateISO: now.toISOString(),
      teamCount: this.activePelada.teamCount,
      teams: JSON.parse(JSON.stringify(this.activePelada.teams)).map(team => ({
        ...team,
        wins: teamRecord[team.id]?.wins || 0,
        draws: teamRecord[team.id]?.draws || 0,
        losses: teamRecord[team.id]?.losses || 0,
      })),
      stats: JSON.parse(JSON.stringify(this.activePelada.stats)),
      matches: rotationLog,
      diaristaPlayerIds: Array.from(diaristaIds),
      awards: {
        craqueId: null,
        selecaoIds: [],
        puskasId: null,
        bagreId: null,
      },
      awardsSynced: {
        craque: false,
        selecao: false,
        puskas: false,
        bagre: false,
      },
    });

    const key = parseDateToPeriod(historyEntry.dateISO) || this.currentPeriodKey();
    this.ensurePeriodByKey(key);

    const teamByPlayer = {};
    this.activePelada.teams.forEach(team => {
      team.playerIds.forEach(pid => { teamByPlayer[pid] = team; });
    });

    participatingPlayerIds.forEach(pid => {
      if (diaristaIds.has(pid)) return; // Diaristas don't count toward the ranking table
      const pStats = this.activePelada.stats[pid];
      const periodStats = this.getOrCreatePeriodPlayer(key, pid);
      const record = teamRecord[teamByPlayer[pid]?.id];
      periodStats.participacao += 1;
      periodStats.wins += Number(record?.wins) || 0;
      periodStats.draws += Number(record?.draws) || 0;
      periodStats.losses += Number(record?.losses) || 0;
      if (pStats) {
        periodStats.goals += Number(pStats.goals) || 0;
        periodStats.assists += Number(pStats.assists) || 0;
      }
    });

    if (historyEntry.id && !this.monthlyStats[key].matchIds.includes(historyEntry.id)) {
      this.monthlyStats[key].matchIds.push(historyEntry.id);
    }

    this.history.unshift(historyEntry);
    this.syncCareerStatsFromMonthly({ silent: true });

    this.activePelada = {
      status: 'idle',
      teamCount: 4,
      presentPlayerIds: [],
      diaristaPlayerIds: [],
      teams: [],
      stats: {},
      departedPlayerIds: [],
      guestSlots: [],
      events: [],
      rotation: null
    };

    this.save();
  }

  // --- Monthly / Period helpers ---
  currentPeriodKey() {
    const now = new Date();
    return periodKey(now.getFullYear(), now.getMonth() + 1);
  }

  hydrateMonthlyStats() {
    if (!this.monthlyStats || typeof this.monthlyStats !== 'object') {
      this.monthlyStats = {};
    }

    // BolaBate's own historical months are only a valid fallback for the migrated
    // legacy pelada — every other pelada starts with no monthly stats at all.
    if (this.peladaId === LEGACY_PELADA_ID) {
      const seed = JSON.parse(JSON.stringify(INITIAL_MONTHLY_STATS));
      Object.entries(seed).forEach(([key, period]) => {
        const existing = this.monthlyStats[key];
        const hasPlayers = existing && existing.players && Object.keys(existing.players).length > 0;
        if (!hasPlayers) {
          this.monthlyStats[key] = period;
        }
      });
    }

    this.mergeHistoryIntoMonthly();
    this.syncWinLossStatsFromHistory();
  }

  mergeHistoryIntoMonthly() {
    (this.history || []).forEach(entry => {
      const key = parseDateToPeriod(entry.dateISO || entry.date);
      if (!key) return;
      this.ensurePeriodByKey(key);
      if (entry.id && this.monthlyStats[key].matchIds.includes(entry.id)) return;
      applyHistoryEntryToPeriod(this.monthlyStats[key], entry);
    });
  }

  syncWinLossStatsFromHistory() {
    const historicalStats = aggregateHistoryToMonthly(this.history || []);
    Object.entries(historicalStats).forEach(([key, period]) => {
      const targetPeriod = this.ensurePeriodByKey(key);
      Object.entries(period.players || {}).forEach(([playerId, stats]) => {
        const target = targetPeriod.players[playerId] || emptyPlayerStats();
        target.wins = Number(stats.wins) || 0;
        target.draws = Number(stats.draws) || 0;
        target.losses = Number(stats.losses) || 0;
        targetPeriod.players[playerId] = target;
      });
    });
  }

  ensurePeriodByKey(key) {
    if (!this.monthlyStats) this.monthlyStats = {};
    if (!this.monthlyStats[key]) {
      this.monthlyStats[key] = createEmptyPeriod();
    }
    if (!this.monthlyStats[key].players) this.monthlyStats[key].players = {};
    if (!Array.isArray(this.monthlyStats[key].matchIds)) this.monthlyStats[key].matchIds = [];
    return this.monthlyStats[key];
  }

  getOrCreatePeriodPlayer(key, playerId) {
    const period = this.ensurePeriodByKey(key);
    if (!period.players[playerId]) period.players[playerId] = emptyPlayerStats();
    return period.players[playerId];
  }

  getPeriodPlayerStats(playerId, key = this.selectedPeriodKey || this.currentPeriodKey()) {
    if (key && String(key).split('-')[1] === 'anual') {
      const year = Number(String(key).split('-')[0]);
      const agg = this.getYearSnapshot(year);
      return agg.players?.[playerId] || emptyPlayerStats();
    }
    const period = this.monthlyStats?.[key] || { players: {} };
    const merged = key === this.currentPeriodKey()
      ? this.mergeOverlayIntoPeriod(period, this.getLiveStatsOverlay())
      : period;
    return merged.players?.[playerId] || emptyPlayerStats();
  }

  isAnnualSelected() {
    return !!this.selectedPeriodKey && String(this.selectedPeriodKey).split('-')[1] === 'anual';
  }

  // Aggregates all periods of a given year into a single yearly snapshot
  getYearSnapshot(year) {
    const agg = {};
    Object.keys(this.monthlyStats || {}).forEach(key => {
      if (Number(String(key).split('-')[0]) !== Number(year)) return;
      const period = this.monthlyStats[key];
      Object.entries(period?.players || {}).forEach(([pid, stats]) => {
        if (!agg[pid]) agg[pid] = emptyPlayerStats();
        addPlayerStats(agg[pid], stats);
      });
    });
    if (Number(year) === new Date().getFullYear()) {
      Object.entries(this.getLiveStatsOverlay()).forEach(([pid, stats]) => {
        if (!agg[pid]) agg[pid] = emptyPlayerStats();
        addPlayerStats(agg[pid], stats);
      });
    }
    return { players: agg, matchIds: [], generatedAt: null };
  }

  syncCareerStatsFromMonthly({ silent = false } = {}) {
    this.players.forEach(player => {
      const totals = emptyPlayerStats();
      Object.values(this.monthlyStats || {}).forEach(period => {
        const stats = period?.players?.[player.id];
        if (!stats) return;
        STAT_FIELDS.forEach(field => {
          totals[field] += Number(stats[field]) || 0;
        });
      });
      STAT_FIELDS.forEach(field => {
        player[field] = totals[field];
      });
    });
    if (!silent) this.save();
  }

  rebuildMonthlyStatsFromHistory() {
    try {
      const isLegacyPelada = this.peladaId === LEGACY_PELADA_ID;
      const seeded = isLegacyPelada ? JSON.parse(JSON.stringify(INITIAL_MONTHLY_STATS)) : {};
      const fromHistory = aggregateHistoryToMonthly(this.history || []);
      this.monthlyStats = { ...seeded, ...fromHistory };

      if (isLegacyPelada) {
        Object.entries(seeded).forEach(([key, period]) => {
          const existing = this.monthlyStats[key];
          const hasPlayers = existing && existing.players && Object.keys(existing.players).length > 0;
          if (!hasPlayers) this.monthlyStats[key] = period;
        });
      }

      this.mergeHistoryIntoMonthly();
      this.syncCareerStatsFromMonthly({ silent: true });
      this.save();
    } catch (e) {
      console.error('Failed to rebuild monthly stats:', e);
    }
  }

  getAvailableYears() {
    // Only LEAGUE_START_YEAR onward — there's no real (or even seeded) data before it,
    // so offering earlier years just gives a way to land on a table that's always empty.
    const currentYear = Math.max(new Date().getFullYear(), LEAGUE_START_YEAR);
    const list = [];
    for (let y = currentYear; y >= LEAGUE_START_YEAR; y--) list.push(y);
    return list;
  }

  getMonthsForYear(year) {
    // The league's first year only offers its real starting month onward — every
    // earlier month is guaranteed empty. Later years get the full calendar.
    const startMonth = Number(year) === LEAGUE_START_YEAR ? LEAGUE_START_MONTH : 1;
    const count = 12 - startMonth + 1;
    return Array.from({ length: count }, (_, i) => startMonth + i);
  }

  getPeriodKey(year, month) {
    return periodKey(year, month);
  }

  getPeriodSnapshot(year, month) {
    const key = this.getPeriodKey(year, month);
    const empty = { players: {}, matchIds: [], generatedAt: null };
    const period = (this.monthlyStats && this.monthlyStats[key]) ? this.monthlyStats[key] : empty;
    if (key === this.currentPeriodKey()) {
      return this.mergeOverlayIntoPeriod(period, this.getLiveStatsOverlay());
    }
    return period;
  }

  /**
   * Goals/assists only get folded into monthlyStats when the admin taps "Terminar pelada"
   * (finishPelada). To make the ranking table react the instant a goal/assist is recorded —
   * instead of only once the match ends — this computes the live pelada's not-yet-committed
   * contribution (per participating, non-diarista player: 1 game + their current goals/assists)
   * so it can be merged into a period snapshot for display, without touching stored data.
   */
  getLiveStatsOverlay() {
    const overlay = {};
    if (this.activePelada.status !== 'live') return overlay;
    const diaristaIds = new Set(this.activePelada.diaristaPlayerIds || []);
    const participatingPlayerIds = new Set();
    const teamByPlayer = {};
    this.activePelada.teams.forEach(team => {
      team.playerIds.forEach(pid => {
        participatingPlayerIds.add(pid);
        teamByPlayer[pid] = team.id;
      });
    });
    const teamRecord = this.getTeamRecordFromLog(this.activePelada.rotation?.log);
    participatingPlayerIds.forEach(pid => {
      if (diaristaIds.has(pid)) return;
      const pStats = this.activePelada.stats[pid];
      const record = teamRecord[teamByPlayer[pid]];
      const entry = emptyPlayerStats();
      entry.participacao = 1;
      entry.goals = Number(pStats?.goals) || 0;
      entry.assists = Number(pStats?.assists) || 0;
      entry.wins = Number(record?.wins) || 0;
      entry.draws = Number(record?.draws) || 0;
      entry.losses = Number(record?.losses) || 0;
      overlay[pid] = entry;
    });
    return overlay;
  }

  /** Returns a new period object with `overlay`'s per-player deltas added in — never mutates the stored period. */
  mergeOverlayIntoPeriod(period, overlay) {
    if (!overlay || Object.keys(overlay).length === 0) return period;
    const merged = { ...period, players: { ...(period.players || {}) } };
    Object.entries(overlay).forEach(([pid, stats]) => {
      merged.players[pid] = addPlayerStats({ ...(merged.players[pid] || emptyPlayerStats()) }, stats);
    });
    return merged;
  }

  ensurePeriodExists(year, month) {
    const key = this.getPeriodKey(year, month);
    if (!this.monthlyStats) this.monthlyStats = {};
    if (!this.monthlyStats[key]) {
      this.monthlyStats[key] = { players: {}, matchIds: [], generatedAt: new Date().toISOString() };
      this.save();
    }
    return this.monthlyStats[key];
  }

  setSelectedPeriod(year, month) {
    if (String(month) === 'anual') {
      this.selectedPeriodKey = `${Number(year)}-anual`;
    } else {
      this.selectedPeriodKey = this.getPeriodKey(year, month);
    }
    try {
      localStorage.setItem(this.scopedKey('_selected_period'), this.selectedPeriodKey);
    } catch (e) {}
    this.notify();
  }

  getHistoryEntry(historyId) {
    return this.history.find(h => h.id === historyId) || null;
  }

  getHistoryParticipatingPlayers(entry) {
    const diaristas = new Set(entry.diaristaPlayerIds || []);
    const ids = new Set();
    (entry.teams || []).forEach(team => {
      (team.playerIds || []).forEach(pid => {
        if (!diaristas.has(pid)) ids.add(pid);
      });
    });
    return Array.from(ids).map(id => this.getPlayer(id)).filter(Boolean);
  }

  ensureHistoryAwardsSynced(entry) {
    if (!entry.awards) {
      entry.awards = { craqueId: null, selecaoIds: [], puskasId: null, bagreId: null };
    }
    if (!entry.awardsSynced) {
      entry.awardsSynced = {
        craque: !!entry.awards.craqueId,
        selecao: Array.isArray(entry.awards.selecaoIds) && entry.awards.selecaoIds.length > 0,
        puskas: !!entry.awards.puskasId,
        bagre: !!entry.awards.bagreId,
      };
    }
    ['puskas', 'bagre'].forEach(key => {
      if (entry.awardsSynced[key] === undefined) {
        const awardKey = key === 'puskas' ? 'puskasId' : 'bagreId';
        entry.awardsSynced[key] = !!entry.awards[awardKey];
      }
    });
    if (!Array.isArray(entry.awards.selecaoIds)) {
      entry.awards.selecaoIds = [];
    }
  }

  normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const awards = entry.awards || {};
    const normalized = {
      id: entry.id || 'pelada_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      date: entry.date || new Date().toLocaleDateString('pt-BR'),
      dateISO: entry.dateISO || new Date().toISOString(),
      teamCount: Number(entry.teamCount) || (Array.isArray(entry.teams) ? entry.teams.length : 0),
      teams: Array.isArray(entry.teams)
        ? entry.teams.map((team, index) => ({
          id: team.id || `team-${index + 1}`,
          name: team.name || `Time ${index + 1}`,
          color: team.color || this.getTeamColor(index),
          playerIds: Array.isArray(team.playerIds) ? [...team.playerIds] : [],
          wins: Number(team.wins) || 0,
          draws: Number(team.draws) || 0,
          // Peladas finished before this field existed have no way to retroactively
          // know their losses — defaults to 0.
          losses: Number(team.losses) || 0,
        }))
        : [],
      stats: entry.stats && typeof entry.stats === 'object' ? entry.stats : {},
      // Individual match results within this pelada (teamAId/teamBId/scoreA/scoreB/winnerId
      // + a per-player goals/assists statsDelta for THAT match specifically) — this is what
      // head-to-head comparisons use so they only count what happened between the two
      // players' teams, not the whole session. Peladas finished before this field existed
      // have no way to retroactively reconstruct it — defaults to an empty list.
      matches: Array.isArray(entry.matches) ? entry.matches : [],
      diaristaPlayerIds: Array.isArray(entry.diaristaPlayerIds) ? [...entry.diaristaPlayerIds] : [],
      awards: {
        craqueId: awards.craqueId || null,
        selecaoIds: Array.isArray(awards.selecaoIds) ? [...awards.selecaoIds] : [],
        puskasId: awards.puskasId || null,
        bagreId: awards.bagreId || null,
      },
      awardsSynced: entry.awardsSynced
        ? { ...entry.awardsSynced }
        : {
          craque: !!awards.craqueId,
          selecao: Array.isArray(awards.selecaoIds) && awards.selecaoIds.length > 0,
          puskas: !!awards.puskasId,
          bagre: !!awards.bagreId,
        },
    };

    this.ensureHistoryAwardsSynced(normalized);
    return normalized;
  }

  updateHistoryAwards(historyId, { craqueId = null, selecaoIds = [], puskasId = null, bagreId = null } = {}) {
    const entry = this.getHistoryEntry(historyId);
    if (!entry) return { success: false, error: 'Pelada não encontrada no histórico.' };

    this.ensureHistoryAwardsSynced(entry);

    const nextCraqueId = craqueId || null;
    const nextPuskasId = puskasId || null;
    const nextBagreId = bagreId || null;
    const nextSelecaoIds = Array.isArray(selecaoIds) ? selecaoIds.slice(0, 5) : [];

    const oldCraqueId = entry.awardsSynced.craque ? entry.awards.craqueId : null;
    const oldPuskasId = entry.awardsSynced.puskas ? entry.awards.puskasId : null;
    const oldBagreId = entry.awardsSynced.bagre ? entry.awards.bagreId : null;
    const oldSelecaoIds = entry.awardsSynced.selecao ? [...entry.awards.selecaoIds] : [];

    const key = parseDateToPeriod(entry.dateISO || entry.date) || this.currentPeriodKey();
    this.ensurePeriodByKey(key);

    const adjustAward = (oldId, nextId, field) => {
      if (oldId && oldId !== nextId) {
        const stats = this.getOrCreatePeriodPlayer(key, oldId);
        stats[field] = Math.max(0, (Number(stats[field]) || 0) - 1);
      }
      if (nextId && nextId !== oldId) {
        const stats = this.getOrCreatePeriodPlayer(key, nextId);
        stats[field] = (Number(stats[field]) || 0) + 1;
      }
    };

    adjustAward(oldCraqueId, nextCraqueId, 'craque');
    adjustAward(oldPuskasId, nextPuskasId, 'puskas');
    adjustAward(oldBagreId, nextBagreId, 'bagre');

    oldSelecaoIds.forEach(pid => {
      if (!nextSelecaoIds.includes(pid)) {
        const stats = this.getOrCreatePeriodPlayer(key, pid);
        stats.selecao = Math.max(0, (Number(stats.selecao) || 0) - 1);
      }
    });
    nextSelecaoIds.forEach(pid => {
      if (!oldSelecaoIds.includes(pid)) {
        const stats = this.getOrCreatePeriodPlayer(key, pid);
        stats.selecao = (Number(stats.selecao) || 0) + 1;
      }
    });

    entry.awards.craqueId = nextCraqueId;
    entry.awards.puskasId = nextPuskasId;
    entry.awards.bagreId = nextBagreId;
    entry.awards.selecaoIds = nextSelecaoIds;
    entry.awardsSynced.craque = !!nextCraqueId;
    entry.awardsSynced.puskas = !!nextPuskasId;
    entry.awardsSynced.bagre = !!nextBagreId;
    entry.awardsSynced.selecao = nextSelecaoIds.length > 0;

    this.syncCareerStatsFromMonthly({ silent: true });
    this.save();
    return { success: true };
  }

  /** Removes a pelada from history and subtracts its stats from the monthly table. */
  deleteHistoryEntry(historyId) {
    const entry = this.getHistoryEntry(historyId);
    if (!entry) return { success: false, error: 'Pelada não encontrada no histórico.' };

    const key = parseDateToPeriod(entry.dateISO || entry.date);
    if (key && this.monthlyStats && this.monthlyStats[key]) {
      removeHistoryEntryFromPeriod(this.monthlyStats[key], entry);
    }

    this.history = this.history.filter(e => e.id !== historyId);
    this.syncCareerStatsFromMonthly({ silent: true });
    this.save();
    return { success: true };
  }

  cancelPelada() {
    this.activePelada = {
      status: 'idle',
      teamCount: 4,
      presentPlayerIds: [],
      diaristaPlayerIds: [],
      teams: [],
      stats: {},
      departedPlayerIds: [],
      guestSlots: [],
      events: [],
      rotation: null
    };
    this.save();
  }

  // --- Export & Import ---
  exportToJson() {
    const data = {
      appName: 'BolaBate+',
      version: '1.1.0',
      exportedAt: new Date().toISOString(),
      theme: this.theme,
      matchDurationMs: this.matchDurationMs,
      goalsToFinish: this.goalsToFinish,
      winLimitEnabled: this.winLimitEnabled,
      winStreakToRest: this.winStreakToRest,
      players: this.players,
      history: this.history.map(entry => this.normalizeHistoryEntry(entry)).filter(Boolean),
      monthlyStats: this.monthlyStats,
    };
    return JSON.stringify(data, null, 2);
  }

  importFromJson(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data || !Array.isArray(data.players)) {
        throw new Error('Formato inválido: a lista de jogadores não foi encontrada.');
      }

      this.players = data.players.map(p => ({
        id: p.id || 'p_' + Math.random().toString(36).substr(2, 6),
        name: p.name || 'Jogador',
        stars: Number(p.stars) || 3.0,
        goals: Number(p.goals) || 0,
        assists: Number(p.assists) || 0,
        selecao: Number(p.selecao) || 0,
        puskas: Number(p.puskas) || 0,
        craque: Number(p.craque) || 0,
        bagre: Number(p.bagre) || 0,
        participacao: Number(p.participacao) || 0
      }));

      if (Array.isArray(data.history)) {
        this.history = data.history
          .map(entry => this.normalizeHistoryEntry(entry))
          .filter(Boolean);
      } else {
        this.history = [];
      }

      if (data.monthlyStats && typeof data.monthlyStats === 'object') {
        this.monthlyStats = data.monthlyStats;
      } else {
        this.monthlyStats = {};
      }
      this.hydrateMonthlyStats();
      this.syncCareerStatsFromMonthly({ silent: true });

      if (data.theme) {
        this.setTheme(data.theme);
      }

      const importedDurationMs = Number(data.matchDurationMs);
      const minMs = MIN_MATCH_DURATION_MIN * 60 * 1000;
      const maxMs = MAX_MATCH_DURATION_MIN * 60 * 1000;
      if (Number.isFinite(importedDurationMs) && importedDurationMs >= minMs && importedDurationMs <= maxMs) {
        this.matchDurationMs = importedDurationMs;
      }

      const importedGoals = Number(data.goalsToFinish);
      if (Number.isFinite(importedGoals)) {
        this.goalsToFinish = Math.min(
          MAX_GOALS_TO_FINISH,
          Math.max(MIN_GOALS_TO_FINISH, Math.round(importedGoals)),
        );
      }
      if (typeof data.winLimitEnabled === 'boolean') {
        this.winLimitEnabled = data.winLimitEnabled;
      } else if (typeof data.winnerStays === 'boolean') {
        // Backwards compatibility with exports made before the field was renamed.
        this.winLimitEnabled = data.winnerStays;
      }
      const importedStreak = Number(data.winStreakToRest);
      if (Number.isFinite(importedStreak)) {
        this.winStreakToRest = Math.min(
          MAX_WIN_STREAK_TO_REST,
          Math.max(MIN_WIN_STREAK_TO_REST, Math.round(importedStreak)),
        );
      }

      this.save();
      return {
        success: true,
        count: this.players.length,
        historyCount: this.history.length,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  resetToDefaults() {
    const isLegacyPelada = this.peladaId === LEGACY_PELADA_ID;
    this.players = isLegacyPelada ? JSON.parse(JSON.stringify(INITIAL_PLAYERS)) : [];
    this.history = [];
    this.monthlyStats = isLegacyPelada ? JSON.parse(JSON.stringify(INITIAL_MONTHLY_STATS)) : {};
    this.selectedPeriodKey = this.currentPeriodKey();
    this.matchDurationMs = MATCH_TIMER_DURATION_MS;
    this.goalsToFinish = DEFAULT_GOALS_TO_FINISH;
    this.winLimitEnabled = DEFAULT_WIN_LIMIT_ENABLED;
    this.winStreakToRest = DEFAULT_WIN_STREAK_TO_REST;
    this.syncCareerStatsFromMonthly({ silent: true });
    this.activePelada = {
      status: 'idle',
      teamCount: 4,
      presentPlayerIds: [],
      diaristaPlayerIds: [],
      teams: [],
      stats: {},
      departedPlayerIds: [],
      guestSlots: [],
      events: [],
      rotation: null
    };
    this.save();
  }
}

export const store = new Store();
