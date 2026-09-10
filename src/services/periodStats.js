// Helpers to build and aggregate period (YYYY-MM) statistics from history entries
export const STAT_FIELDS = ['goals', 'assists', 'selecao', 'puskas', 'craque', 'bagre', 'participacao', 'wins', 'draws', 'losses'];

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
  return { goals: 0, assists: 0, selecao: 0, puskas: 0, craque: 0, bagre: 0, participacao: 0, wins: 0, draws: 0, losses: 0 };
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
  dest.goals += (Number(source.goals) || 0) + (includeGuest ? Number(source.guestGoals) || 0 : 0);
  dest.assists += (Number(source.assists) || 0) + (includeGuest ? Number(source.guestAssists) || 0 : 0);
  dest.selecao += Number(source.selecao) || 0;
  dest.puskas += Number(source.puskas) || 0;
  dest.craque += Number(source.craque) || 0;
  dest.bagre += Number(source.bagre) || 0;
  dest.participacao += Number(source.participacao) || 0;
  dest.wins += Number(source.wins) || 0;
  dest.draws += Number(source.draws) || 0;
  dest.losses += Number(source.losses) || 0;
  return dest;
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
    const team = teamByPlayer[pid];
    period.players[pid].goals += Number(stats.goals) || 0;
    period.players[pid].assists += Number(stats.assists) || 0;
    period.players[pid].participacao += 1;
    period.players[pid].wins += Number(team?.wins) || 0;
    period.players[pid].draws += Number(team?.draws) || 0;
    period.players[pid].losses += Number(team?.losses) || 0;
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
    const team = teamByPlayer[pid];
    target.goals = Math.max(0, target.goals - (Number(stats.goals) || 0));
    target.assists = Math.max(0, target.assists - (Number(stats.assists) || 0));
    target.participacao = Math.max(0, target.participacao - 1);
    target.wins = Math.max(0, target.wins - (Number(team?.wins) || 0));
    target.draws = Math.max(0, target.draws - (Number(team?.draws) || 0));
    target.losses = Math.max(0, target.losses - (Number(team?.losses) || 0));
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
