import { INITIAL_PLAYERS, calculatePoints } from '../data/seedData.js';

const STORAGE_KEY = 'bolabate_store_v2';
const THEME_KEY = 'bolabate_theme_v1';

class Store {
  constructor() {
    this.listeners = new Set();
    this.theme = localStorage.getItem(THEME_KEY) || 'dark';
    this.players = this.loadPlayers();
    this.activePelada = this.loadPelada();
    this.history = this.loadHistory();
    this.applyTheme(this.theme);
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
        return parsed;
      }
    } catch (e) {
      console.error('Error loading pelada:', e);
    }
    return {
      status: 'idle', // 'idle' | 'setup' | 'live'
      teamCount: 4,
      presentPlayerIds: [],
      teams: [], // [ { id: 'team-1', name: 'Time 1', playerIds: [], color: '#...' } ]
      stats: {
        // playerId -> { goals: number, assists: number, guestGoals: number, guestAssists: number }
      },
      departedPlayerIds: [], // IDs of players who went home early
      guestSlots: [], // [ { teamId, originalPlayerId, guestPlayerId } ]
      events: [] // chronological list of goals/actions
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
    try {
      localStorage.setItem(STORAGE_KEY + '_players', JSON.stringify(this.players));
      localStorage.setItem(STORAGE_KEY + '_pelada', JSON.stringify(this.activePelada));
      localStorage.setItem(STORAGE_KEY + '_history', JSON.stringify(this.history));
      localStorage.setItem(THEME_KEY, this.theme);
    } catch (e) {
      console.error('Error saving state:', e);
    }
    this.notify();
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

  addPlayer(name, stars = 3.0) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const newPlayer = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: trimmed,
      stars: Math.max(0.5, Math.min(5.0, Number(stars) || 3.0)),
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
    if (updates.goals !== undefined) player.goals = Math.max(0, Number(updates.goals));
    if (updates.assists !== undefined) player.assists = Math.max(0, Number(updates.assists));
    if (updates.selecao !== undefined) player.selecao = Math.max(0, Number(updates.selecao));
    if (updates.puskas !== undefined) player.puskas = Math.max(0, Number(updates.puskas));
    if (updates.craque !== undefined) player.craque = Math.max(0, Number(updates.craque));
    if (updates.bagre !== undefined) player.bagre = Math.max(0, Number(updates.bagre));
    if (updates.participacao !== undefined) player.participacao = Math.max(0, Number(updates.participacao));

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
  startPeladaSetup(teamCount = 4, selectedPlayerIds = []) {
    this.activePelada = {
      status: 'setup',
      teamCount: Math.max(3, Math.min(6, teamCount)),
      presentPlayerIds: selectedPlayerIds,
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
    this.save();
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

    // 1. All original team players count as participating (+1)
    this.activePelada.teams.forEach(team => {
      team.playerIds.forEach(pid => participatingPlayerIds.add(pid));
    });

    // 2. Update players table (goals, assists, participação only)
    participatingPlayerIds.forEach(pid => {
      const player = this.getPlayer(pid);
      if (player) {
        player.participacao = (Number(player.participacao) || 0) + 1;

        const pStats = this.activePelada.stats[pid];
        if (pStats) {
          player.goals = (Number(player.goals) || 0) + (Number(pStats.goals) || 0);
          player.assists = (Number(player.assists) || 0) + (Number(pStats.assists) || 0);
        }
      }
    });

    const now = new Date();

    // Save summary to history — all votações filled in later via Histórico tab
    this.history.unshift(this.normalizeHistoryEntry({
      id: 'pelada_' + now.getTime(),
      date: now.toLocaleDateString('pt-BR'),
      dateISO: now.toISOString(),
      teamCount: this.activePelada.teamCount,
      teams: JSON.parse(JSON.stringify(this.activePelada.teams)),
      stats: JSON.parse(JSON.stringify(this.activePelada.stats)),
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
    }));

    // Reset active pelada
    this.activePelada = {
      status: 'idle',
      teamCount: 4,
      presentPlayerIds: [],
      teams: [],
      stats: {},
      departedPlayerIds: [],
      guestSlots: [],
      events: []
    };

    this.save();
  }

  getHistoryEntry(historyId) {
    return this.history.find(h => h.id === historyId) || null;
  }

  getHistoryParticipatingPlayers(entry) {
    const ids = new Set();
    (entry.teams || []).forEach(team => {
      (team.playerIds || []).forEach(pid => ids.add(pid));
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
        }))
        : [],
      stats: entry.stats && typeof entry.stats === 'object' ? entry.stats : {},
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

    if (oldCraqueId && oldCraqueId !== nextCraqueId) {
      const oldPlayer = this.getPlayer(oldCraqueId);
      if (oldPlayer) {
        oldPlayer.craque = Math.max(0, (Number(oldPlayer.craque) || 0) - 1);
      }
    }

    if (oldPuskasId && oldPuskasId !== nextPuskasId) {
      const oldPlayer = this.getPlayer(oldPuskasId);
      if (oldPlayer) {
        oldPlayer.puskas = Math.max(0, (Number(oldPlayer.puskas) || 0) - 1);
      }
    }

    if (oldBagreId && oldBagreId !== nextBagreId) {
      const oldPlayer = this.getPlayer(oldBagreId);
      if (oldPlayer) {
        oldPlayer.bagre = Math.max(0, (Number(oldPlayer.bagre) || 0) - 1);
      }
    }

    oldSelecaoIds.forEach(pid => {
      if (!nextSelecaoIds.includes(pid)) {
        const oldPlayer = this.getPlayer(pid);
        if (oldPlayer) {
          oldPlayer.selecao = Math.max(0, (Number(oldPlayer.selecao) || 0) - 1);
        }
      }
    });

    if (nextCraqueId && nextCraqueId !== oldCraqueId) {
      const newPlayer = this.getPlayer(nextCraqueId);
      if (newPlayer) {
        newPlayer.craque = (Number(newPlayer.craque) || 0) + 1;
      }
    }

    if (nextPuskasId && nextPuskasId !== oldPuskasId) {
      const newPlayer = this.getPlayer(nextPuskasId);
      if (newPlayer) {
        newPlayer.puskas = (Number(newPlayer.puskas) || 0) + 1;
      }
    }

    if (nextBagreId && nextBagreId !== oldBagreId) {
      const newPlayer = this.getPlayer(nextBagreId);
      if (newPlayer) {
        newPlayer.bagre = (Number(newPlayer.bagre) || 0) + 1;
      }
    }

    nextSelecaoIds.forEach(pid => {
      if (!oldSelecaoIds.includes(pid)) {
        const newPlayer = this.getPlayer(pid);
        if (newPlayer) {
          newPlayer.selecao = (Number(newPlayer.selecao) || 0) + 1;
        }
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

    this.save();
    return { success: true };
  }

  cancelPelada() {
    this.activePelada = {
      status: 'idle',
      teamCount: 4,
      presentPlayerIds: [],
      teams: [],
      stats: {},
      departedPlayerIds: [],
      guestSlots: [],
      events: []
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
    this.activePelada = {
      status: 'idle',
      teamCount: 4,
      presentPlayerIds: [],
      teams: [],
      stats: {},
      departedPlayerIds: [],
      guestSlots: [],
      events: []
    };
    this.save();
  }
}

export const store = new Store();
