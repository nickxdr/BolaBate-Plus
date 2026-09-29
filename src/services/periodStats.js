// Helpers to build and aggregate period (YYYY-MM) statistics from history entries
export const OUTFIELD_STAT_FIELDS = ['goals', 'assists', 'selecao', 'puskas', 'craque', 'bagre', 'participacao', 'wins', 'draws', 'losses'];
// Goalkeeper numbers live in their own fields, so a player who has played both roles never gets
// outfield and goalkeeper results blended together (OVR, ranking and achievements read these).
export const GK_STAT_FIELDS = ['saves', 'goalsConceded', 'cleanSheets', 'gkParticipacao', 'gkWins', 'gkDraws', 'gkLosses'];
export const STAT_FIELDS = [...OUTFIELD_STAT_FIELDS, ...GK_STAT_FIELDS];

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function periodKey(year, month) {
  return `${year}-${pad(month)}`;
}

export function parseDateToPeriod(dateValue) {
  if (!dateValue) return null;

  if (typeof dateValue === 'string') {
    const br = dateValue.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return periodKey(Number(br[3]), Number(br[2]));

    const iso = dateValue.trim().match(/^(\d{4})-(\d{2})/);
    if (iso) return periodKey(Number(iso[1]), Number(iso[2]));
  }

  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return null;
    return periodKey(d.getFullYear(), d.getMonth() + 1);
  } catch (e) {
    return null;
  }
}

export function emptyPlayerStats() {
  const stats = {};
  STAT_FIELDS.forEach(field => { stats[field] = 0; });
  return stats;
}

/** Adds to a stat that may be missing on periods saved before that field existed. */
function bump(target, field, amount) {
  target[field] = (Number(target[field]) || 0) + (Number(amount) || 0);
}

export function createEmptyPeriod() {
  return { players: {}, matchIds: [], generatedAt: new Date().toISOString() };
}

export function statsHaveActivity(stats) {
  if (!stats) return false;
  return STAT_FIELDS.some(field => Number(stats[field]) > 0);
}

export function addPlayerStats(target, source, { includeGuest = false } = {}) {
  const dest = target || emptyPlayerStats();
  STAT_FIELDS.forEach(field => bump(dest, field, source?.[field]));
  if (includeGuest) {
    bump(dest, 'goals', source?.guestGoals);
    bump(dest, 'assists', source?.guestAssists);
  }
  return dest;
}

/**
 * Per-goalkeeper numbers for one pelada, credited match by match to whoever was in goal for
 * each team (`match.goalkeepers`, snapshotted at kickoff). Saves come from the pelada's stats;
 * a clean sheet is a match where the GK's team conceded nothing.
 */
export function computeGoalkeeperRecords(matches, stats, goalkeeperIds) {
  const records = {};
  const ensure = (id) => {
    if (!records[id]) {
      records[id] = { matches: 0, wins: 0, draws: 0, losses: 0, goalsConceded: 0, cleanSheets: 0, saves: 0 };
    }
    return records[id];
  };
  (goalkeeperIds || []).forEach(id => {
    ensure(id).saves = Number(stats?.[id]?.saves) || 0;
  });
  (matches || []).forEach(match => {
    const keepers = match.goalkeepers || {};
    [match.teamAId, match.teamBId].forEach(teamId => {
      const gkId = teamId && keepers[teamId];
      if (!gkId) return;
      const conceded = Number(teamId === match.teamAId ? match.scoreB : match.scoreA) || 0;
      const record = ensure(gkId);
      record.matches += 1;
      record.goalsConceded += conceded;
      if (conceded === 0) record.cleanSheets += 1;
      const field = !match.winnerId ? 'draws' : match.winnerId === teamId ? 'wins' : 'losses';
      record[field] += 1;
    });
  });
  return records;
}

/** Minimum peladas in goal before a keeper can be "best of the month". */
export const GOALKEEPER_MIN_PELADAS_FOR_BEST = 2;

/**
 * One number to rank goalkeepers ("melhor goleiro", Luva de Ouro): saves and clean sheets
 * count up, wins help, goals conceded count down. Ties are broken by fewer goals conceded.
 */
