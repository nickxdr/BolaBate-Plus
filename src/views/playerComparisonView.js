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

  const firstPlayer = players[0];
  const secondPlayer = players[1];

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
              ${options}
            </select>
          </div>

          <div class="comparison-vs">
            VS
          </div>

          <div class="comparison-player-select">
            <label for="comparison-player-2">Jogador 2</label>

            <select id="comparison-player-2">
              ${players
                .map((player, index) => `
                  <option
                    value="${player.id}"
                    ${index === 1 ? 'selected' : ''}
                  >
                    ${escapeHtml(player.name)}
                  </option>
                `)
                .join('')}
            </select>
          </div>

        </div>

        <div id="comparison-result">
          ${renderComparisonResult(firstPlayer.id, secondPlayer.id)}
        </div>
      </div>
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
      <div class="comparison-history-title">
        🏟️ Confronto direto
      </div>

      <p>
        Ainda não existem partidas registradas entre esses jogadores.
      </p>
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
    result.innerHTML = renderComparisonResult(
      player1Select.value,
      player2Select.value
    );
  }

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