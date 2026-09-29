import { store, isGoalkeeper } from '../state/store.js';
import { calculatePointsFromStats } from '../data/seedData.js';
import { getPlayerTeamInMatch, compareGoalkeepers } from '../services/periodStats.js';

function comparablePlayers() {
  return store.getActivePlayers()
    .filter(player => !player.isGuest)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function playerOptionsHtml(players) {
  return players
    .map(player => `<option value="${player.id}">${escapeHtml(player.name)}${isGoalkeeper(player) ? ' 🧤' : ''}</option>`)
    .join('');
}

export function renderPlayerComparisonView() {
  const players = comparablePlayers();

  if (players.length < 2) {
    return `
      <div class="comparison-empty">
        <p>É necessário ter pelo menos 2 jogadores para comparar.</p>
      </div>
    `;
  }

  const options = playerOptionsHtml(players);

  return `
    <div class="comparison-modal" id="player-comparison-modal">
      <div class="comparison-overlay" data-close-comparison></div>

      <div class="comparison-card">
        <div class="comparison-header">
          <div>
            <span class="comparison-kicker">⚔️ HEAD-TO-HEAD</span>
            <h2>Comparar jogadores</h2>
          </div>

          <button
            class="comparison-close"
            data-close-comparison
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div class="comparison-selectors">

          <div class="comparison-player-select">
            <label for="comparison-player-1">Jogador 1</label>

            <select id="comparison-player-1">
              <option value="" selected disabled>Selecione um jogador</option>
              ${options}
            </select>
          </div>

          <div class="comparison-vs">
            VS
          </div>

          <div class="comparison-player-select">
            <label for="comparison-player-2">Jogador 2</label>

            <select id="comparison-player-2">
              <option value="" selected disabled>Selecione um jogador</option>
              ${options}
            </select>
          </div>

        </div>

        <div id="comparison-result">
          ${renderComparisonPrompt()}
        </div>
      </div>
    </div>
  `;
}


function renderComparisonPrompt() {
  return `
    <div class="comparison-empty-prompt">
      <p>Escolha os dois jogadores acima para ver a comparação.</p>
    </div>
  `;
}

function renderComparisonResult(player1Id, player2Id) {
  const player1 = store.getPlayer(player1Id);
  const player2 = store.getPlayer(player2Id);

  if (!player1 || !player2) {
    return `
      <div class="comparison-error">
        Não foi possível encontrar os jogadores.
      </div>
    `;
  }

  if (isGoalkeeper(player1) !== isGoalkeeper(player2)) {
    return `
      <div class="comparison-error">
        Goleiros só podem ser comparados com outros goleiros.
      </div>
    `;
  }
  if (isGoalkeeper(player1)) return renderGoalkeeperComparison(player1, player2);

  const stats1 = store.getPeriodPlayerStats(player1.id);
  const stats2 = store.getPeriodPlayerStats(player2.id);

  const points1 = calculatePointsFromStats(stats1);
  const points2 = calculatePointsFromStats(stats2);
  const directHistory = getDirectHistory(player1.id, player2.id);

  const rows = [
    {
      icon: '⭐',
      label: 'Estrelas',
      value1: player1.stars ?? 0,
      value2: player2.stars ?? 0
    },
    {
      icon: '🏆',
      label: 'Pontos',
      value1: points1,
      value2: points2
    },
    {
      icon: '⚽',
      label: 'Gols',
      value1: stats1.goals || 0,
      value2: stats2.goals || 0
    },
    {
      icon: '🎯',
      label: 'Assistências',
      value1: stats1.assists || 0,
      value2: stats2.assists || 0
    },
    {
      icon: '🇧🇷',
      label: 'Seleção',
      value1: stats1.selecao || 0,
      value2: stats2.selecao || 0
    },
    {
      icon: '💎',
      label: 'Puskás',
      value1: stats1.puskas || 0,
      value2: stats2.puskas || 0
    },
    {
      icon: '👑',
      label: 'Craque',
      value1: stats1.craque || 0,
      value2: stats2.craque || 0
    },
    {
      icon: '🐟',
      label: 'Bagre',
      value1: stats1.bagre || 0,
      value2: stats2.bagre || 0
    },
    {
      icon: '📅',
      label: 'Participações',
      value1: stats1.participacao || 0,
      value2: stats2.participacao || 0
    }
  ];

  const rowsHtml = renderComparisonRows(rows);

  let verdict = '';

  if (points1 > points2) {
    verdict = `🏆 ${escapeHtml(player1.name)} leva vantagem!`;
  } else if (points2 > points1) {
    verdict = `🏆 ${escapeHtml(player2.name)} leva vantagem!`;
  } else {
    verdict = '🤝 Os dois estão empatados!';
  }

  return `
    <div class="comparison-players">

      <div class="comparison-player-name">
        ${escapeHtml(player1.name)}
      </div>

      <div class="comparison-player-name">
        ${escapeHtml(player2.name)}
      </div>

    </div>

    <div class="comparison-stats">
      ${rowsHtml}
    </div>

    <div class="comparison-verdict">
      ${verdict}
    </div>

    <div class="comparison-direct-history">
      <div class="comparison-section-heading">
        <div>
          <span class="comparison-section-kicker">HISTÓRICO</span>
          <div class="comparison-history-title">🏟️ Confronto direto</div>
        </div>
        <span class="comparison-match-count">${directHistory.length} ${directHistory.length === 1 ? 'partida' : 'partidas'}</span>
      </div>
      ${renderDirectHistory(directHistory, player1, player2)}
    </div>

    <div class="comparison-performance">
      <div class="comparison-section-heading">
        <div>
          <span class="comparison-section-kicker">DESEMPENHO</span>
          <div class="comparison-history-title">Gols e assistências no confronto</div>
        </div>
        <span class="comparison-performance-icon">⚽</span>
      </div>
      ${renderPerformance(directHistory, player1, player2)}
    </div>
  `;
}

/** Stat rows; `lowerIsBetter` rows (e.g. goals conceded) highlight the smaller number. */
function renderComparisonRows(rows) {
  return rows
    .map(row => {
      const value1 = Number(row.value1) || 0;
      const value2 = Number(row.value2) || 0;
      const oneWins = row.lowerIsBetter ? value1 < value2 : value1 > value2;
      const twoWins = row.lowerIsBetter ? value2 < value1 : value2 > value1;

      return `
        <div class="comparison-row">

          <div class="comparison-value ${oneWins ? 'winner' : ''}">
            ${row.display1 ?? value1}
          </div>

          <div class="comparison-stat">
            <span class="comparison-stat-icon">${row.icon}</span>
            <span>${row.label}</span>
          </div>

          <div class="comparison-value ${twoWins ? 'winner' : ''}">
            ${row.display2 ?? value2}
          </div>

        </div>
      `;
    })
    .join('');
}

/** GK vs GK: saves, goals conceded, clean sheets and results, plus their direct matchups. */
function renderGoalkeeperComparison(player1, player2) {
  const stats1 = store.getPeriodPlayerStats(player1.id);
  const stats2 = store.getPeriodPlayerStats(player2.id);
  const matchesPlayed = (s) => (Number(s.gkWins) || 0) + (Number(s.gkDraws) || 0) + (Number(s.gkLosses) || 0);
  const perMatch = (s) => {
    const played = matchesPlayed(s);
    return played ? (Number(s.saves) || 0) / played : 0;
  };

  const rows = [
    { icon: '⭐', label: 'Estrelas', value1: player1.stars ?? 0, value2: player2.stars ?? 0 },
    { icon: '🧤', label: 'Defesas', value1: stats1.saves, value2: stats2.saves },
    { icon: '🥅', label: 'Gols sofridos', value1: stats1.goalsConceded, value2: stats2.goalsConceded, lowerIsBetter: true },
    { icon: '🧱', label: 'Sem sofrer gol', value1: stats1.cleanSheets, value2: stats2.cleanSheets },
    { icon: '🏆', label: 'Vitórias', value1: stats1.gkWins, value2: stats2.gkWins },
    {
      icon: '📊',
      label: 'Defesas por partida',
      value1: perMatch(stats1),
      value2: perMatch(stats2),
      display1: perMatch(stats1).toFixed(1),
      display2: perMatch(stats2).toFixed(1),
    },
    { icon: '📅', label: 'Participações', value1: stats1.gkParticipacao, value2: stats2.gkParticipacao },
  ];

  const order = compareGoalkeepers(stats1, stats2);
  const verdict = order < 0
    ? `🧤 ${escapeHtml(player1.name)} leva vantagem!`
    : order > 0
      ? `🧤 ${escapeHtml(player2.name)} leva vantagem!`
      : '🤝 Os dois estão empatados!';

  const direct = getGoalkeeperDirectHistory(player1.id, player2.id);
  const totals = direct.reduce((t, m) => {
    t.saves1 += m.saves1;
    t.saves2 += m.saves2;
    t.conceded1 += m.score2;
    t.conceded2 += m.score1;
    return t;
  }, { saves1: 0, saves2: 0, conceded1: 0, conceded2: 0 });

  const performanceCard = (player, saves, conceded, cls) => `
    <div class="comparison-performance-player">
      <span class="comparison-history-player ${cls}">● ${escapeHtml(player.name)}</span>
      <div class="comparison-performance-values"><strong>${saves}</strong><strong>${conceded}</strong></div>
      <div class="comparison-performance-labels"><small>DEFESAS</small><small>GOLS SOFRIDOS</small></div>
    </div>
  `;

  return `
    <div class="comparison-players">
      <div class="comparison-player-name">🧤 ${escapeHtml(player1.name)}</div>
      <div class="comparison-player-name">🧤 ${escapeHtml(player2.name)}</div>
    </div>

    <div class="comparison-stats">${renderComparisonRows(rows)}</div>

    <div class="comparison-verdict">${verdict}</div>

    <div class="comparison-direct-history">
      <div class="comparison-section-heading">
        <div>
          <span class="comparison-section-kicker">HISTÓRICO</span>
          <div class="comparison-history-title">🥅 Frente a frente no gol</div>
        </div>
        <span class="comparison-match-count">${direct.length} ${direct.length === 1 ? 'partida' : 'partidas'}</span>
      </div>
      ${renderDirectHistory(direct, player1, player2)}
    </div>

    <div class="comparison-performance">
      <div class="comparison-section-heading">
        <div>
          <span class="comparison-section-kicker">DESEMPENHO</span>
          <div class="comparison-history-title">Defesas e gols sofridos no confronto</div>
        </div>
        <span class="comparison-performance-icon">🧤</span>
      </div>
      <div class="comparison-performance-grid">
        ${performanceCard(player1, totals.saves1, totals.conceded1, 'player-one')}
        ${performanceCard(player2, totals.saves2, totals.conceded2, 'player-two')}
      </div>
    </div>
  `;
}

/** Matches where these two goalkeepers were in opposite goals (history + the live pelada). */
function getGoalkeeperDirectHistory(gk1, gk2) {
  const matches = [];
  const collect = (match, teams, meta) => {
    const keepers = match.goalkeepers || {};
    const team1Id = [match.teamAId, match.teamBId].find(id => keepers[id] === gk1);
    const team2Id = [match.teamAId, match.teamBId].find(id => keepers[id] === gk2);
    if (!team1Id || !team2Id || team1Id === team2Id) return;
    const oneIsA = match.teamAId === team1Id;
    const delta = meta.delta || match.statsDelta || {};
    matches.push({
      ...meta,
      team1Name: (teams || []).find(t => t.id === team1Id)?.name || 'Time 1',
      team2Name: (teams || []).find(t => t.id === team2Id)?.name || 'Time 2',
      score1: Number(oneIsA ? match.scoreA : match.scoreB) || 0,
      score2: Number(oneIsA ? match.scoreB : match.scoreA) || 0,
      saves1: Number(delta[gk1]?.saves) || 0,
      saves2: Number(delta[gk2]?.saves) || 0,
    });
  };

  store.history.forEach(entry => {
    (entry.matches || []).forEach(match => {
      collect(match, entry.teams, { date: entry.date, dateISO: entry.dateISO || '', isActive: false });
    });
  });

  const pelada = store.activePelada;
  if (pelada?.status === 'live') {
    (pelada.rotation?.log || []).forEach(match => {
      collect(match, pelada.teams, { date: 'Hoje', dateISO: new Date().toISOString(), isActive: false });
    });
    const current = pelada.rotation?.currentMatch;
    if (current) {
      collect(
        { ...current, goalkeepers: current.goalkeepers || store.currentGoalkeeperMap(current) },
        pelada.teams,
        {
          date: 'Em andamento',
          dateISO: new Date().toISOString(),
          isActive: true,
          delta: store.computeMatchStatsDelta(current.statsSnapshot, pelada.stats),
        },
      );
    }
  }
  return matches;
}

/**
 * Builds the list of INDIVIDUAL MATCHES actually played between player1's team and
 * player2's team — not the whole pelada session. Each finished match carries its own
 * statsDelta (goals/assists scored in that specific match only, see
 * store.computeMatchStatsDelta), so a player's goals against one opponent don't leak
 * into their head-to-head with someone else they merely shared a pelada with.
 * Peladas finished before this per-match tracking existed have no way to retroactively
 * reconstruct it, so they simply contribute no matches here (rather than the old,
 * misleading whole-session totals).
 */
function getDirectHistory(player1Id, player2Id) {
  const matches = [];

  // Team membership is resolved per match, not per pelada — with the "Trocar" rule a player
  // can play for different teams on the same day.
  const teamName = (teams, id, fallback) => (teams || []).find(t => t.id === id)?.name || fallback;

  store.history.forEach(entry => {
    (entry.matches || []).forEach(match => {
      const team1Id = getPlayerTeamInMatch(match, player1Id, entry.teams);
      const team2Id = getPlayerTeamInMatch(match, player2Id, entry.teams);
      if (!team1Id || !team2Id || team1Id === team2Id) return; // not facing each other in this match
      const player1IsA = match.teamAId === team1Id;

      const delta = match.statsDelta || {};
      matches.push({
        date: entry.date || 'Data não informada',
        dateISO: entry.dateISO || '',
        isActive: false,
        team1Name: teamName(entry.teams, team1Id, 'Time 1'),
        team2Name: teamName(entry.teams, team2Id, 'Time 2'),
        score1: Number(player1IsA ? match.scoreA : match.scoreB) || 0,
        score2: Number(player1IsA ? match.scoreB : match.scoreA) || 0,
        goals1: Number(delta[player1Id]?.goals) || 0,
        assists1: Number(delta[player1Id]?.assists) || 0,
        goals2: Number(delta[player2Id]?.goals) || 0,
        assists2: Number(delta[player2Id]?.assists) || 0,
      });
    });
  });

  matches.sort((a, b) => {
    const dateA = a.dateISO ? new Date(a.dateISO).getTime() : 0;
    const dateB = b.dateISO ? new Date(b.dateISO).getTime() : 0;
    return dateB - dateA;
  });

  // The current, not-yet-archived pelada: rotation.log entries already carry a statsDelta
  // (endCurrentMatch computes it the same way); the still-ongoing match doesn't have one
  // yet, so it's computed live from its own kickoff snapshot.
  const activePelada = store.activePelada;

  if (activePelada?.status === 'live') {
    const currentMatch = activePelada.rotation?.currentMatch;
    const liveMatches = [
      ...(activePelada.rotation?.log || []),
      ...(currentMatch ? [{ ...currentMatch, isOngoing: true }] : []),
    ];

    liveMatches.forEach(match => {
      const team1Id = getPlayerTeamInMatch(match, player1Id, activePelada.teams);
      const team2Id = getPlayerTeamInMatch(match, player2Id, activePelada.teams);
      if (!team1Id || !team2Id || team1Id === team2Id) return;
      const player1IsA = match.teamAId === team1Id;
      const delta = match.isOngoing
        ? store.computeMatchStatsDelta(match.statsSnapshot, activePelada.stats)
        : (match.statsDelta || {});

      matches.unshift({
        date: match.isOngoing ? 'Em andamento' : `Hoje${match.time ? `, ${match.time}` : ''}`,
        dateISO: new Date().toISOString(),
        isActive: !!match.isOngoing,
        team1Name: teamName(activePelada.teams, team1Id, 'Time 1'),
        team2Name: teamName(activePelada.teams, team2Id, 'Time 2'),
        score1: Number(player1IsA ? match.scoreA : match.scoreB) || 0,
        score2: Number(player1IsA ? match.scoreB : match.scoreA) || 0,
        goals1: Number(delta[player1Id]?.goals) || 0,
        assists1: Number(delta[player1Id]?.assists) || 0,
        goals2: Number(delta[player2Id]?.goals) || 0,
        assists2: Number(delta[player2Id]?.assists) || 0,
      });
    });
  }

  return matches;
}

function renderDirectHistory(matches, player1, player2) {
  const totals = matches.reduce((result, match) => {
    if (match.score1 > match.score2) result.player1Wins += 1;
    else if (match.score2 > match.score1) result.player2Wins += 1;
    else result.draws += 1;
    return result;
  }, { player1Wins: 0, draws: 0, player2Wins: 0 });

  return `
    <div class="comparison-history-cards">
      <div class="comparison-history-stat">
        <span class="comparison-history-player player-one">● ${escapeHtml(player1.name)}</span>
        <strong>${totals.player1Wins}</strong>
        <small>VITÓRIAS</small>
      </div>
      <div class="comparison-history-stat">
        <span class="comparison-history-player draws">● Empates</span>
        <strong>${totals.draws}</strong>
        <small>EMPATES</small>
      </div>
      <div class="comparison-history-stat">
        <span class="comparison-history-player player-two">● ${escapeHtml(player2.name)}</span>
        <strong>${totals.player2Wins}</strong>
        <small>VITÓRIAS</small>
      </div>
    </div>
  `;
}

function renderPerformance(matches, player1, player2) {
  const totals = matches.reduce((result, match) => {
    result.player1Goals += match.goals1;
    result.player1Assists += match.assists1;
    result.player2Goals += match.goals2;
    result.player2Assists += match.assists2;
    return result;
  }, { player1Goals: 0, player1Assists: 0, player2Goals: 0, player2Assists: 0 });

  return `
    <div class="comparison-performance-grid">
      <div class="comparison-performance-player">
        <span class="comparison-history-player player-one">● ${escapeHtml(player1.name)}</span>
        <div class="comparison-performance-values">
          <strong>${totals.player1Goals}</strong><strong>${totals.player1Assists}</strong>
        </div>
        <div class="comparison-performance-labels"><small>GOLS</small><small>ASSISTÊNCIAS</small></div>
      </div>
      <div class="comparison-performance-player">
        <span class="comparison-history-player player-two">● ${escapeHtml(player2.name)}</span>
        <div class="comparison-performance-values">
          <strong>${totals.player2Goals}</strong><strong>${totals.player2Assists}</strong>
        </div>
        <div class="comparison-performance-labels"><small>GOLS</small><small>ASSISTÊNCIAS</small></div>
      </div>
    </div>
  `;
}


export function initPlayerComparisonView() {
  const modal = document.querySelector('#player-comparison-modal');

  if (!modal) return;

  const player1Select = modal.querySelector('#comparison-player-1');
  const player2Select = modal.querySelector('#comparison-player-2');
  const result = modal.querySelector('#comparison-result');

  function updateComparison() {
    const id1 = player1Select.value;
    const id2 = player2Select.value;

    result.innerHTML = (id1 && id2)
      ? renderComparisonResult(id1, id2)
      : renderComparisonPrompt();
  }

  const unsubscribe = store.subscribe(updateComparison);
  const refreshTimer = window.setInterval(() => {
    if (player1Select.value && player2Select.value) updateComparison();
  }, 500);
  modal._comparisonUnsubscribe = () => {
    window.clearInterval(refreshTimer);
    unsubscribe();
  };

  // Player 2's list follows player 1: goalkeepers only against goalkeepers, outfield only
  // against outfield.
  player1Select.addEventListener('change', () => {
    const first = store.getPlayer(player1Select.value);
    const keeper = isGoalkeeper(first);
    const previous = player2Select.value;
    const candidates = comparablePlayers().filter(p => isGoalkeeper(p) === keeper && p.id !== first?.id);
    player2Select.innerHTML = `
      <option value="" disabled>${keeper ? 'Selecione um goleiro' : 'Selecione um jogador'}</option>
      ${playerOptionsHtml(candidates)}
    `;
    player2Select.value = candidates.some(p => p.id === previous) ? previous : '';
    updateComparison();
  });
  player2Select.addEventListener('change', updateComparison);

  modal.querySelectorAll('[data-close-comparison]').forEach(button => {
    button.addEventListener('click', closePlayerComparison);
  });
}

export function openPlayerComparison() {
  console.log('1 - abriu função');

  const html = renderPlayerComparisonView();

  console.log('2 - HTML:', html);

  document.body.insertAdjacentHTML(
    'beforeend',
    html
  );

  console.log(
    '3 - modal:',
    document.querySelector('#player-comparison-modal')
  );

  document.body.classList.add('comparison-open');

  console.log(
    '4 - body:',
    document.body.className
  );

  initPlayerComparisonView();

  console.log('5 - terminou');
}


export function closePlayerComparison() {
  const modal = document.querySelector('#player-comparison-modal');

  if (modal) {
    modal._comparisonUnsubscribe?.();
    modal.remove();
  }

  document.body.classList.remove('comparison-open');
}


function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}