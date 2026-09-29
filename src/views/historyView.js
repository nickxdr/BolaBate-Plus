import { store } from '../state/store.js';
import { showToast } from './rankingView.js';

export function renderHistoryView() {
  const container = document.createElement('div');
  container.className = 'view-container history-view';

  const entries = [...store.history].sort((a, b) => {
    const dateA = a.dateISO ? new Date(a.dateISO).getTime() : 0;
    const dateB = b.dateISO ? new Date(b.dateISO).getTime() : 0;
    return dateB - dateA;
  });

  container.innerHTML = `
    <div class="history-header">
      <div>
        <h1 class="history-title">📅 Histórico de Peladas</h1>
        <p class="history-subtitle">
          Gols e assistências de cada rodada. Defina Craque, Seleção, Puskas e Bagre quando a votação do WhatsApp fechar.
        </p>
      </div>
      <div class="history-count-badge">${entries.length} ${entries.length === 1 ? 'pelada' : 'peladas'}</div>
    </div>

    <div id="history-list" class="history-list">
      ${entries.length === 0 ? `
        <div class="history-empty card">
          <div class="history-empty-icon">⚽</div>
          <h2>Nenhuma pelada registrada ainda</h2>
          <p>Encerre uma pelada na aba Pelada para ver o histórico aqui com gols, assistências e votações.</p>
        </div>
      ` : ''}
    </div>
  `;

  if (entries.length === 0) {
    return container;
  }

  const list = container.querySelector('#history-list');

  entries.forEach((entry, index) => {
    store.ensureHistoryAwardsSynced(entry);

    const players = store.getHistoryParticipatingPlayers(entry);
    const matchStats = getMatchTotals(entry);
    const awards = entry.awards || {};
    const hasCraque = !!awards.craqueId;
    const hasPuskas = !!awards.puskasId;
    const hasBagre = !!awards.bagreId;
    const hasSelecao = Array.isArray(awards.selecaoIds) && awards.selecaoIds.length > 0;
    const isExpanded = index === 0;

    const card = document.createElement('article');
    card.className = `history-card card${isExpanded ? ' expanded' : ''}`;
    card.dataset.historyId = entry.id;

    card.innerHTML = `
      <button type="button" class="history-card-toggle" aria-expanded="${isExpanded}">
        <div class="history-card-main">
          <div class="history-date-block">
            <span class="history-date-label">Data da pelada</span>
            <strong class="history-date-value">${escapeHtml(entry.date || '—')}</strong>
          </div>
          <div class="history-card-stats">
            <span class="history-stat-pill goals">⚽ ${matchStats.goals} gols</span>
            <span class="history-stat-pill assists">👟 ${matchStats.assists} assists</span>
            <span class="history-stat-pill teams">${(entry.teams || []).length} times</span>
          </div>
        </div>
        <div class="history-card-badges">
          ${renderAwardBadges({ hasCraque, hasPuskas, hasBagre, hasSelecao, selecaoCount: hasSelecao ? awards.selecaoIds.length : 0 })}
          <span class="history-chevron">${isExpanded ? '▾' : '▸'}</span>
        </div>
      </button>

      <div class="history-card-body"${isExpanded ? '' : ' hidden'}>
        ${store.isAdmin ? `
        <div class="history-stats-edit-bar">
          <button type="button" class="btn btn-secondary btn-sm history-edit-stats-btn">✏️ Editar gols e assistências</button>
        </div>
        ` : ''}
        <div class="history-teams-grid">
          ${renderTeamsSection(entry)}
        </div>

        <div class="history-awards-panel">
          <h3>Votações desta pelada</h3>
          <p class="history-awards-note">
            Craque (+5 pts), Seleção (+4 pts cada), Puskas (+3 pts) e Bagre (-3 pts) atualizam o ranking oficial ao salvar.
          </p>

          ${store.isAdmin ? `
          <form class="history-awards-form" data-history-id="${entry.id}">
            <div class="history-award-field">
              <label for="craque-${entry.id}">⭐ Craque da Pelada</label>
              <select id="craque-${entry.id}" name="craqueId" class="input-field">
                <option value="">Aguardando votação...</option>
                ${players.map(p => `
                  <option value="${p.id}" ${awards.craqueId === p.id ? 'selected' : ''}>
                    ${escapeHtml(p.name)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="history-award-field">
              <label for="puskas-${entry.id}">🎯 Puskas / Gol Mais Bonito</label>
              <select id="puskas-${entry.id}" name="puskasId" class="input-field">
                <option value="">Aguardando votação...</option>
                ${players.map(p => `
                  <option value="${p.id}" ${awards.puskasId === p.id ? 'selected' : ''}>
                    ${escapeHtml(p.name)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="history-award-field">
              <label for="bagre-${entry.id}">🐟 Bagre da Pelada</label>
              <select id="bagre-${entry.id}" name="bagreId" class="input-field">
                <option value="">Aguardando votação...</option>
                ${players.map(p => `
                  <option value="${p.id}" ${awards.bagreId === p.id ? 'selected' : ''}>
                    ${escapeHtml(p.name)}
                  </option>
                `).join('')}
              </select>
            </div>

            ${renderSelecaoPicker(entry, players, awards)}

            <button type="submit" class="btn btn-primary history-save-btn">
              Salvar Votações
            </button>
          </form>
          ` : renderAwardsSummary(entry)}
        </div>

        ${store.isAdmin ? `
        <div style="display: flex; justify-content: flex-end; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-color);">
          <button class="btn btn-danger btn-sm history-delete-btn" data-history-id="${entry.id}" title="Excluir esta pelada e remover suas estatísticas do ranking">
            🗑️ Excluir Pelada
          </button>
        </div>
        ` : ''}
      </div>
    `;

    list.appendChild(card);

    const toggle = card.querySelector('.history-card-toggle');
    const body = card.querySelector('.history-card-body');
    const chevron = card.querySelector('.history-chevron');

    toggle.addEventListener('click', () => {
      const expanded = card.classList.toggle('expanded');
      body.hidden = !expanded;
      toggle.setAttribute('aria-expanded', String(expanded));
      chevron.textContent = expanded ? '▾' : '▸';
    });

    const selecaoPicker = card.querySelector('.selecao-picker');
    if (selecaoPicker) bindSelecaoPicker(selecaoPicker);

    card.querySelector('.history-awards-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const craqueId = form.craqueId.value || null;
      const puskasId = form.puskasId.value || null;
      const bagreId = form.bagreId.value || null;
      const selecaoCheckboxes = form.querySelectorAll('input[name="selecaoIds"]:checked');
      const selecaoIds = Array.from(selecaoCheckboxes).map(cb => cb.value);

      if (selecaoIds.length > 5) {
        showToast('Selecione no máximo 5 atletas para a Seleção.');
        return;
      }

      const result = store.updateHistoryAwards(entry.id, { craqueId, puskasId, bagreId, selecaoIds });
      if (!result.success) {
        showToast(result.error || 'Não foi possível salvar as votações.');
        return;
      }

      showToast('Votações salvas! Ranking atualizado.');
      refreshCardBadges(card, entry.id);
    });
    card.querySelector('.history-edit-stats-btn')?.addEventListener('click', () => {
      openEditHistoryStatsModal(entry);
    });
    card.querySelector('.history-delete-btn')?.addEventListener('click', () => {
      openDeleteHistoryModal(entry);
    });
  });

  return container;
}

const SELECAO_MAX = 5;

function normalizeSearchText(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * "Seleção da Pelada" picker: counter, removable chips for the chosen players, a search box
 * and a grid of player chips (with their goals/assists in this pelada to help the vote).
 * Each chip wraps a real checkbox named selecaoIds, so the form's submit handler reads
 * the selection exactly as before.
 */
function renderSelecaoPicker(entry, players, awards) {
  const selected = new Set(Array.isArray(awards.selecaoIds) ? awards.selecaoIds : []);
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));

  return `
    <div class="history-award-field selecao-picker">
      <div class="selecao-picker-head">
        <span class="selecao-picker-title">🏆 Seleção da Pelada</span>
        <span class="selecao-picker-count"><strong>${selected.size}</strong>/${SELECAO_MAX}</span>
      </div>

      <div class="selecao-picker-selected"></div>

      <input type="text" class="input-field selecao-picker-search" placeholder="🔍 Buscar atleta..." autocomplete="off" />

      <div class="selecao-picker-grid">
        ${sorted.map(p => {
          const s = (entry.stats && entry.stats[p.id]) || {};
          const goals = Number(s.goals) || 0;
          const assists = Number(s.assists) || 0;
          const statLine = [`${Number(p.stars) || 0}★`, goals ? `⚽ ${goals}` : '', assists ? `👟 ${assists}` : ''].filter(Boolean).join(' · ');
          return `
          <label class="selecao-option${selected.has(p.id) ? ' is-selected' : ''}" data-name="${escapeHtml(normalizeSearchText(p.name))}">
            <input type="checkbox" name="selecaoIds" value="${p.id}" ${selected.has(p.id) ? 'checked' : ''} />
            <span class="selecao-option-info">
              <span class="selecao-option-name">${escapeHtml(p.name)}</span>
              <span class="selecao-option-meta">${statLine}</span>
            </span>
            <span class="selecao-option-check" aria-hidden="true">✓</span>
          </label>
        `;
        }).join('')}
      </div>
      <div class="selecao-picker-empty" hidden>Nenhum atleta encontrado.</div>
    </div>
  `;
}

function bindSelecaoPicker(picker) {
  const options = Array.from(picker.querySelectorAll('.selecao-option'));
  const search = picker.querySelector('.selecao-picker-search');
  const selectedBox = picker.querySelector('.selecao-picker-selected');
  const count = picker.querySelector('.selecao-picker-count strong');
  const empty = picker.querySelector('.selecao-picker-empty');

  const sync = () => {
    const chosen = options.filter(o => o.querySelector('input').checked);
    const full = chosen.length >= SELECAO_MAX;
    count.textContent = String(chosen.length);

    options.forEach(o => {
      const input = o.querySelector('input');
      o.classList.toggle('is-selected', input.checked);
      // Enforce the 5-athlete limit live instead of only complaining on save.
      o.classList.toggle('is-disabled', full && !input.checked);
      input.disabled = full && !input.checked;
    });

    selectedBox.innerHTML = chosen.length
      ? chosen.map(o => `
          <span class="selecao-chip">
            ${o.querySelector('.selecao-option-name').innerHTML}
            <button type="button" class="selecao-chip-remove" data-id="${o.querySelector('input').value}" aria-label="Remover">×</button>
          </span>
        `).join('')
      : '<span class="selecao-picker-placeholder">Nenhum atleta selecionado ainda.</span>';
  };

  const filter = () => {
    const term = normalizeSearchText(search.value.trim());
    let visible = 0;
    options.forEach(o => {
      const match = !term || o.dataset.name.includes(term);
      o.hidden = !match;
      if (match) visible += 1;
    });
    empty.hidden = visible > 0;
  };

  picker.addEventListener('change', (e) => {
    if (e.target.matches('input[name="selecaoIds"]')) sync();
  });
  selectedBox.addEventListener('click', (e) => {
    const btn = e.target.closest('.selecao-chip-remove');
    if (!btn) return;
    const input = picker.querySelector(`input[name="selecaoIds"][value="${btn.dataset.id}"]`);
    if (input) {
      input.checked = false;
      sync();
    }
  });
  search.addEventListener('input', filter);
  // Enter in the search box would otherwise submit the whole votes form.
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault();
  });

  sync();
}

