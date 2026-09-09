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

import { initCloudSync, scheduleCloudPush } from '../services/cloudSync.js';

const STORAGE_KEY = 'bolabate_store_v2';
const THEME_KEY = 'bolabate_theme_v1';

// Store methods that mutate league data — reserved for the admin account.
// Everyone else gets read-only access (also enforced by Firestore Security Rules).
const ADMIN_ONLY_METHODS = [
  'addPlayer', 'updatePlayer', 'deletePlayer',
  'startPeladaSetup', 'updatePeladaTeams', 'startLivePelada',
  'recordGoal', 'recordAssist', 'removeGoal', 'removeAssist',
  'markPlayerDeparted', 'revertPlayerDeparture', 'assignGuestSubstitute',
  'startMatchTimer', 'pauseMatchTimer', 'endCurrentMatch', 'ensureRotation',
  'startMatchBetween', 'reorderWaitingQueue',
  'finishPelada', 'updateHistoryAwards', 'cancelPelada', 'deleteHistoryEntry',
  'importFromJson', 'resetToDefaults',
];

const MATCH_TIMER_DURATION_MS = 10 * 60 * 1000; // 10 minutes

class Store {
  constructor() {
    this.listeners = new Set();
    this.theme = localStorage.getItem(THEME_KEY) || 'dark';
    this.isAdmin = false;         // true only for the admin Firebase UID
    this.cloudUserType = null;    // 'admin' | 'anon' | null
    this.cloudStatus = 'connecting';
    this.onBlocked = null;        // set by main.js → shows a toast
    this.onCloudStatus = null;    // set by main.js → UI status updates
    this.players = this.loadPlayers();
    this.activePelada = this.loadPelada();
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

  loadPlayers() {
    try {
      const data = localStorage.getItem(STORAGE_KEY + '_players');
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge with INITIAL_PLAYERS to ensure official stars and new players exist
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
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error loading players:', e);
    }
    return JSON.parse(JSON.stringify(INITIAL_PLAYERS));
  }

  loadPelada() {
    try {
      const data = localStorage.getItem(STORAGE_KEY + '_pelada');
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
      const data = localStorage.getItem(STORAGE_KEY + '_history');
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

  /** Writes only to localStorage — used for offline cache & cloud snapshots. */
  persistLocal() {
    try {
      localStorage.setItem(STORAGE_KEY + '_players', JSON.stringify(this.players));
      localStorage.setItem(STORAGE_KEY + '_pelada', JSON.stringify(this.activePelada));
      localStorage.setItem(STORAGE_KEY + '_history', JSON.stringify(this.history));
      localStorage.setItem(STORAGE_KEY + '_monthly', JSON.stringify(this.monthlyStats || {}));
      localStorage.setItem(STORAGE_KEY + '_selected_period', this.selectedPeriodKey || '');
      localStorage.setItem(THEME_KEY, this.theme);
    } catch (e) {
      console.error('Error saving state:', e);
    }
  }

  /** Connects the store to Firebase (anonymous auth + live cloud subscription). */
  initCloud() {
    initCloudSync(this);
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
      const data = localStorage.getItem(STORAGE_KEY + '_monthly');
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Error loading monthly stats:', e);
    }
    return {};
  }

  loadSelectedPeriod() {
    try {
      return localStorage.getItem(STORAGE_KEY + '_selected_period') || '';
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
    this.theme = theme === 'light' ? 'light' : 'dark';
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

  /** Counts match wins per team from the rotation log — a draw counts for neither side. Used to archive win totals into history when the pelada ends. */
  getTeamWinsFromLog(log) {
    const wins = {};
    (log || []).forEach(entry => {
      if (entry.winnerId) {
        wins[entry.winnerId] = (wins[entry.winnerId] || 0) + 1;
      }
    });
    return wins;
  }

  /** How many players a team can currently field: present roster minus departures, plus any guest fill-ins. */
  getTeamCompleteness(teamId) {
    const team = this.activePelada.teams.find(t => t.id === teamId);
    if (!team) return 0;
    const departed = new Set(this.activePelada.departedPlayerIds || []);
    const activeOriginal = team.playerIds.filter(pid => !departed.has(pid)).length;
    const activeGuests = (this.activePelada.guestSlots || []).filter(g => g.teamId === teamId).length;
    return activeOriginal + activeGuests;
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
      timerDurationMs: MATCH_TIMER_DURATION_MS,
      timerRemainingMs: MATCH_TIMER_DURATION_MS,
      timerRunning: false,
      timerEndsAt: null,
    };
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
    this.save();
    return { success: true };
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
    this.save();
  }

  pauseMatchTimer() {
    const match = this.activePelada.rotation?.currentMatch;
    if (!match || !match.timerRunning) return;
    match.timerRemainingMs = Math.max(0, match.timerEndsAt - Date.now());
    match.timerRunning = false;
    match.timerEndsAt = null;
    this.save();
  }

  /** Ends the current match, applies the winner-stays / 3-in-a-row / draw rules, and pulls in the next team(s). */
  endCurrentMatch() {
    const rotation = this.activePelada.rotation;
    const match = rotation?.currentMatch;
    if (!match) return { success: false, error: 'Nenhuma partida em andamento.' };

    // Mirrors the "Finalizar" button's disabled state — a match can only end once a team
    // has scored twice, or the clock has run out, even if this is called directly.
    const remainingMs = match.timerRunning
      ? Math.max(0, match.timerEndsAt - Date.now())
      : match.timerRemainingMs;
    const canFinish = match.scoreA >= 2 || match.scoreB >= 2 || remainingMs <= 0;
    if (!canFinish) {
      return { success: false, error: 'A partida só pode ser finalizada com 2 gols de diferença ou quando o tempo acabar.' };
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

      if (rotation.streakCount >= 3) {
        // Won 3 in a row — steps aside even though it just won
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

    this.save();
    return { success: true, winnerId, teamAId, teamBId, scoreA, scoreB };
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

    this.save();
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

    this.save();
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
    this.save();
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
    this.save();
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
    this.save();
  }

  // Assign guest completer to fill in for departed player
  assignGuestSubstitute(departedPlayerId, guestPlayerId, teamId) {
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

    this.save();
  }

  // End Pelada & Apply to Ranking
  finishPelada() {
    const participatingPlayerIds = new Set();
    this.activePelada.teams.forEach(team => {
      team.playerIds.forEach(pid => participatingPlayerIds.add(pid));
    });

    const diaristaIds = new Set(this.activePelada.diaristaPlayerIds || []);
    const teamWins = this.getTeamWinsFromLog(this.activePelada.rotation?.log);

    const now = new Date();
    const historyEntry = this.normalizeHistoryEntry({
      id: 'pelada_' + now.getTime(),
      date: now.toLocaleDateString('pt-BR'),
      dateISO: now.toISOString(),
      teamCount: this.activePelada.teamCount,
      teams: JSON.parse(JSON.stringify(this.activePelada.teams)).map(team => ({
        ...team,
        wins: teamWins[team.id] || 0,
      })),
      stats: JSON.parse(JSON.stringify(this.activePelada.stats)),
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

    participatingPlayerIds.forEach(pid => {
      if (diaristaIds.has(pid)) return; // Diaristas don't count toward the ranking table
      const pStats = this.activePelada.stats[pid];
      const periodStats = this.getOrCreatePeriodPlayer(key, pid);
      periodStats.participacao += 1;
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

    const seed = JSON.parse(JSON.stringify(INITIAL_MONTHLY_STATS));
    Object.entries(seed).forEach(([key, period]) => {
      const existing = this.monthlyStats[key];
      const hasPlayers = existing && existing.players && Object.keys(existing.players).length > 0;
      if (!hasPlayers) {
        this.monthlyStats[key] = period;
      }
    });

    this.mergeHistoryIntoMonthly();
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
    return this.monthlyStats?.[key]?.players?.[playerId] || emptyPlayerStats();
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
      const seeded = JSON.parse(JSON.stringify(INITIAL_MONTHLY_STATS));
      const fromHistory = aggregateHistoryToMonthly(this.history || []);
      this.monthlyStats = { ...seeded, ...fromHistory };

      Object.entries(seeded).forEach(([key, period]) => {
        const existing = this.monthlyStats[key];
        const hasPlayers = existing && existing.players && Object.keys(existing.players).length > 0;
        if (!hasPlayers) this.monthlyStats[key] = period;
      });

      this.mergeHistoryIntoMonthly();
      this.syncCareerStatsFromMonthly({ silent: true });
      this.save();
    } catch (e) {
      console.error('Failed to rebuild monthly stats:', e);
    }
  }

  getAvailableYears() {
    const years = new Set();
    Object.keys(this.monthlyStats || {}).forEach(key => {
      const year = Number(String(key).split('-')[0]);
      if (year) years.add(year);
    });
    (this.history || []).forEach(h => {
      const period = parseDateToPeriod(h.dateISO || h.date);
      if (period) years.add(Number(period.split('-')[0]));
    });
    const currentYear = new Date().getFullYear();
    years.add(currentYear);

    // Show a rolling window of recent years (current-4 .. current),
    // plus any older years that actually have data.
    let min = currentYear - 4;
    const dataMin = years.size ? Math.min(...Array.from(years)) : currentYear;
    if (dataMin < min) min = dataMin;

    const list = [];
    for (let y = currentYear; y >= min; y--) list.push(y);
    return list;
  }

  getMonthsForYear(year) {
    // always return 1..12 for selector
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }

  getPeriodKey(year, month) {
    return periodKey(year, month);
  }

  getPeriodSnapshot(year, month) {
    const key = this.getPeriodKey(year, month);
    const empty = { players: {}, matchIds: [], generatedAt: null };
    const period = (this.monthlyStats && this.monthlyStats[key]) ? this.monthlyStats[key] : empty;
    return period;
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
      localStorage.setItem(STORAGE_KEY + '_selected_period', this.selectedPeriodKey);
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
        }))
        : [],
      stats: entry.stats && typeof entry.stats === 'object' ? entry.stats : {},
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
    this.players = JSON.parse(JSON.stringify(INITIAL_PLAYERS));
    this.history = [];
    this.monthlyStats = JSON.parse(JSON.stringify(INITIAL_MONTHLY_STATS));
    this.selectedPeriodKey = this.currentPeriodKey();
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
