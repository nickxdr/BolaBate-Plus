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
  const directRecord = getDirectRecord(player1Id, player2Id);

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
      <div class="comparison-history-heading">
        <div>
          <span class="comparison-history-kicker">HISTÓRICO</span>
          <div class="comparison-history-title">
            <span aria-hidden="true">🏟️</span>
            Confronto direto
          </div>
        </div>
        <span class="comparison-history-total">
          ${directRecord.matches} partida${directRecord.matches === 1 ? '' : 's'}
        </span>
      </div>

      ${directRecord.matches === 0
        ? `<p>Ainda não existem partidas registradas entre esses jogadores.</p>`
        : `<div class="comparison-direct-matches">
            <div class="comparison-direct-match">
              <span class="comparison-direct-match-label">
                <span class="comparison-direct-match-dot player-one"></span>
                ${escapeHtml(player1.name)}
              </span>
              <strong>${directRecord.player1Wins}</strong>
              <span class="comparison-direct-match-caption">vitória${directRecord.player1Wins === 1 ? '' : 's'}</span>
            </div>
            <div class="comparison-direct-match">
              <span class="comparison-direct-match-label">
                <span class="comparison-direct-match-dot draw"></span>
                Empates
              </span>
              <strong>${directRecord.draws}</strong>
            </div>
            <div class="comparison-direct-match">
              <span class="comparison-direct-match-label">
                <span class="comparison-direct-match-dot player-two"></span>
                ${escapeHtml(player2.name)}
              </span>
              <strong>${directRecord.player2Wins}</strong>
              <span class="comparison-direct-match-caption">vitória${directRecord.player2Wins === 1 ? '' : 's'}</span>
            </div>
          </div>`}
    </div>

    <div class="comparison-direct-performance">
      <div class="comparison-performance-heading">
        <div>
          <span class="comparison-history-kicker">DESEMPENHO</span>
          <h3>Gols e assistências no confronto</h3>
        </div>
        <span class="comparison-performance-icon" aria-hidden="true">⚽</span>
      </div>
      <div class="comparison-performance-players">
        ${renderDirectPerformancePlayer(player1, directRecord.player1Goals, directRecord.player1Assists, 'player-one')}
        ${renderDirectPerformancePlayer(player2, directRecord.player2Goals, directRecord.player2Assists, 'player-two')}
      </div>
    </div>
  `;
}

function renderDirectPerformancePlayer(player, goals, assists, colorClass) {
  return `
    <div class="comparison-performance-player">
      <div class="comparison-performance-player-name">
        <span class="comparison-direct-match-dot ${colorClass}"></span>
        ${escapeHtml(player.name)}
      </div>
      <div class="comparison-performance-stats">
        <div>
          <strong>${goals}</strong>
          <span>Gols</span>
        </div>
        <div>
          <strong>${assists}</strong>
          <span>Assistências</span>
        </div>
      </div>
    </div>
  `;
}

function getDirectRecord(player1Id, player2Id) {
  const record = {
    matches: 0,
    player1Wins: 0,
    draws: 0,
    player2Wins: 0,
    player1Goals: 0,
    player1Assists: 0,
    player2Goals: 0,
    player2Assists: 0
  };

  (store.history || []).forEach(entry => {
    const team1 = (entry.teams || []).find(team => (team.playerIds || []).includes(player1Id));
    const team2 = (entry.teams || []).find(team => (team.playerIds || []).includes(player2Id));

    if (!team1 || !team2 || team1.id === team2.id) return;

    let hasDirectMatch = false;

    (entry.matches || []).forEach(match => {
      const player1IsA = match.teamAId === team1.id && match.teamBId === team2.id;
      const player1IsB = match.teamBId === team1.id && match.teamAId === team2.id;
      if (!player1IsA && !player1IsB) return;

      hasDirectMatch = true;
      const score1 = player1IsA ? match.scoreA : match.scoreB;
      const score2 = player1IsA ? match.scoreB : match.scoreA;
      record.matches += 1;
      if (score1 > score2) record.player1Wins += 1;
      if (score2 > score1) record.player2Wins += 1;
      if (score1 === score2) record.draws += 1;
    });

    if (hasDirectMatch) {
      const stats1 = entry.stats?.[player1Id] || {};
      const stats2 = entry.stats?.[player2Id] || {};
      record.player1Goals += Number(stats1.goals) || 0;
      record.player1Assists += Number(stats1.assists) || 0;
      record.player2Goals += Number(stats2.goals) || 0;
      record.player2Assists += Number(stats2.assists) || 0;
    }
  });

  const activePelada = store.activePelada;
  const activeTeam1 = (activePelada?.teams || [])
    .find(team => (team.playerIds || []).includes(player1Id));
  const activeTeam2 = (activePelada?.teams || [])
    .find(team => (team.playerIds || []).includes(player2Id));

  if (activePelada?.status === 'live' && activeTeam1 && activeTeam2 && activeTeam1.id !== activeTeam2.id) {
    const activeMatches = activePelada.rotation?.log || [];
    const currentMatch = activePelada.rotation?.currentMatch;
    let hasActiveDirectMatch = false;

    activeMatches.forEach(match => {
      const player1IsA = match.teamAId === activeTeam1.id && match.teamBId === activeTeam2.id;
      const player1IsB = match.teamBId === activeTeam1.id && match.teamAId === activeTeam2.id;
      if (!player1IsA && !player1IsB) return;

      hasActiveDirectMatch = true;
      const score1 = player1IsA ? Number(match.scoreA) || 0 : Number(match.scoreB) || 0;
      const score2 = player1IsA ? Number(match.scoreB) || 0 : Number(match.scoreA) || 0;
      record.matches += 1;
      if (score1 > score2) record.player1Wins += 1;
      if (score2 > score1) record.player2Wins += 1;
      if (score1 === score2) record.draws += 1;
    });

    if (currentMatch) {
      const currentIsDirect = (
        (currentMatch.teamAId === activeTeam1.id && currentMatch.teamBId === activeTeam2.id) ||
        (currentMatch.teamBId === activeTeam1.id && currentMatch.teamAId === activeTeam2.id)
      );
      hasActiveDirectMatch = hasActiveDirectMatch || currentIsDirect;
    }

    if (hasActiveDirectMatch) {
      const stats1 = activePelada.stats?.[player1Id] || {};
      const stats2 = activePelada.stats?.[player2Id] || {};
      record.player1Goals += Number(stats1.goals) || 0;
      record.player1Assists += Number(stats1.assists) || 0;
      record.player2Goals += Number(stats2.goals) || 0;
      record.player2Assists += Number(stats2.assists) || 0;
    }
  }

  return record;
}


export function initPlayerComparisonView() {
  const modal = document.querySelector('#player-comparison-modal');

  if (!modal) return;

  const player1Select = modal.querySelector('#comparison-player-1');
  const player2Select = modal.querySelector('#comparison-player-2');
  const result = modal.querySelector('#comparison-result');
  let lastSelection = '';

  function updateComparison() {
    const id1 = player1Select.value;
    const id2 = player2Select.value;
    lastSelection = `${id1}:${id2}`;

    result.innerHTML = (id1 && id2)
      ? renderComparisonResult(id1, id2)
      : renderComparisonPrompt();
  }

  const refreshTimer = window.setInterval(() => {
    if (player1Select.value && player2Select.value && lastSelection) {
      updateComparison();
    }
  }, 500);
  const unsubscribe = store.subscribe(updateComparison);
  modal._comparisonCleanup = () => {
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
    modal._comparisonCleanup?.();
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