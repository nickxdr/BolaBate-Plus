import { store } from '../state/store.js';
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
            Cadastre jogadores e altere apenas o nome e as estrelas. As estatísticas (gols, assistências, votos) são editadas na aba Ranking.
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
          return `
          <div class="card" style="padding: 16px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 0;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 44px; height: 44px; border-radius: 12px; background: var(--bg-card-subtle); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; color: var(--pitch-green);">
                ${player.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 2px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  ${escapeHtml(player.name)}
                  ${store.isAdmin ? `
                  <span class="star-badge" style="cursor: pointer;" data-edit-stars="${player.id}" title="Clique para editar nome e estrelas">
                    ★ ${player.stars.toFixed(1)}
                  </span>
                  ` : `
                  <span class="star-badge" title="Somente o administrador pode editar">
                    ★ ${player.stars.toFixed(1)}
                  </span>
                  `}
                </h3>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <span class="player-position-label">
                    ${escapeHtml(player.favoritePosition || 'Posição não definida')}
                  </span>
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm btn-profile-player" data-id="${player.id}" title="Ver perfil e evolução">
                📊
              </button>
              ${store.isAdmin ? `
              <button class="btn btn-secondary btn-sm btn-edit-player" data-id="${player.id}" title="Editar nome e estrelas">
                ✏️
              </button>
              <button class="btn btn-secondary btn-sm btn-delete-player" data-id="${player.id}" style="color: var(--accent-red);" title="Excluir jogador">
                🗑️
              </button>
              ` : ''}
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

    container.querySelectorAll('.btn-profile-player').forEach(btn => {
      btn.addEventListener('click', (e) => {
        openPlayerProfileModal(e.currentTarget.getAttribute('data-id'));
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

            <div style="margin-bottom: 20px;">
              <label for="add-player-position" style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; color: var(--text-muted);">
                Posição favorita
              </label>
              <select name="favoritePosition" id="add-player-position" class="input-field">
                <option value="">Não definida</option>
                <option value="Fixo">Fixo</option>
                <option value="Ala">Ala</option>
                <option value="Pivô">Pivô</option>
              </select>
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
      const favoritePosition = e.target.favoritePosition.value;
      const created = store.addPlayer(name, stars, favoritePosition);
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
            <h2 class="modal-title">Editar Jogador</h2>
              <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">
                ✏️ Aqui você só edita o nome e as estrelas. As estatísticas (gols, assistências, votos) são editadas na aba Ranking.
              </span>
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

    const form = modalContainer.querySelector('#edit-player-form');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const newName = form.name.value.trim();
      const newStars = parseFloat(starRange.value);
      store.updatePlayer(id, {
        name: newName,
        stars: newStars
      });
      close();
      showToast(`Jogador "${newName}" atualizado!`);
      render();
    });
  }

  function openPlayerProfileModal(id) {
    const player = store.getPlayer(id);
    if (!player) return;

    const modalContainer = document.getElementById('modal-container');
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''),
        stats: store.getPeriodSnapshot(date.getFullYear(), date.getMonth() + 1).players?.[id] || {},
      };
    });
    const totals = ['goals', 'assists', 'participacao', 'selecao', 'puskas', 'craque', 'bagre']
      .reduce((result, field) => {
        result[field] = months.reduce((sum, month) => sum + (Number(month.stats[field]) || 0), 0);
        return result;
      }, {});
    const frequentCompanions = getFrequentCompanions(id);
    const positions = ['Fixo', 'Ala', 'Pivô'];

    modalContainer.innerHTML = `
      <div class="modal-overlay" id="profile-modal-overlay">
        <div class="modal-content player-profile-modal">
          <div class="modal-header">
            <div>
              <span class="profile-eyebrow">Perfil individual</span>
              <h2 class="modal-title">${escapeHtml(player.name)}</h2>
            </div>
            <button class="modal-close" id="profile-modal-close" aria-label="Fechar perfil">&times;</button>
          </div>

          <div class="profile-preferences">
            <div>
              <span class="profile-field-label">Posição favorita</span>
              <p class="profile-field-note">Escolha a posição em que o jogador prefere atuar.</p>
            </div>
            <div class="profile-position-control">
              <select id="profile-position" class="input-field" ${store.isAdmin ? '' : 'disabled'}>
                <option value="">Não definida</option>
                ${positions.map(position => `<option value="${position}" ${player.favoritePosition === position ? 'selected' : ''}>${position}</option>`).join('')}
              </select>
              ${store.isAdmin ? '<button type="button" class="btn btn-primary btn-sm" id="save-profile-position">Salvar</button>' : ''}
            </div>
          </div>

          <div class="profile-summary-grid">
            ${profileMetric('⚽', 'Gols', totals.goals, 'goals')}
            ${profileMetric('👟', 'Assistências', totals.assists, 'assists')}
            ${profileMetric('📅', 'Participações', totals.participacao, 'matches')}
            ${profileMetric('🏆', 'Prêmios', totals.selecao + totals.puskas + totals.craque + totals.bagre, 'awards')}
          </div>

          <div class="profile-section-heading">
            <div>
              <h3>Evolução mensal</h3>
              <p>Últimos 12 meses registrados</p>
            </div>
            <span class="star-badge">★ ${Number(player.stars).toFixed(1)}</span>
          </div>

          <div class="profile-table-wrap">
            <table class="profile-table">
              <thead><tr><th>Mês</th><th>Gols</th><th>Assist.</th><th>Part.</th><th>Prêmios</th></tr></thead>
              <tbody>
                ${months.map(month => {
                  const stats = month.stats;
                  const awards = (Number(stats.selecao) || 0) + (Number(stats.puskas) || 0) + (Number(stats.craque) || 0) + (Number(stats.bagre) || 0);
                  return `<tr>
                    <th scope="row">${month.label}</th>
                    <td class="profile-goals">${Number(stats.goals) || 0}</td>
                    <td class="profile-assists">${Number(stats.assists) || 0}</td>
                    <td>${Number(stats.participacao) || 0}</td>
                    <td>${awards}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <p class="profile-awards-note">Prêmios: ${totals.craque} Craque, ${totals.selecao} Seleção, ${totals.puskas} Puskas e ${totals.bagre} Bagre.</p>

          <div class="profile-companions-section">
            <section>
              <div class="profile-section-heading">
                <div>
                  <h3>Companheiros mais frequentes</h3>
                  <p>Jogadores que mais dividiram o time</p>
                </div>
              </div>
              ${frequentCompanions.length ? `<ol class="profile-companions-list">${frequentCompanions.map(item => `<li><strong>${escapeHtml(item.name)}</strong><span>${item.count} ${item.count === 1 ? 'vez' : 'vezes'}</span></li>`).join('')}</ol>` : '<p class="profile-empty-note">Ainda não há companheiros registrados.</p>'}
            </section>
          </div>
        </div>
      </div>
    `;

    const close = () => { modalContainer.innerHTML = ''; };
    modalContainer.querySelector('#profile-modal-close').addEventListener('click', close);
    modalContainer.querySelector('#profile-modal-overlay').addEventListener('click', (event) => {
      if (event.target.id === 'profile-modal-overlay') close();
    });
    modalContainer.querySelector('#save-profile-position')?.addEventListener('click', () => {
      const position = modalContainer.querySelector('#profile-position').value;
      store.updatePlayer(id, { favoritePosition: position });
      showToast('Posição favorita atualizada.');
      openPlayerProfileModal(id);
    });
  }

  function getFrequentCompanions(playerId) {
    const counts = new Map();
    store.history.forEach(entry => {
      (entry.teams || []).forEach(team => {
        const playerIds = team.playerIds || [];
        if (!playerIds.includes(playerId)) return;
        playerIds.forEach(companionId => {
          if (companionId === playerId) return;
          counts.set(companionId, (counts.get(companionId) || 0) + 1);
        });
      });
    });
    return Array.from(counts.entries())
      .map(([companionId, count]) => ({ name: store.getPlayer(companionId)?.name || 'Jogador removido', count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 4);
  }

  function profileMetric(icon, label, value, tone) {
    return `<div class="profile-metric ${tone}">
      <span class="profile-metric-icon">${icon}</span>
      <span class="profile-metric-value">${value}</span>
      <span class="profile-metric-label">${label}</span>
    </div>`;
  }

  render();
  return container;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
