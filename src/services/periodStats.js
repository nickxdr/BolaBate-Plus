// Helpers to build and aggregate period (YYYY-MM) statistics from history entries
export function pad(n) {
  return String(n).padStart(2, '0');
}

export function periodKey(year, month) {
  // month: 1-12
  return `${year}-${pad(month)}`;
}

export function parseDateToPeriod(dateISO) {
  try {
    const d = new Date(dateISO);
    if (isNaN(d.getTime())) return null;
    return periodKey(d.getFullYear(), d.getMonth() + 1);
  } catch (e) {
    return null;
  }
}

export function emptyPlayerStats() {
  return { goals: 0, assists: 0, selecao: 0, puskas: 0, craque: 0, bagre: 0, participacao: 0 };
}

export function aggregateHistoryToMonthly(history = []) {
  const monthly = {};

  history.forEach(entry => {
    const key = parseDateToPeriod(entry.dateISO || entry.date);
    if (!key) return;
    if (!monthly[key]) {
      monthly[key] = { players: {}, matchIds: [], generatedAt: new Date().toISOString() };
    }

    const period = monthly[key];

    // mark match id
    if (entry.id && !period.matchIds.includes(entry.id)) period.matchIds.push(entry.id);

    // participating players from teams
    const participating = new Set();
    (entry.teams || []).forEach(team => {
      (team.playerIds || []).forEach(pid => participating.add(pid));
    });

    participating.forEach(pid => {
      if (!period.players[pid]) period.players[pid] = emptyPlayerStats();
      const p = period.players[pid];
      const s = (entry.stats && entry.stats[pid]) || {};
      const goals = (Number(s.goals) || 0) + (Number(s.guestGoals) || 0);
      const assists = (Number(s.assists) || 0) + (Number(s.guestAssists) || 0);
      p.goals += goals;
      p.assists += assists;
      p.participacao += 1;
    });

    // awards
    const awards = entry.awards || {};
    if (awards.craqueId) {
      const pid = awards.craqueId;
      if (!period.players[pid]) period.players[pid] = emptyPlayerStats();
      period.players[pid].craque += 1;
    }
    if (awards.puskasId) {
      const pid = awards.puskasId;
      if (!period.players[pid]) period.players[pid] = emptyPlayerStats();
      period.players[pid].puskas += 1;
    }
    if (awards.bagreId) {
      const pid = awards.bagreId;
      if (!period.players[pid]) period.players[pid] = emptyPlayerStats();
      period.players[pid].bagre += 1;
    }
    if (Array.isArray(awards.selecaoIds)) {
      awards.selecaoIds.forEach(pid => {
        if (!period.players[pid]) period.players[pid] = emptyPlayerStats();
        period.players[pid].selecao += 1;
      });
    }
  });

  return monthly;
}
