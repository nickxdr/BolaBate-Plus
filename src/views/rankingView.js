import { store } from '../state/store.js';
import { calculatePointsFromStats } from '../data/seedData.js';
import { emptyPlayerStats, statsHaveActivity } from '../services/periodStats.js';
import { openPlayerComparison } from './playerComparisonView.js';

function capitalizeMonth(str) {
  return str ? String(str).charAt(0).toUpperCase() + String(str).slice(1) : str;
}

export function renderRankingView() {
  const container = document.createElement('div');
  container.className = 'view-container';
  // Period selection defaults
  const now = new Date();
  const selKey = store.selectedPeriodKey || store.currentPeriodKey();
  const isAnnual = store.isAnnualSelected();
  const selYear = Number(String(selKey).split('-')[0]) || now.getFullYear();
  const selMonth = isAnnual ? 'anual' : (Number(String(selKey).split('-')[1]) || (now.getMonth() + 1));

  // Build period selector UI
  const years = store.getAvailableYears();
  const months = store.getMonthsForYear(Number(selYear));

  // Determine current snapshot for selected period (monthly or annual)
  const snapshot = isAnnual
    ? store.getYearSnapshot(selYear)
    : store.getPeriodSnapshot(Number(selYear), Number(selMonth));

  // Calculate sorted rankings from period snapshot (fallback to zeros)
  const rankedPlayers = [...store.players].map(p => {
    const stats = (snapshot && snapshot.players && snapshot.players[p.id]) || emptyPlayerStats();
    return {
      ...p,
      goals: stats.goals || 0,
      assists: stats.assists || 0,
      selecao: stats.selecao || 0,
      puskas: stats.puskas || 0,
      craque: stats.craque || 0,
      bagre: stats.bagre || 0,
      participacao: stats.participacao || 0,
      totalPoints: calculatePointsFromStats(stats)
    };
  }).filter(p => statsHaveActivity(p)).sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.goals !== a.goals) return b.goals - a.goals;
    if (b.craque !== a.craque) return b.craque - a.craque;
    return b.assists - a.assists;
  });

  const totalPlayers = rankedPlayers.length;
  // G4 is first 4, Z4 is bottom 4 (or less if few players)
  const g4Limit = 4;
  const z4StartIndex = Math.max(4, totalPlayers - 4);

  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
      <div>
        <h1 style="font-size: 1.6rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
          🏆 Tabela da Liga
        </h1>
        <p style="color: var(--text-muted); font-size: 0.85rem;">
          Ranking oficial. Escolha o mês (ou Anual) e o ano para ver a tabela daquele período.
        </p>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        <label style="font-size:0.85rem; color:var(--text-muted); margin-right:6px;">Ano</label>
        <select id="period-year" class="input-field" style="width:110px; margin-right:8px;">
          ${years.map(y => `<option value="${y}" ${String(y) === String(selYear) ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
        <label style="font-size:0.85rem; color:var(--text-muted); margin-right:6px; margin-left:6px;">Mês</label>
        <select id="period-month" class="input-field" style="width:140px;">
          <option value="anual" ${isAnnual ? 'selected' : ''}>Anual</option>
          ${months.map(m => `<option value="${m}" ${(!isAnnual && Number(m) === Number(selMonth)) ? 'selected' : ''}>${capitalizeMonth(new Date(0, m-1).toLocaleString('pt-BR', { month: 'long' }))}</option>`).join('')}
        </select>
        <button id="btn-player-comparison" class="btn btn-secondary btn-sm" title="Comparar jogadores" style="margin-left:8px;">
  ⚔️      Comparar
        </button>
        <button id="btn-share-whatsapp" class="btn btn-secondary btn-sm" title="Copiar ranking formatado para WhatsApp" style="margin-left:8px;">
          Compartilhar
        </button>
      </div>
    </div>

    <!-- Formula explanation legend -->
    <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 10px 14px; margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.78rem; color: var(--text-muted); align-items: center;">
      <span style="font-weight: 700; color: var(--text-main);">Regra de Pontuação:</span>
      <span>⚽ Gol: <strong style="color: var(--pitch-green);">+3</strong></span>
      <span>👟 Assist: <strong style="color: var(--accent-blue);">+2</strong></span>
      <span>⭐ Craque: <strong style="color: var(--accent-gold);">+5</strong></span>
      <span>🏆 Seleção: <strong style="color: var(--pitch-green);">+4</strong></span>
      <span>🎯 Puskas: <strong style="color: var(--accent-gold);">+3</strong></span>
      <span>🐟 Bagre: <strong style="color: var(--accent-red);">-3</strong></span>
      <span>🎟️ Partic.: <strong style="color: var(--text-main);">+1</strong></span>
    </div>

    <!-- Table Container -->
    <div style="margin: 10px 0 6px 0; font-weight:700; text-transform: capitalize;">
      ${isAnnual
        ? `Anual • ${selYear}`
        : capitalizeMonth(new Date(Number(selYear), Number(selMonth)-1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' }))}
    </div>
    ${rankedPlayers.length === 0 ? `
      <div class="card" style="text-align:center; padding: 36px 16px;">
        <div style="font-size: 2rem; margin-bottom: 8px;">📅</div>
        <h2 style="font-size: 1.05rem; margin-bottom: 6px;">Nenhuma estatística neste período</h2>
        <p style="color: var(--text-muted); font-size: 0.88rem;">
          Encerre uma pelada ou escolha outro período para ver a tabela.
        </p>
      </div>
    ` : `
    <div class="table-responsive">
      <table class="ranking-table">
        <thead>
          <tr>
            <th style="width: 50px;">Pos</th>
            <th style="text-align: left; padding-left: 14px;">Jogador</th>
            <th style="color: var(--pitch-green);">Pontos</th>
            <th>Gols (+3)</th>
            <th>Assists (+2)</th>
            <th>Seleção (+4)</th>
            <th>Puskas (+3)</th>
            <th>Craque (+5)</th>
            <th>Bagre (-3)</th>
            <th>Part. (+1)</th>
            ${isAnnual ? '' : '<th style="width: 40px;">Ação</th>'}
          </tr>
        </thead>
        <tbody id="ranking-tbody">
          <!-- Rows will be injected here -->
        </tbody>
      </table>
    </div>
    `}
  `;

  const tbody = container.querySelector('#ranking-tbody');
  if (tbody) {
  rankedPlayers.forEach((player, idx) => {
    const pos = idx + 1;
    const isTop1 = pos === 1;
    const isG4 = pos <= g4Limit;
    const isZ4 = pos > z4StartIndex;

    let rowClass = '';
    if (isTop1) rowClass = 'top-1';
    else if (isG4) rowClass = 'in-g4';
    else if (isZ4) rowClass = 'in-z4';

    const tr = document.createElement('tr');
    tr.className = rowClass;

    tr.innerHTML = `
      <td style="font-weight: 800;">
        ${isTop1 ? '👑 1º' : pos + 'º'}
      </td>
      <td class="player-name-cell">
        <span style="font-weight: 700;">${escapeHtml(player.name)}</span>
        <span class="star-badge" style="font-size: 0.72rem; padding: 1px 6px; margin-left: 6px;">
          ${player.stars.toFixed(1)}★
        </span>
        ${isG4 && !isTop1 ? '<span style="font-size: 0.68rem; background: var(--g4-bg); color: var(--g4-text); padding: 1px 5px; border-radius: 4px; margin-left: 4px; font-weight: 800;">G4</span>' : ''}
        ${isZ4 ? '<span style="font-size: 0.68rem; background: var(--z4-bg); color: var(--z4-text); padding: 1px 5px; border-radius: 4px; margin-left: 4px; font-weight: 800;">Z4</span>' : ''}
      </td>
      <td class="points-cell" style="font-size: 1.1rem; font-weight: 900;">
        ${player.totalPoints}
      </td>
      <td>${player.goals}</td>
      <td>${player.assists}</td>
      <td>${player.selecao}</td>
      <td>${player.puskas}</td>
      <td>${player.craque}</td>
      <td>${player.bagre}</td>
      <td>${player.participacao}</td>
      ${store.isAdmin ? `
      <td>
        ${isAnnual ? '' : `
        <button class="btn btn-secondary btn-sm edit-player-stat-btn" data-id="${player.id}" style="padding: 3px 7px;" title="Editar dados">
          ✏️
        </button>`}
      </td>
      ` : '<td></td>'}
    `;

    tbody.appendChild(tr);
  });
  }

  // Attach event handlers
  const yearSelect = container.querySelector('#period-year');
  const monthSelect = container.querySelector('#period-month');
  function onPeriodChange() {
    const y = Number(yearSelect.value);
    const m = monthSelect.value === 'anual' ? 'anual' : Number(monthSelect.value);
    store.setSelectedPeriod(y, m);
  }
  yearSelect.addEventListener('change', onPeriodChange);
  monthSelect.addEventListener('change', onPeriodChange);
  container.querySelectorAll('.edit-player-stat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pid = e.currentTarget.getAttribute('data-id');
      openEditPlayerModal(pid);
    });
  });

  container.querySelector('#btn-player-comparison')
  ?.addEventListener('click', () => {
    console.log('CLIQUEI NO COMPARAR');
    openPlayerComparison();
  });
  
  container.querySelector('#btn-share-whatsapp').addEventListener('click', () => {
    const shareLabel = isAnnual
      ? `Anual • ${selYear}`
      : capitalizeMonth(new Date(Number(selYear), Number(selMonth) - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' }));
    shareRankingWhatsApp(rankedPlayers, shareLabel);
  });

  return container;
}

function shareRankingWhatsApp(rankedPlayers, periodLabel = '') {
  let text = `⚽ *TABELA OFICIAL - BOLABATE+* ⚽\n`;
  if (periodLabel) text += `📅 *${periodLabel}*\n`;
  text += `\n`;
  if (!rankedPlayers.length) {
    text += `_Sem estatísticas neste período._\n\n_Gerado por BolaBate+ ⚽🔥_`;
  } else {
    text += `👑 *LÍDER:* ${rankedPlayers[0].name} (${rankedPlayers[0].totalPoints} pts)\n\n`;
    text += `*--- CLASSIFICAÇÃO ---*\n`;

  rankedPlayers.forEach((p, i) => {
    const pos = i + 1;
    let badge = '';
    if (pos === 1) badge = '👑';
    else if (pos <= 4) badge = '🟢 G4';
    else if (pos > rankedPlayers.length - 4) badge = '🔴 Z4';

    text += `${pos}º ${p.name} - ${p.totalPoints} pts (⚽ ${p.goals} | 👟 ${p.assists} | ⭐ ${p.craque} | 🐟 ${p.bagre}) ${badge}\n`;
  });

    text += `\n_Gerado por BolaBate+ ⚽🔥_`;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('Tabela copiada para o WhatsApp! Cole no grupo.');
  }).catch(() => {
    // Fallback if clipboard blocked
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('Tabela copiada para a área de transferência!');
  });
}