/**
 * Admin editor for a finished pelada's goals/assists. The ranking table is read-only, so
 * this is where stats get corrected; saving pushes the difference into that month's ranking
 * (store.updateHistoryPlayerStats).
 */
function openEditHistoryStatsModal(entry) {
  const modalContainer = document.getElementById('modal-container');
  const diaristas = new Set(entry.diaristaPlayerIds || []);
  const draft = {};

  const stepper = (pid, field, value) => `
    <div class="history-stat-stepper" data-pid="${pid}" data-field="${field}">
      <button type="button" class="history-stat-step" data-delta="-1" aria-label="Diminuir" ${value <= 0 ? 'disabled' : ''}>−</button>
      <span class="history-stat-step-value">${value}</span>
      <button type="button" class="history-stat-step" data-delta="1" aria-label="Aumentar">+</button>
    </div>
  `;

  const teamsHtml = (entry.teams || []).map(team => {
    const rows = (team.playerIds || []).map(pid => {
      const player = store.getPlayer(pid);
      if (!player) return '';
      const stats = entry.stats?.[pid] || {};
      const goals = Number(stats.goals) || 0;
      const assists = Number(stats.assists) || 0;
      draft[pid] = { goals, assists };
      return `
        <div class="history-stats-edit-row">
          <span class="history-stats-edit-name">
            ${escapeHtml(player.name)}
            ${diaristas.has(pid) ? '<span class="diarista-badge" title="Diarista — não conta no ranking">💰</span>' : ''}
          </span>
          <span class="history-stats-edit-field"><span class="history-stats-edit-icon">⚽</span>${stepper(pid, 'goals', goals)}</span>
          <span class="history-stats-edit-field"><span class="history-stats-edit-icon">👟</span>${stepper(pid, 'assists', assists)}</span>
        </div>
      `;
    }).join('');

    return `
      <section class="history-stats-edit-team" style="--team-color: ${team.color || 'var(--pitch-green)'}">
        <h4><span class="history-team-dot"></span>${escapeHtml(team.name || 'Time')}</h4>
        ${rows || '<p class="history-team-empty">Nenhum jogador registrado.</p>'}
      </section>
    `;
  }).join('');

  const original = JSON.parse(JSON.stringify(draft));

  modalContainer.innerHTML = `
    <div class="modal-overlay" id="edit-history-stats-overlay">
      <div class="modal-content" style="max-width: 560px;">
        <div class="modal-header">
          <h2 class="modal-title">✏️ Gols e assistências — ${escapeHtml(entry.date || '')}</h2>
          <button class="modal-close" id="edit-history-stats-close" title="Fechar">✕</button>
        </div>

        <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 14px;">
          Corrija os números desta pelada. Ao salvar, o ranking do mês é atualizado automaticamente.
          Diaristas (💰) ficam registrados na pelada, mas não contam no ranking.
        </p>

        <div class="history-stats-edit-list">${teamsHtml}</div>

        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
          <button id="edit-history-stats-cancel" class="btn btn-secondary">Cancelar</button>
          <button id="edit-history-stats-save" class="btn btn-primary" disabled>Salvar alterações</button>
        </div>
      </div>
    </div>
  `;

  const overlay = modalContainer.querySelector('#edit-history-stats-overlay');
  const saveBtn = modalContainer.querySelector('#edit-history-stats-save');
  const close = () => { modalContainer.innerHTML = ''; };
  modalContainer.querySelector('#edit-history-stats-close').addEventListener('click', close);
  modalContainer.querySelector('#edit-history-stats-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const changedPlayers = () => Object.keys(draft).filter(pid =>
    draft[pid].goals !== original[pid].goals || draft[pid].assists !== original[pid].assists
  );

  modalContainer.querySelector('.history-stats-edit-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.history-stat-step');
    if (!btn) return;
    const box = btn.closest('.history-stat-stepper');
    const { pid, field } = box.dataset;
    const next = Math.max(0, draft[pid][field] + Number(btn.dataset.delta));
    draft[pid][field] = next;
    box.querySelector('.history-stat-step-value').textContent = String(next);
    box.querySelector('[data-delta="-1"]').disabled = next <= 0;
    box.classList.toggle('changed', next !== original[pid][field]);
    saveBtn.disabled = changedPlayers().length === 0;
  });

  saveBtn.addEventListener('click', () => {
    const updates = {};
    changedPlayers().forEach(pid => { updates[pid] = draft[pid]; });
    const result = store.updateHistoryPlayerStats(entry.id, updates);
    close();
    if (result?.success) {
      showToast('Gols e assistências atualizados! Ranking recalculado.');
    } else if (result?.error) {
      showToast(result.error);
    }
  });
}

