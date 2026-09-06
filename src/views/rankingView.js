import { store } from '../state/store.js';
import { calculatePoints } from '../data/seedData.js';

export function renderRankingView() {
  const container = document.createElement('div');
  container.className = 'view-container';

  // Calculate sorted rankings
  const rankedPlayers = [...store.players].map(p => ({
    ...p,
    totalPoints: calculatePoints(p)
  })).sort((a, b) => {
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
          Pontuação oficial da liga com G4 e Z4 atualizados em tempo real.
        </p>
      </div>

      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button id="btn-share-whatsapp" class="btn btn-secondary btn-sm" title="Copiar ranking formatado para WhatsApp">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.699c.974.532 1.777.82 2.796.82 3.18 0 5.767-2.587 5.768-5.766.001-3.181-2.585-5.766-5.768-5.766zm4.183 8.358c-.173.486-.87.893-1.428.983-.382.062-.876.108-2.548-.584-2.14-.886-3.52-3.076-3.626-3.217-.107-.142-.864-1.15-.864-2.193 0-1.042.547-1.554.743-1.768.196-.214.426-.268.568-.268.143 0 .285.002.409.008.131.006.307-.05.479.366.179.431.609 1.488.662 1.597.054.108.09.234.018.376-.072.143-.108.232-.215.358-.107.125-.226.28-.323.376-.107.107-.22.223-.095.438.125.214.557.917 1.196 1.487.822.732 1.517.96 1.731 1.066.214.107.34.09.464-.054.125-.143.535-.625.678-.839.143-.214.286-.179.482-.107.196.071 1.249.589 1.464.696.214.107.357.161.41.25.054.089.054.518-.119 1.004zM12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.98-1.306A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
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
            <th style="width: 40px;">Ação</th>
          </tr>
        </thead>
        <tbody id="ranking-tbody">
          <!-- Rows will be injected here -->
        </tbody>
      </table>
    </div>
  `;

  const tbody = container.querySelector('#ranking-tbody');
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
      <td>
        <button class="btn btn-secondary btn-sm edit-player-stat-btn" data-id="${player.id}" style="padding: 3px 7px;" title="Editar dados">
          ✏️
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Attach event handlers
  container.querySelectorAll('.edit-player-stat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pid = e.currentTarget.getAttribute('data-id');
      openEditPlayerModal(pid);
    });
  });

  container.querySelector('#btn-share-whatsapp').addEventListener('click', () => {
    shareRankingWhatsApp(rankedPlayers);
  });

  return container;
}

function shareRankingWhatsApp(rankedPlayers) {
  let text = `⚽ *TABELA OFICIAL - BOLABATE+* ⚽\n\n`;
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

  const modalContainer = document.getElementById('modal-container');
  modalContainer.innerHTML = `
    <div class="modal-overlay" id="edit-player-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">Editar Dados: ${escapeHtml(player.name)}</h2>
          <button class="modal-close" id="modal-close-btn">&times;</button>
        </div>

        <form id="edit-player-stats-form">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Gols (+3 pts)</label>
              <input type="number" class="input-field" name="goals" value="${player.goals}" min="0" />
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Assists (+2 pts)</label>
              <input type="number" class="input-field" name="assists" value="${player.assists}" min="0" />
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Craque (+5 pts)</label>
              <input type="number" class="input-field" name="craque" value="${player.craque}" min="0" />
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Seleção (+4 pts)</label>
              <input type="number" class="input-field" name="selecao" value="${player.selecao}" min="0" />
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Puskas (+3 pts)</label>
              <input type="number" class="input-field" name="puskas" value="${player.puskas}" min="0" />
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Bagre (-3 pts)</label>
              <input type="number" class="input-field" name="bagre" value="${player.bagre}" min="0" />
            </div>
            <div style="grid-column: span 2;">
              <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 4px;">Participações (+1 pt)</label>
              <input type="number" class="input-field" name="participacao" value="${player.participacao}" min="0" />
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