export function goalkeeperScore(stats) {
  return (Number(stats?.saves) || 0)
    + (Number(stats?.cleanSheets) || 0) * 3
    + (Number(stats?.gkWins) || 0) * 2
    - (Number(stats?.goalsConceded) || 0);
}

export function compareGoalkeepers(a, b) {
  return goalkeeperScore(b) - goalkeeperScore(a)
    || (Number(a?.goalsConceded) || 0) - (Number(b?.goalsConceded) || 0)
    || (Number(b?.saves) || 0) - (Number(a?.saves) || 0);
}

/** Goalkeeper figures for a history entry's GK, in the period-stat field names. */
function goalkeeperPeriodStats(record) {
  return {
    gkParticipacao: 1,
    saves: record?.saves || 0,
    goalsConceded: record?.goalsConceded || 0,
    cleanSheets: record?.cleanSheets || 0,
    gkWins: record?.wins || 0,
    gkDraws: record?.draws || 0,
    gkLosses: record?.losses || 0,
  };
}

/** Non-diarista goalkeepers of a history entry with their period figures. */
function eachCountedGoalkeeper(entry, fn) {
  const diaristas = new Set(entry.diaristaPlayerIds || []);
  const records = computeGoalkeeperRecords(entry.matches, entry.stats, entry.goalkeeperIds);
  (entry.goalkeeperIds || []).forEach(gkId => {
    if (diaristas.has(gkId)) return;
    fn(gkId, goalkeeperPeriodStats(records[gkId]));
  });
}

/**
 * Who played for `teamId` in one match. Matches logged since the "Trocar" (player swap) rule
 * carry their own `rosters` snapshot; older ones fall back to the team's final roster, which
 * is exact for them since rosters couldn't change mid-pelada before swaps existed.
 */
function matchRoster(match, teamId, teams) {
  if (match.rosters && Array.isArray(match.rosters[teamId])) return match.rosters[teamId];
  const team = (teams || []).find(t => t.id === teamId);
  return team ? team.playerIds || [] : [];
}

/** The team a player was on in a given match, or null if they didn't play in it. */
export function getPlayerTeamInMatch(match, playerId, teams) {
  for (const teamId of [match.teamAId, match.teamBId]) {
    if (matchRoster(match, teamId, teams).includes(playerId)) return teamId;
  }
  return null;
}

/**
 * Wins/draws/losses per player, credited match by match to whoever was actually on each team.
 * With no swaps this equals every player getting their team's full-day record.
 */
export function computePlayerRecordsFromMatches(matches, teams) {
  const records = {};
  (matches || []).forEach(match => {
    [match.teamAId, match.teamBId].forEach(teamId => {
      if (!teamId) return;
      const field = !match.winnerId ? 'draws' : match.winnerId === teamId ? 'wins' : 'losses';
      matchRoster(match, teamId, teams).forEach(pid => {
        if (!records[pid]) records[pid] = { wins: 0, draws: 0, losses: 0 };
        records[pid][field] += 1;
      });
    });
  });
  return records;
}

/** A history entry's per-player record, preferring the swap-aware playerRecords when it has them. */
function historyRecordFor(entry, pid, team) {
  if (entry.playerRecords) return entry.playerRecords[pid] || {};
  return team || {};
}