/** Confirmation modal for deleting a pelada from history (admin only). */
function openDeleteHistoryModal(entry) {
  const modalContainer = document.getElementById('modal-container');
  const matchDate = entry.date || '—';
  const totalGoals = Object.values(entry.stats || {}).reduce(
    (acc, s) => acc + (Number(s.goals) || 0), 0
  );

  modalContainer.innerHTML = `
    <div class="modal-overlay" id="delete-history-overlay">
      <div class="modal-content" style="max-width: 460px;">
        <div class="modal-header">
          <h2 class="modal-title" style="color: var(--accent-red);">⚠️ Excluir esta pelada?</h2>
          <button class="modal-close" id="delete-history-close" title="Fechar">✕</button>
        </div>

        <div style="font-size: 0.9rem; color: var(--text-main); line-height: 1.6;">
          <p style="margin-bottom: 10px;">
            A pelada de <strong>${escapeHtml(matchDate)}</strong> (${totalGoals} gols) será
            <strong>removida do histórico</strong> e suas estatísticas serão descontadas do ranking:
          </p>
          <ul style="margin: 0 0 12px 18px; padding: 0;">
            <li>Gols, assistências e participações do mês</li>
            <li>Votos de Craque, Seleção, Puskas e Bagre</li>
          </ul>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 16px;">
            A mudança será sincronizada com a nuvem para todos os usuários. <strong>Essa ação não pode ser desfeita.</strong>
          </p>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="delete-history-cancel" class="btn btn-secondary">Cancelar</button>
          <button id="delete-history-confirm" class="btn btn-danger">Sim, excluir pelada</button>
        </div>
      </div>
    </div>
  `;

  const close = () => { modalContainer.innerHTML = ''; };
  const overlay = modalContainer.querySelector('#delete-history-overlay');
  modalContainer.querySelector('#delete-history-close').addEventListener('click', close);
  modalContainer.querySelector('#delete-history-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  modalContainer.querySelector('#delete-history-confirm').addEventListener('click', () => {
    const result = store.deleteHistoryEntry(entry.id);
    close();
    if (result && result.success) {
      // store.save() → notify() re-renders this view with the pelada removed
      showToast('Pelada excluída e ranking atualizado.');
    } else {
      showToast(result?.error || 'Não foi possível excluir a pelada.');
    }
  });
}

