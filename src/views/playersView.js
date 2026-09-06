import { store } from '../state/store.js';
import { calculatePoints } from '../data/seedData.js';
import { showToast } from './rankingView.js';

export function renderPlayersView() {
  const container = document.createElement('div');
  container.className = 'view-container';

  let searchTerm = '';
  let sortBy = 'name'; // 'name' | 'stars-desc' | 'stars-asc'

  function getFilteredPlayers() {
    return store.players.filter(p => {
      return p.name.toLowerCase().includes(searchTerm.toLowerCase());
    }).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'stars-desc') return b.stars - a.stars;
      if (sortBy === 'stars-asc') return a.stars - b.stars;
      return 0;
    });
  }

  function render() {
    const players = getFilteredPlayers();

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
        <div>
          <h1 style="font-size: 1.6rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            👥 Gestão de Jogadores
          </h1>
          <p style="color: var(--text-muted); font-size: 0.85rem;">
            Cadastre jogadores, altere notas de estrelas e edite gols, assistências e estatísticas da liga.
          </p>
        </div>

        <button id="btn-add-player" class="btn btn-primary">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          Adicionar Jogador
        </button>
      </div>

      <!-- Search & Filters Toolbar -->
      <div class="card" style="padding: 14px; margin-bottom: 16px;">
        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          <div style="flex: 1; min-width: 200px;">
            <input type="text" id="player-search" class="input-field" placeholder="Buscar jogador por nome..." value="${escapeHtml(searchTerm)}" />
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">Ordenar:</span>
            <select id="player-sort" class="input-field" style="width: auto; padding: 8px 12px;">
              <option value="name" ${sortBy === 'name' ? 'selected' : ''}>Nome (A-Z)</option>
              <option value="stars-desc" ${sortBy === 'stars-desc' ? 'selected' : ''}>Mais Estrelas (5.0 → 0.5)</option>
              <option value="stars-asc" ${sortBy === 'stars-asc' ? 'selected' : ''}>Menos Estrelas (0.5 → 5.0)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Players Cards Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px;" id="players-grid">
        ${players.map(player => {
          const pts = calculatePoints(player);
          return `
          <div class="card" style="padding: 16px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 0;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 44px; height: 44px; border-radius: 12px; background: var(--bg-card-subtle); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; color: var(--pitch-green);">
                ${player.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 2px;">
                    ${escapeHtml(player.name)}
                  </h3>
                  <span style="font-size: 0.78rem; font-weight: 800; color: var(--pitch-green);">
                    (${pts} pts)
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <span class="star-badge" style="cursor: pointer;" data-edit-stars="${player.id}" title="Clique para editar estatísticas e estrelas">
                    ★ ${player.stars.toFixed(1)}
                  </span>
                  <span style="font-size: 0.78rem; color: var(--text-muted);">
                    ⚽ ${player.goals} | 👟 ${player.assists} | 🎟️ ${player.participacao}
                  </span>
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm btn-edit-player" data-id="${player.id}" title="Editar dados e estatísticas">
                ✏️
              </button>
              <button class="btn btn-secondary btn-sm btn-delete-player" data-id="${player.id}" style="color: var(--accent-red);" title="Excluir jogador">
                🗑️
              </button>
            </div>
          </div>
        `;
        }).join('')}
      </div>

      ${players.length === 0 ? `
        <div style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
          <p style="font-size: 1.1rem; font-weight: 600;">Nenhum jogador encontrado.</p>
        </div>
      ` : ''}
    `;

    // Bind search and filter events
    const searchInput = container.querySelector('#player-search');
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      render();
      // Keep cursor position
      const input = container.querySelector('#player-search');
      if (input) {
        input.focus();
        input.setSelectionRange(searchTerm.length, searchTerm.length);
      }
    });

    const sortSelect = container.querySelector('#player-sort');
    sortSelect.addEventListener('change', (e) => {
      sortBy = e.target.value;
      render();
    });

    // Bind Add Player
    container.querySelector('#btn-add-player').addEventListener('click', () => {
      openAddPlayerModal();
    });

    // Bind Edit Player
    container.querySelectorAll('.btn-edit-player').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        openEditPlayerModal(id);
      });
    });

    // Bind Direct Star Click
    container.querySelectorAll('[data-edit-stars]').forEach(badge => {
      badge.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-edit-stars');
        openEditPlayerModal(id);
      });
    });

    // Bind Delete Player
    container.querySelectorAll('.btn-delete-player').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const player = store.getPlayer(id);
        if (!player) return;
        if (confirm(`Tem certeza que deseja excluir "${player.name}"? As estatísticas dele serão removidas.`)) {
          store.deletePlayer(id);
          showToast(`Jogador "${player.name}" removido.`);
          render();
        }
      });
    });
  }

  function openAddPlayerModal() {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
      <div class="modal-overlay" id="add-modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">Novo Jogador</h2>
            <button class="modal-close" id="add-modal-close">&times;</button>
          </div>

          <form id="add-player-form">
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; color: var(--text-muted);">
                Nome do Jogador
              </label>
              <input type="text" name="name" class="input-field" placeholder="Ex: Lucas Silva" required autofocus />
            </div>

            <div style="margin-bottom: 20px;">
              <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; color: var(--text-muted);">
                Nível de Habilidade (0.5 a 5.0 Estrelas)
              </label>
              <div style="display: flex; align-items: center; gap: 12px;">
                <input type="range" name="stars" id="star-range-input" min="0.5" max="5.0" step="0.5" value="3.0" style="flex: 1; accent-color: var(--accent-gold); cursor: pointer;" />
                <span id="star-value-label" class="star-badge" style="font-size: 1rem; min-width: 60px; justify-content: center;">
                  3.0 ★
                </span>
              </div>
              <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 6px;">
                Dica: O balanceador busca média de ~4.0★ por jogador (~20★ total no time de 5).
              </p>
            </div>

            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" id="add-modal-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">Adicionar Jogador</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const close = () => { modalContainer.innerHTML = ''; };
    const overlay = modalContainer.querySelector('#add-modal-overlay');
    modalContainer.querySelector('#add-modal-close').addEventListener('click', close);
    modalContainer.querySelector('#add-modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const starRange = modalContainer.querySelector('#star-range-input');
    const starLabel = modalContainer.querySelector('#star-value-label');
    starRange.addEventListener('input', (e) => {
      starLabel.textContent = Number(e.target.value).toFixed(1) + ' ★';
    });

    modalContainer.querySelector('#add-player-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.name.value;
      const stars = parseFloat(starRange.value);
      const created = store.addPlayer(name, stars);
      if (created) {
        close();
        showToast(`Jogador "${created.name}" adicionado com sucesso!`);
        render();
      }
    });
  }

  function openEditPlayerModal(id) {
    const player = store.getPlayer(id);
    if (!player) return;

    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
      <div class="modal-overlay" id="edit-modal-overlay">
        <div class="modal-content" style="max-width: 520px;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Editar Jogador</h2>
              <span id="edit-live-points" style="font-size: 0.85rem; font-weight: 800; color: var(--pitch-green);">
                Total: ${calculatePoints(player)} pontos
              </span>
            </div>
            <button class="modal-close" id="edit-modal-close">&times;</button>
          </div>

          <form id="edit-player-form">
            <div style="margin-bottom: 14px;">
              <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 4px; color: var(--text-muted);">
                Nome do Jogador
              </label>
              <input type="text" name="name" class="input-field" value="${escapeHtml(player.name)}" required />
            </div>

            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 4px; color: var(--text-muted);">
                Nível de Habilidade (0.5 a 5.0 Estrelas)
              </label>
              <div style="display: flex; align-items: center; gap: 12px;">
                <input type="range" name="stars" id="edit-star-range" min="0.5" max="5.0" step="0.5" value="${player.stars}" style="flex: 1; accent-color: var(--accent-gold); cursor: pointer;" />
                <span id="edit-star-label" class="star-badge" style="font-size: 1rem; min-width: 60px; justify-content: center;">
                  ${player.stars.toFixed(1)} ★
                </span>
              </div>
            </div>

            <!-- Stats Grid -->
            <div style="border-top: 1px solid var(--border-color); padding-top: 14px; margin-bottom: 16px;">
              <h3 style="font-size: 0.9rem; font-weight: 700; color: var(--text-main); margin-bottom: 10px;">
                📊 Estatísticas Oficiais do Jogador:
              </h3>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                  <label style="font-size: 0.78rem; color: var(--pitch-green); font-weight: 700; display: block; margin-bottom: 2px;">
                    ⚽ Gols (+3 pts)
                  </label>
                  <input type="number" class="input-field stat-input" name="goals" value="${player.goals}" min="0" />
                </div>
                <div>
                  <label style="font-size: 0.78rem; color: var(--accent-blue); font-weight: 700; display: block; margin-bottom: 2px;">
                    👟 Assistências (+2 pts)
                  </label>
                  <input type="number" class="input-field stat-input" name="assists" value="${player.assists}" min="0" />
                </div>
                <div>
                  <label style="font-size: 0.78rem; color: var(--accent-gold); font-weight: 700; display: block; margin-bottom: 2px;">
                    ⭐ Craque (+5 pts)
                  </label>
                  <input type="number" class="input-field stat-input" name="craque" value="${player.craque}" min="0" />
                </div>
                <div>
                  <label style="font-size: 0.78rem; color: var(--pitch-green); font-weight: 700; display: block; margin-bottom: 2px;">
                    🏆 Seleção (+4 pts)
                  </label>
                  <input type="number" class="input-field stat-input" name="selecao" value="${player.selecao}" min="0" />
                </div>
                <div>
                  <label style="font-size: 0.78rem; color: var(--accent-gold); font-weight: 700; display: block; margin-bottom: 2px;">
                    🎯 Puskas (+3 pts)
                  </label>
                  <input type="number" class="input-field stat-input" name="puskas" value="${player.puskas}" min="0" />
                </div>
                <div>
                  <label style="font-size: 0.78rem; color: var(--accent-red); font-weight: 700; display: block; margin-bottom: 2px;">
                    🐟 Bagre (-3 pts)
                  </label>
                  <input type="number" class="input-field stat-input" name="bagre" value="${player.bagre}" min="0" />
                </div>
                <div style="grid-column: span 2;">
                  <label style="font-size: 0.78rem; color: var(--text-muted); font-weight: 700; display: block; margin-bottom: 2px;">
                    🎟️ Participações (+1 pt)
                  </label>
                  <input type="number" class="input-field stat-input" name="participacao" value="${player.participacao}" min="0" />
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" id="edit-modal-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar Alterações</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const close = () => { modalContainer.innerHTML = ''; };
    const overlay = modalContainer.querySelector('#edit-modal-overlay');
    modalContainer.querySelector('#edit-modal-close').addEventListener('click', close);
    modalContainer.querySelector('#edit-modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const starRange = modalContainer.querySelector('#edit-star-range');
    const starLabel = modalContainer.querySelector('#edit-star-label');
    starRange.addEventListener('input', (e) => {
      starLabel.textContent = Number(e.target.value).toFixed(1) + ' ★';
    });

    // Live points calculation preview
    const form = modalContainer.querySelector('#edit-player-form');
    const pointsLabel = modalContainer.querySelector('#edit-live-points');
    function updateLivePoints() {
      const g = Number(form.goals.value) || 0;
      const a = Number(form.assists.value) || 0;
      const c = Number(form.craque.value) || 0;
      const s = Number(form.selecao.value) || 0;
      const pus = Number(form.puskas.value) || 0;
      const b = Number(form.bagre.value) || 0;
      const p = Number(form.participacao.value) || 0;
      const total = (g * 3) + (a * 2) + (s * 4) + (pus * 3) + (c * 5) - (b * 3) + (p * 1);
      pointsLabel.textContent = `Total: ${total} pontos`;
    }

    form.querySelectorAll('.stat-input').forEach(input => {
      input.addEventListener('input', updateLivePoints);
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const newName = form.name.value.trim();
      const newStars = parseFloat(starRange.value);
      store.updatePlayer(id, {
        name: newName,
        stars: newStars,
        goals: form.goals.value,
        assists: form.assists.value,
        craque: form.craque.value,
        selecao: form.selecao.value,
        puskas: form.puskas.value,
        bagre: form.bagre.value,
        participacao: form.participacao.value
      });
      close();
      showToast(`Jogador "${newName}" e estatísticas atualizados!`);
      render();
    });
  }

  render();
  return container;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
