import { store } from '../state/store.js';
import { calculatePointsFromStats } from '../data/seedData.js';

export function renderPlayerComparisonView() {
  const players = [...store.players]
    .filter(player => !player.isGuest)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (players.length < 2) {
    return `
      <div class="comparison-empty">
        <p>É necessário ter pelo menos 2 jogadores para comparar.</p>
      </div>
    `;
  }

  const options = players
    .map(player => `
      <option value="${player.id}">${escapeHtml(player.name)}</option>
    `)
    .join('');

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

  const rowsHtml = rows
    .map(row => {
      const value1 = Number(row.value1) || 0;
      const value2 = Number(row.value2) || 0;

      return `
        <div class="comparison-row">

          <div class="comparison-value ${value1 > value2 ? 'winner' : ''}">
            ${value1}
          </div>

          <div class="comparison-stat">
            <span class="comparison-stat-icon">${row.icon}</span>
            <span>${row.label}</span>
          </div>

          <div class="comparison-value ${value2 > value1 ? 'winner' : ''}">
            ${value2}
          </div>

        </div>
      `;
    })
    .join('');

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

function getDirectHistory(player1Id, player2Id) {
  const history = [...store.history]
    .map(entry => {
      const team1 = (entry.teams || []).find(team => (team.playerIds || []).includes(player1Id));
      const team2 = (entry.teams || []).find(team => (team.playerIds || []).includes(player2Id));

      if (!team1 || !team2 || team1.id === team2.id) return null;

      return {
        date: entry.date || 'Data não informada',
        dateISO: entry.dateISO || '',
        team1Name: team1.name || 'Time 1',
        team2Name: team2.name || 'Time 2',
        team1Wins: Number(team1.wins) || 0,
        team2Wins: Number(team2.wins) || 0,
        stats1: entry.stats?.[player1Id] || {},
        stats2: entry.stats?.[player2Id] || {},
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const dateA = a.dateISO ? new Date(a.dateISO).getTime() : 0;
      const dateB = b.dateISO ? new Date(b.dateISO).getTime() : 0;
      return dateB - dateA;
    });

  const activePelada = store.activePelada;
  const activeTeam1 = (activePelada?.teams || [])
    .find(team => (team.playerIds || []).includes(player1Id));
  const activeTeam2 = (activePelada?.teams || [])
    .find(team => (team.playerIds || []).includes(player2Id));

  if (activePelada?.status === 'live' && activeTeam1 && activeTeam2 && activeTeam1.id !== activeTeam2.id) {
    const directMatches = [
      ...(activePelada.rotation?.log || []),
      ...(activePelada.rotation?.currentMatch ? [activePelada.rotation.currentMatch] : [])
    ].filter(match => (
      (match.teamAId === activeTeam1.id && match.teamBId === activeTeam2.id) ||
      (match.teamBId === activeTeam1.id && match.teamAId === activeTeam2.id)
    ));

    if (directMatches.length > 0) {
      const completedMatches = directMatches.filter(match => match !== activePelada.rotation?.currentMatch);
      const directWins = completedMatches.reduce((result, match) => {
        const player1IsA = match.teamAId === activeTeam1.id;
        const score1 = Number(player1IsA ? match.scoreA : match.scoreB) || 0;
        const score2 = Number(player1IsA ? match.scoreB : match.scoreA) || 0;
        if (score1 > score2) result.team1Wins += 1;
        else if (score2 > score1) result.team2Wins += 1;
        else result.draws += 1;
        return result;
      }, { team1Wins: 0, team2Wins: 0, draws: 0 });

      history.unshift({
        date: 'Em andamento',
        dateISO: new Date().toISOString(),
        team1Name: activeTeam1.name || 'Time 1',
        team2Name: activeTeam2.name || 'Time 2',
        team1Wins: directWins.team1Wins,
        team2Wins: directWins.team2Wins,
        activeDraws: directWins.draws,
        isActive: true,
        stats1: activePelada.stats?.[player1Id] || {},
        stats2: activePelada.stats?.[player2Id] || {}
      });
    }
  }

  return history;
}

function renderDirectHistory(history, player1, player2) {
  const totals = history.reduce((result, match) => {
    if (match.team1Wins > match.team2Wins) result.player1Wins += 1;
    else if (match.team2Wins > match.team1Wins) result.player2Wins += 1;
    else if (match.isActive) result.draws += Number(match.activeDraws) || 0;
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

function renderPerformance(history, player1, player2) {
  const totals = history.reduce((result, match) => {
    result.player1Goals += Number(match.stats1.goals) || 0;
    result.player1Assists += Number(match.stats1.assists) || 0;
    result.player2Goals += Number(match.stats2.goals) || 0;
    result.player2Assists += Number(match.stats2.assists) || 0;
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

  player1Select.addEventListener('change', updateComparison);
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