/** Read-only awards display shown to non-admin users. */
function renderAwardsSummary(entry) {
  const awards = entry.awards || {};
  const nameOf = (id) => {
    const p = id && store.getPlayer(id);
    return p ? escapeHtml(p.name) : null;
  };
  const rows = [
    ['⭐ Craque da Pelada', nameOf(awards.craqueId)],
    ['🎯 Puskas', nameOf(awards.puskasId)],
    ['🐟 Bagre da Pelada', nameOf(awards.bagreId)],
    ['🏆 Seleção da Pelada', (Array.isArray(awards.selecaoIds) ? awards.selecaoIds : []).map(nameOf).filter(Boolean).join(', ') || null],
  ];
  return `
    <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px; padding: 4px 0;">
      <p class="history-awards-note" style="margin-bottom: 4px;">🔒 Apenas o administrador pode editar as votações.</p>
      ${rows.map(([label, value]) => `
        <div><strong style="color: var(--text-main);">${label}:</strong> ${value || '<em>Aguardando votação...</em>'}</div>
      `).join('')}
    </div>
  `;
}

function renderTeamsSection(entry) {
  const diaristas = new Set(entry.diaristaPlayerIds || []);

  return (entry.teams || []).map(team => {
    const rows = (team.playerIds || []).map(pid => {
      const player = store.getPlayer(pid);
      if (!player) return '';

      const stats = entry.stats?.[pid] || {};
      const goals = Number(stats.goals) || 0;
      const assists = Number(stats.assists) || 0;
      const hasActivity = goals > 0 || assists > 0;
      const isDiarista = diaristas.has(pid);

      return `
        <div class="history-player-row${hasActivity ? ' active' : ''}${isDiarista ? ' diarista' : ''}">
          <span class="history-player-name">${escapeHtml(player.name)}${isDiarista ? ' <span class="diarista-badge">💰 <span class="diarista-badge-label">Diarista</span></span>' : ''}</span>
          <span class="history-player-stats">
            <span class="history-player-stat goals">⚽ ${goals}</span>
            <span class="history-player-stat assists">👟 ${assists}</span>
          </span>
        </div>
      `;
    }).join('');

    const wins = Number(team.wins) || 0;
    const losses = Number(team.losses) || 0;

    return `
      <section class="history-team-card" style="--team-color: ${team.color || 'var(--pitch-green)'}">
        <header class="history-team-header">
          <span class="history-team-dot"></span>
          <h4>${escapeHtml(team.name || 'Time')}</h4>
          <span class="history-team-wins-pill" title="Vitórias na pelada">${wins} V</span>
          <span class="history-team-losses-pill" title="Derrotas na pelada">${losses} D</span>
        </header>
        <div class="history-team-players">
          ${rows || '<p class="history-team-empty">Nenhum jogador registrado.</p>'}
        </div>
      </section>
    `;
  }).join('');
}