export function applyHistoryEntryToPeriod(period, entry) {
  const diaristas = new Set(entry.diaristaPlayerIds || []);
  const teamByPlayer = {};
  (entry.teams || []).forEach(team => {
    (team.playerIds || []).forEach(pid => {
      teamByPlayer[pid] = team;
    });
  });
  const participating = new Set(
    Object.keys(teamByPlayer).filter(pid => !diaristas.has(pid))
  );

  participating.forEach(pid => {
    if (!period.players[pid]) period.players[pid] = emptyPlayerStats();
    const stats = (entry.stats && entry.stats[pid]) || {};
    const record = historyRecordFor(entry, pid, teamByPlayer[pid]);
    period.players[pid].goals += Number(stats.goals) || 0;
    period.players[pid].assists += Number(stats.assists) || 0;
    period.players[pid].participacao += 1;
    period.players[pid].wins += Number(record.wins) || 0;
    period.players[pid].draws += Number(record.draws) || 0;
    period.players[pid].losses += Number(record.losses) || 0;
  });

  eachCountedGoalkeeper(entry, (gkId, gkStats) => {
    if (!period.players[gkId]) period.players[gkId] = emptyPlayerStats();
    GK_STAT_FIELDS.forEach(field => bump(period.players[gkId], field, gkStats[field]));
  });

  const awards = entry.awards || {};
  if (awards.craqueId) {
    if (!period.players[awards.craqueId]) period.players[awards.craqueId] = emptyPlayerStats();
    period.players[awards.craqueId].craque += 1;
  }
  if (awards.puskasId) {
    if (!period.players[awards.puskasId]) period.players[awards.puskasId] = emptyPlayerStats();
    period.players[awards.puskasId].puskas += 1;
  }
  if (awards.bagreId) {
    if (!period.players[awards.bagreId]) period.players[awards.bagreId] = emptyPlayerStats();
    period.players[awards.bagreId].bagre += 1;
  }
  if (Array.isArray(awards.selecaoIds)) {
    awards.selecaoIds.forEach(pid => {
      if (!period.players[pid]) period.players[pid] = emptyPlayerStats();
      period.players[pid].selecao += 1;
    });
  }

  if (entry.id && !period.matchIds.includes(entry.id)) {
    period.matchIds.push(entry.id);
  }
}

/** Exact inverse of applyHistoryEntryToPeriod — used when deleting a pelada. */
export function removeHistoryEntryFromPeriod(period, entry) {
  const diaristas = new Set(entry.diaristaPlayerIds || []);
  const teamByPlayer = {};
  (entry.teams || []).forEach(team => {
    (team.playerIds || []).forEach(pid => {
      teamByPlayer[pid] = team;
    });
  });
  const participating = new Set(
    Object.keys(teamByPlayer).filter(pid => !diaristas.has(pid))
  );

  participating.forEach(pid => {
    const target = period.players[pid];
    if (!target) return;
    const stats = (entry.stats && entry.stats[pid]) || {};
    const record = historyRecordFor(entry, pid, teamByPlayer[pid]);
    target.goals = Math.max(0, target.goals - (Number(stats.goals) || 0));
    target.assists = Math.max(0, target.assists - (Number(stats.assists) || 0));
    target.participacao = Math.max(0, target.participacao - 1);
    target.wins = Math.max(0, target.wins - (Number(record.wins) || 0));
    target.draws = Math.max(0, target.draws - (Number(record.draws) || 0));
    target.losses = Math.max(0, target.losses - (Number(record.losses) || 0));
  });

  eachCountedGoalkeeper(entry, (gkId, gkStats) => {
    const target = period.players[gkId];
    if (!target) return;
    GK_STAT_FIELDS.forEach(field => {
      target[field] = Math.max(0, (Number(target[field]) || 0) - gkStats[field]);
    });
  });

  const awards = entry.awards || {};
  if (awards.craqueId && period.players[awards.craqueId]) {
    period.players[awards.craqueId].craque = Math.max(0, period.players[awards.craqueId].craque - 1);
  }
  if (awards.puskasId && period.players[awards.puskasId]) {
    period.players[awards.puskasId].puskas = Math.max(0, period.players[awards.puskasId].puskas - 1);
  }
  if (awards.bagreId && period.players[awards.bagreId]) {
    period.players[awards.bagreId].bagre = Math.max(0, period.players[awards.bagreId].bagre - 1);
  }
  if (Array.isArray(awards.selecaoIds)) {
    awards.selecaoIds.forEach(pid => {
      if (period.players[pid]) {
        period.players[pid].selecao = Math.max(0, period.players[pid].selecao - 1);
      }
    });
  }

  period.matchIds = period.matchIds.filter(id => id !== entry.id);
}

export function aggregateHistoryToMonthly(history = []) {
  const monthly = {};

  history.forEach(entry => {
    const key = parseDateToPeriod(entry.dateISO || entry.date);
    if (!key) return;
    if (!monthly[key]) monthly[key] = createEmptyPeriod();
    applyHistoryEntryToPeriod(monthly[key], entry);
  });

  return monthly;
}