function openEditPlayerModal(playerId) {
  const player = store.getPlayer(playerId);
  if (!player) return;
  const stats = store.getPeriodPlayerStats(playerId);

  const modalContainer = document.getElementById('modal-container');
  modalContainer.innerHTML = `
    <div class="modal-overlay" id="edit-player-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">Editar Dados: ${escapeHtml(player.name)}</h2>
          <button class="modal-close" id="modal-close-btn">&times;</button>
        </div>

        <form id="edit-player-stats-form">
          <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 12px;">
            As alterações valem só para o mês selecionado no ranking.
          </p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Gols (+3 pts)</label>
              <input type="number" class="input-field" name="goals" value="${stats.goals || 0}" min="0" />
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Assists (+2 pts)</label>
              <input type="number" class="input-field" name="assists" value="${stats.assists || 0}" min="0" />
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Craque (+5 pts)</label>
              <input type="number" class="input-field" name="craque" value="${stats.craque || 0}" min="0" />
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Seleção (+4 pts)</label>
              <input type="number" class="input-field" name="selecao" value="${stats.selecao || 0}" min="0" />
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Puskas (+3 pts)</label>
              <input type="number" class="input-field" name="puskas" value="${stats.puskas || 0}" min="0" />
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Bagre (-3 pts)</label>
              <input type="number" class="input-field" name="bagre" value="${stats.bagre || 0}" min="0" />
            </div>
            <div style="grid-column: span 2;">
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Participações (+1 pt)</label>
              <input type="number" class="input-field" name="participacao" value="${stats.participacao || 0}" min="0" />
            </div>
          </div>

          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar Alterações</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const overlay = modalContainer.querySelector('#edit-player-overlay');
  const close = () => { modalContainer.innerHTML = ''; };

  modalContainer.querySelector('#modal-close-btn').addEventListener('click', close);
  modalContainer.querySelector('#modal-cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  modalContainer.querySelector('#edit-player-stats-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    store.updatePlayer(playerId, {
      goals: formData.get('goals'),
      assists: formData.get('assists'),
      craque: formData.get('craque'),
      selecao: formData.get('selecao'),
      puskas: formData.get('puskas'),
      bagre: formData.get('bagre'),
      participacao: formData.get('participacao')
    });
    close();
    showToast(`Dados de ${player.name} atualizados!`);
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>⚽</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, -20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}