function getMatchTotals(entry) {
  let goals = 0;
  let assists = 0;

  Object.values(entry.stats || {}).forEach(stat => {
    goals += Number(stat.goals) || 0;
    assists += Number(stat.assists) || 0;
  });

  return { goals, assists };
}

function renderAwardBadges({ hasCraque, hasPuskas, hasBagre, hasSelecao, selecaoCount }) {
  return `
    ${hasCraque ? '<span class="history-award-badge craque">⭐ Craque</span>' : '<span class="history-award-badge pending">Craque pendente</span>'}
    ${hasPuskas ? '<span class="history-award-badge puskas">🎯 Puskas</span>' : '<span class="history-award-badge pending">Puskas pendente</span>'}
    ${hasBagre ? '<span class="history-award-badge bagre">🐟 Bagre</span>' : '<span class="history-award-badge pending">Bagre pendente</span>'}
    ${hasSelecao ? `<span class="history-award-badge selecao">🏆 Seleção (${selecaoCount})</span>` : '<span class="history-award-badge pending">Seleção pendente</span>'}
  `;
}

function refreshCardBadges(card, historyId) {
  const entry = store.getHistoryEntry(historyId);
  if (!entry) return;

  store.ensureHistoryAwardsSynced(entry);
  const awards = entry.awards || {};
  const hasCraque = !!awards.craqueId;
  const hasPuskas = !!awards.puskasId;
  const hasBagre = !!awards.bagreId;
  const hasSelecao = Array.isArray(awards.selecaoIds) && awards.selecaoIds.length > 0;
  const badges = card.querySelector('.history-card-badges');

  badges.innerHTML = `
    ${renderAwardBadges({
      hasCraque,
      hasPuskas,
      hasBagre,
      hasSelecao,
      selecaoCount: hasSelecao ? awards.selecaoIds.length : 0,
    })}
    <span class="history-chevron">${card.classList.contains('expanded') ? '▾' : '▸'}</span>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
