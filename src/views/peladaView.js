import { store } from "../state/store.js";
import {
  autoBalanceTeams,
  randomizeTeams,
  getSmartSuggestions,
  getSubstituteSuggestions,
} from "../services/balancer.js";
import { showToast } from "./rankingView.js";
import { getAvatarDataUri } from "../services/avatar.js";
import { computeCurrentOVRs } from "../services/ovr.js";
import confetti from "canvas-confetti";
import { playSound } from "../services/soundManager.js";

export function renderPeladaView(onNavigate) {
  const container = document.createElement("div");
  container.className = "view-container";

  const { status } = store.activePelada;

  if (status === "live") {
    renderLivePelada(container, onNavigate);
  } else if (!store.isAdmin) {
    renderWaitingForAdmin(container);
  } else if (status === "setup") {
    renderSetupTeams(container, onNavigate);
  } else {
    renderPeladaConfig(container, onNavigate);
  }

  return container;
}

// ----------------------------------------------------
// 0. Waiting Screen — shown to non-admins while there's no live pelada
// ----------------------------------------------------
function renderWaitingForAdmin(container) {
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 14px; min-height: calc(100vh - var(--header-height) - var(--nav-height) - 32px);">
      <div style="font-size: 3rem;">⏳</div>
      <h1 style="font-size: 1.3rem; font-weight: 800;">Nenhuma pelada ativa no momento</h1>
      <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 340px;">
        Espere o administrador iniciar a pelada para você poder acompanhar os times, gols e assistências em tempo real.
      </p>
    </div>
  `;
}

// ----------------------------------------------------
// 1. Pelada Initial Configuration: Team count & Attendance
// ----------------------------------------------------

/** Below this many present players, no team count (not even the minimum, 3) can be fielded. */
function minPeladaPlayers(teamSize) {
  return 3 * teamSize;
}

/** Minimum headcount that justifies `n` teams — more than what `n - 1` teams could hold. */
function minPlayersForTeamCount(n, teamSize) {
  return n <= 3 ? minPeladaPlayers(teamSize) : teamSize * (n - 1) + 1;
}

/** Auto-downgrades (never upgrades) from the admin's chosen team count when attendance falls short — e.g. 5-a-side with 5 times needs 21-25 players; below that it steps down to 4, then 3 if needed. */
function computeEffectiveTeamCount(selectedTeamCount, presentCount, teamSize) {
  let n = selectedTeamCount;
  while (n > 3 && presentCount < minPlayersForTeamCount(n, teamSize)) {
    n -= 1;
  }
  return n;
}

function renderPeladaConfig(container, onNavigate) {
  let teamCount = Math.max(3, Math.min(6, store.activePelada.teamCount || 4));
  // No button starts pressed — only highlight the admin's own click until then (or once
  // attendance is ready, the real computed outcome, handled in the highlight logic below).
  let hasPickedTeamCount = false;
  // Start with a completely clean list: NO pre-selected players
  let selectedIds = new Set();
  let diaristaIds = new Set();
  store.activePelada.presentPlayerIds = [];
  let filterText = "";

  function update() {
    const teamSize = store.teamSize;
    const minPlayers = minPeladaPlayers(teamSize);
    const maxPlayers = teamCount * teamSize; // admin's chosen ceiling — selection is still capped here
    const players = store.players.filter((p) =>
      p.name.toLowerCase().includes(filterText.toLowerCase()),
    );

    const count = selectedIds.size;
    const isReady = count >= minPlayers && count <= maxPlayers;
    const effectiveTeamCount = computeEffectiveTeamCount(teamCount, count, teamSize);
    const wasAutoAdjusted = isReady && effectiveTeamCount !== teamCount;

    container.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h1 style="font-size: 1.6rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
          ⚽ Organizar Nova Pelada
        </h1>
        <p style="color: var(--text-muted); font-size: 0.85rem;">
          Escolha o número máximo de times (${teamSize} jogadores por time) e selecione os atletas presentes. Se faltar gente para esse número, o app reduz os times automaticamente.
        </p>
      </div>

      <!-- Step 1: Number of Teams (Options: 3, 4, 5, 6 Teams) -->
      <div class="card">
        <h2 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 8px;">
          1. Quantos times vão jogar hoje?
        </h2>
        <div class="team-count-grid">
          ${[3, 4, 5, 6]
            .map((num) => {
              // Before there are enough players yet, every tier would cascade down to
              // the same effective count (3), which would make clicking feel broken —
              // so highlight the admin's own click until we're actually ready, then
              // switch to showing the real (possibly auto-downgraded) outcome. Nothing
              // is highlighted at all until the admin clicks a button or attendance is ready.
              const highlightCount = isReady
                ? effectiveTeamCount
                : hasPickedTeamCount
                  ? teamCount
                  : null;
              return `
            <button class="btn ${highlightCount === num ? "btn-primary" : "btn-secondary"} btn-team-count" data-count="${num}">
              ${num} Times
            </button>
          `;
            })
            .join("")}
        </div>
      </div>

      <!-- Step 2: Player Attendance -->
      <div class="card">
        <div class="attendance-toolbar" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
          <div>
            <h2 style="font-size: 1.05rem; font-weight: 700;">
              2. Quem está presente?
            </h2>
            <div style="font-size: 0.85rem; color: ${isReady ? "var(--pitch-green)" : count > maxPlayers ? "var(--accent-red)" : "var(--accent-gold)"}; font-weight: 700; margin-top: 2px;">
              ${count} jogador${count === 1 ? "" : "es"} selecionado${count === 1 ? "" : "s"}
              ${
                count < minPlayers
                  ? `(faltam ${minPlayers - count} para o mínimo de ${minPlayers})`
                  : count > maxPlayers
                    ? `(excesso de ${count - maxPlayers})`
                    : `✓ Pronto para ${effectiveTeamCount} ${effectiveTeamCount === 1 ? "time" : "times"}!`
              }
            </div>
            ${
              wasAutoAdjusted
                ? `
              <div style="font-size: 0.76rem; color: var(--accent-gold); margin-top: 2px;">
                🔄 Ajustado automaticamente de ${teamCount} para ${effectiveTeamCount} times (jogadores insuficientes para ${teamCount}).
              </div>
            `
                : ""
            }
          </div>

          <div class="attendance-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="btn-quick-fill" class="btn btn-secondary btn-sm" title="Seleciona os primeiros ${maxPlayers} jogadores">
              Completar ${maxPlayers}
            </button>
            <button id="btn-clear-selection" class="btn btn-secondary btn-sm">
              Limpar
            </button>
          </div>
        </div>

        <input type="text" id="attendance-search" class="input-field" placeholder="Buscar por nome..." value="${escapeHtml(filterText)}" style="margin-bottom: 12px;" />

        <div class="player-chips-grid">
          ${players
            .map((p) => {
              const isSelected = selectedIds.has(p.id);
              const isDiarista = diaristaIds.has(p.id);
              return `
              <div class="player-chip ${isSelected ? "selected" : ""} ${isDiarista ? "diarista" : ""}" data-player-id="${p.id}">
                <div>
                  <div class="name">${escapeHtml(p.name)}</div>
                  <div class="stars">★ ${p.stars.toFixed(1)}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  ${
                    isSelected
                      ? `
                    <button type="button" class="btn-toggle-diarista ${isDiarista ? "active" : ""}" data-player-id="${p.id}" title="Marcar/desmarcar como Diarista (não pontua no ranking)">
                      💰
                    </button>
                  `
                      : ""
                  }
                  <span style="font-size: 1.1rem; color: ${isSelected ? "var(--pitch-green)" : "var(--text-dim)"};">
                    ${isSelected ? "✓" : "+"}
                  </span>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>

        ${
          diaristaIds.size > 0
            ? `
          <p style="font-size: 0.78rem; color: var(--diarista-yellow); margin-top: -4px; margin-bottom: 14px;">
            💰 ${diaristaIds.size} jogador(es) marcado(s) como Diarista — não pontuam no ranking oficial.
          </p>
        `
            : ""
        }

        <div style="margin-top: 18px; display: flex; flex-direction: column; gap: 8px;">
          <button id="btn-advance-setup" class="btn btn-primary btn-lg" ${!isReady || !store.isAdmin ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ""}>
            ${store.isAdmin ? `Avançar para Montagem dos Times (${count} jogadores → ${effectiveTeamCount} times)` : "🔒 Apenas o admin pode iniciar a pelada"}
          </button>
          ${
            !isReady
              ? `
            <p style="font-size: 0.78rem; text-align: center; color: var(--text-muted);">
              ${
                count < minPlayers
                  ? `Selecione pelo menos ${minPlayers} jogadores para poder avançar.`
                  : `Você selecionou mais jogadores do que o máximo de ${maxPlayers} para ${teamCount} times — remova ${count - maxPlayers} ou aumente o número de times.`
              }
            </p>
          `
              : ""
          }
        </div>
      </div>
    `;

    // Bind team count buttons
    container.querySelectorAll(".btn-team-count").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        teamCount = parseInt(e.currentTarget.getAttribute("data-count"), 10);
        hasPickedTeamCount = true;
        store.activePelada.teamCount = teamCount;
        update();
      });
    });

    // Bind search
    const searchInput = container.querySelector("#attendance-search");
    searchInput.addEventListener("input", (e) => {
      filterText = e.target.value;
      update();
      const input = container.querySelector("#attendance-search");
      if (input) {
        input.focus();
        input.setSelectionRange(filterText.length, filterText.length);
      }
    });

    // Bind quick fill
    container.querySelector("#btn-quick-fill").addEventListener("click", () => {
      selectedIds.clear();
      diaristaIds.clear();
      const pool = [...store.players].slice(0, maxPlayers);
      pool.forEach((p) => selectedIds.add(p.id));
      update();
    });

    // Bind clear
    container
      .querySelector("#btn-clear-selection")
      .addEventListener("click", () => {
        selectedIds.clear();
        diaristaIds.clear();
        update();
      });

    // Bind chip clicks
    container.querySelectorAll(".player-chip").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        const pid = e.currentTarget.getAttribute("data-player-id");
        if (selectedIds.has(pid)) {
          selectedIds.delete(pid);
          diaristaIds.delete(pid);
        } else {
          if (selectedIds.size >= maxPlayers) {
            showToast(
              `Você já selecionou o limite de ${maxPlayers} jogadores!`,
            );
            return;
          }
          selectedIds.add(pid);
        }
        update();
      });
    });

    // Bind diarista toggle (doesn't trigger the chip's own select/deselect click)
    container.querySelectorAll(".btn-toggle-diarista").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pid = e.currentTarget.getAttribute("data-player-id");
        if (diaristaIds.has(pid)) {
          diaristaIds.delete(pid);
        } else {
          diaristaIds.add(pid);
        }
        update();
      });
    });

    // Bind advance
    const advanceBtn = container.querySelector("#btn-advance-setup");
    if (isReady && store.isAdmin && advanceBtn) {
      advanceBtn.addEventListener("click", () => {
        store.startPeladaSetup(
          effectiveTeamCount,
          Array.from(selectedIds),
          Array.from(diaristaIds),
        );
        renderSetupTeams(container, onNavigate);
      });
    }
  }

  update();
}

// ----------------------------------------------------
// 2. Team Assembly & Balancing (Smart Suggestions & Auto-Balance)
// ----------------------------------------------------
function renderSetupTeams(container, onNavigate) {
  const pelada = store.activePelada;
  const presentPlayers = pelada.presentPlayerIds
    .map((id) => store.getPlayer(id))
    .filter(Boolean);

  // Track which player belongs to which team
  // Initialize if empty
  if (
    !pelada.teams ||
    pelada.teams.length === 0 ||
    pelada.teams.every((t) => t.playerIds.length === 0)
  ) {
    // If not distributed, split players randomly (user can still auto-balance later)
    const randomized = randomizeTeams(presentPlayers, pelada.teamCount, store.teamSize);
    pelada.teams = randomized.map((b, i) => ({
      id: `team-${i + 1}`,
      name: `Time ${i + 1}`,
      color: store.getTeamColor(i),
      playerIds: b.playerIds,
    }));
    store.updatePeladaTeams(pelada.teams);
  }

  function getAssignedPlayerIds() {
    const set = new Set();
    pelada.teams.forEach((t) => t.playerIds.forEach((id) => set.add(id)));
    return set;
  }

  function render() {
    const teamSize = store.teamSize;
    const targetStars = teamSize * 4.0;
    const assignedIds = getAssignedPlayerIds();
    const unassignedPlayers = presentPlayers.filter(
      (p) => !assignedIds.has(p.id),
    );
    const diaristaIds = new Set(pelada.diaristaPlayerIds || []);

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
        <div>
          <h1 style="font-size: 1.6rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            ⚖️ Equilíbrio dos Times
          </h1>
          <p style="color: var(--text-muted); font-size: 0.85rem;">
            Meta por time: ~${targetStars.toFixed(1)}★ total (${teamSize} jogadores).
          </p>
          <p style="color: var(--text-muted); font-size: 0.85rem;">
            Arraste e solte para trocar ou equilibrar.
          </p>
        </div>

        <div class="team-balance-actions">
          <button id="btn-rebalance" class="btn btn-secondary" title="Recalcular times equilibrando a pontuação de estrelas">
            🔄 <span class="balance-btn-label-full">Equilibrar Automaticamente</span><span class="balance-btn-label-short">Balancear</span>
          </button>
          <button id="btn-randomize" class="btn btn-secondary" title="Remisturar os times aleatoriamente, sem considerar as estrelas">
            🔀 Randomizar
          </button>
          <button id="btn-cancel-setup" class="btn btn-secondary btn-sm" style="color: var(--text-dim);">
            Voltar
          </button>
        </div>
      </div>

      <!-- Unassigned Bench (if any) -->
      ${
        unassignedPlayers.length > 0
          ? `
        <div class="card" style="border: 1px dashed var(--accent-gold); background: rgba(245, 158, 11, 0.05); padding: 14px;">
          <strong style="color: var(--accent-gold); font-size: 0.9rem; display: block; margin-bottom: 8px;">
            Atletas aguardando encaixe (${unassignedPlayers.length}):
          </strong>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${unassignedPlayers
              .map(
                (p) => `
              <div class="star-badge" style="font-size: 0.85rem; padding: 4px 10px;">
                ${escapeHtml(p.name)} (${p.stars.toFixed(1)}★)
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `
          : ""
      }

      <!-- Teams Grid -->
      <div class="teams-grid" data-team-count="${pelada.teams.length}">
        ${pelada.teams
          .map((team, tIdx) => {
            const teamPlayers = team.playerIds
              .map((id) => store.getPlayer(id))
              .filter(Boolean);
            const totalStars = teamPlayers.reduce((sum, p) => sum + p.stars, 0);
            const slotsRemaining = teamSize - teamPlayers.length;

            // Meter styling: closer to the target is perfect
            const diffFromTarget = Math.abs(totalStars - targetStars);
            let pillClass = "good";
            if (teamPlayers.length === teamSize) {
              if (diffFromTarget <= 1.5) pillClass = "perfect";
              else if (diffFromTarget > 3.0) pillClass = "skewed";
            }

            // Check if halfway done (e.g. 2 to teamSize-1 players) to offer smart suggestions
            const isHalfway = teamPlayers.length >= 2 && teamPlayers.length < teamSize;
            const suggestions = isHalfway
              ? getSmartSuggestions(teamPlayers, unassignedPlayers, teamSize)
              : [];

            return `
            <div class="team-card drop-target-team" data-team-id="${team.id}">
              <div class="team-card-header" style="border-top: 4px solid ${team.color};">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${team.color};"></span>
                  <input type="text" class="team-name-input" data-team-index="${tIdx}" value="${escapeHtml(team.name)}" style="background: transparent; border: none; font-weight: 800; font-size: 1.05rem; color: var(--text-main); width: 120px; outline: none;" />
                </div>
                <div class="team-meter">
                  <span class="team-meter-pill ${pillClass}">
                    ${totalStars.toFixed(1)} ★ (${teamPlayers.length}/${teamSize})
                  </span>
                </div>
              </div>

              <div class="team-players-list drop-target-list" data-team-id="${team.id}">
                ${teamPlayers
                  .map(
                    (p) => `
                  <div class="team-player-row draggable ${diaristaIds.has(p.id) ? "diarista" : ""}"
                       draggable="true"
                       data-player-id="${p.id}"
                       data-team-id="${team.id}"
                       title="Arraste para outro time ou solte em cima de outro atleta para trocar">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span class="name" style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(p.name)}</span>
                      <span class="player-position-label">${escapeHtml(p.favoritePosition || "Posição não definida")}</span>
                      <span class="star-badge" style="font-size: 0.75rem;">${p.stars.toFixed(1)}★</span>
                      ${diaristaIds.has(p.id) ? '<span class="diarista-badge">💰 Diarista</span>' : ""}
                    </div>

                    <div style="display: flex; align-items: center; gap: 6px; color: var(--text-dim); font-size: 1.2rem; cursor: grab;" title="Arraste para mover">
                      ⠿
                    </div>
                  </div>
                `,
                  )
                  .join("")}

                ${
                  slotsRemaining > 0
                    ? `
                  <div class="empty-slot-placeholder" style="padding: 10px; border: 2px dashed var(--border-color); border-radius: 10px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
                    Solte um jogador aqui (${slotsRemaining} vaga(s) restante(s))
                  </div>
                `
                    : ""
                }

                <!-- Smart Suggestions Box when halfway done -->
                ${
                  suggestions.length > 0
                    ? `
                  <div class="suggestion-box">
                    <div style="font-size: 0.78rem; font-weight: 700; color: var(--pitch-green); display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
                      💡 Sugestão para fechar ~20★:
                    </div>
                    ${suggestions
                      .map(
                        (s) => `
                      <div class="suggestion-item">
                        <span><strong>${escapeHtml(s.player.name)}</strong> (${s.player.stars}★) - <small style="color: var(--text-dim);">${s.reason}</small></span>
                        <button class="btn btn-primary btn-sm btn-add-suggested" data-team-id="${team.id}" data-player-id="${s.player.id}" style="padding: 2px 8px; font-size: 0.75rem;">
                          + Adicionar
                        </button>
                      </div>
                    `,
                      )
                      .join("")}
                  </div>
                `
                    : ""
                }
              </div>
            </div>
          `;
          })
          .join("")}
      </div>

      <!-- Action Bottom Bar -->
      <div style="margin-top: 24px;">
        <button id="btn-start-match" class="btn btn-primary btn-lg" style="box-shadow: 0 4px 20px var(--pitch-green-glow);">
          🚀 Confirmar Times & Começar Pelada!
        </button>
      </div>
    `;

    // Bind team name edit
    container.querySelectorAll(".team-name-input").forEach((input) => {
      input.addEventListener("change", (e) => {
        const idx = parseInt(e.target.getAttribute("data-team-index"), 10);
        pelada.teams[idx].name = e.target.value.trim() || `Time ${idx + 1}`;
        store.updatePeladaTeams(pelada.teams);
      });
    });

    // Bind auto-balance button
    container.querySelector("#btn-rebalance").addEventListener("click", () => {
      const balanced = autoBalanceTeams(presentPlayers, pelada.teamCount, store.teamSize);
      pelada.teams = balanced.map((b, i) => ({
        id: `team-${i + 1}`,
        name: pelada.teams[i]?.name || `Time ${i + 1}`,
        color: store.getTeamColor(i),
        playerIds: b.playerIds,
      }));
      store.updatePeladaTeams(pelada.teams);
      showToast("Times equilibrados automaticamente!");
      render();
    });

    // Bind randomize button
    container.querySelector("#btn-randomize").addEventListener("click", () => {
      // Get all players currently assigned to the existing teams
      const currentPlayerIds = pelada.teams.flatMap(
        (team) => team.playerIds || [],
      );

      // Shuffle the players randomly using Fisher-Yates
      for (let i = currentPlayerIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentPlayerIds[i], currentPlayerIds[j]] = [
          currentPlayerIds[j],
          currentPlayerIds[i],
        ];
      }

      // Redistribute the same players across the existing teams
      const teamSize = store.teamSize;
      pelada.teams = pelada.teams.map((team, teamIndex) => ({
        ...team,
        playerIds: currentPlayerIds.slice(teamIndex * teamSize, (teamIndex + 1) * teamSize),
      }));

      store.updatePeladaTeams(pelada.teams);
      showToast("Times randomizados!");
      render();
    });

    // Bind back / cancel
    container
      .querySelector("#btn-cancel-setup")
      .addEventListener("click", () => {
        store.activePelada.status = "idle";
        store.save();
        renderPeladaConfig(container, onNavigate);
      });

    // ==========================================
    // Drag & Drop & Tap-to-Swap Implementation
    // ==========================================
    let draggedData = null; // { playerId, sourceTeamId }
    let tapSelected = null; // { playerId, sourceTeamId, element }

    // Helper: Swap two players between teams
    function swapPlayers(playerAId, teamAId, playerBId, teamBId) {
      const teamA = pelada.teams.find((t) => t.id === teamAId);
      const teamB = pelada.teams.find((t) => t.id === teamBId);
      if (!teamA || !teamB) return;

      if (teamAId === teamBId) {
        // Reorder within same team
        const idxA = teamA.playerIds.indexOf(playerAId);
        const idxB = teamA.playerIds.indexOf(playerBId);
        if (idxA !== -1 && idxB !== -1) {
          teamA.playerIds[idxA] = playerBId;
          teamA.playerIds[idxB] = playerAId;
        }
      } else {
        // Swap between different teams
        teamA.playerIds = teamA.playerIds.map((id) =>
          id === playerAId ? playerBId : id,
        );
        teamB.playerIds = teamB.playerIds.map((id) =>
          id === playerBId ? playerAId : id,
        );
      }

      store.updatePeladaTeams(pelada.teams);
      render();
      const pA = store.getPlayer(playerAId);
      const pB = store.getPlayer(playerBId);
      showToast(`Troca realizada: ${pA?.name} ⇄ ${pB?.name}`);
    }

    // Helper: Move player to team
    function movePlayerToTeam(playerId, sourceTeamId, targetTeamId) {
      if (sourceTeamId === targetTeamId) return;
      const sourceTeam = pelada.teams.find((t) => t.id === sourceTeamId);
      const targetTeam = pelada.teams.find((t) => t.id === targetTeamId);
      if (!sourceTeam || !targetTeam) return;

      if (targetTeam.playerIds.length < store.teamSize) {
        // Direct move if vacancy
        sourceTeam.playerIds = sourceTeam.playerIds.filter(
          (id) => id !== playerId,
        );
        targetTeam.playerIds.push(playerId);
      } else {
        // If target team is full, swap with last player of target team
        const lastPlayerId =
          targetTeam.playerIds[targetTeam.playerIds.length - 1];
        swapPlayers(playerId, sourceTeamId, lastPlayerId, targetTeamId);
        return;
      }

      store.updatePeladaTeams(pelada.teams);
      render();
      const p = store.getPlayer(playerId);
      showToast(`${p?.name} movido para ${targetTeam.name}!`);
    }

    // Drag events on player rows
    container.querySelectorAll(".team-player-row.draggable").forEach((row) => {
      row.addEventListener("dragstart", (e) => {
        const pid = row.getAttribute("data-player-id");
        const tid = row.getAttribute("data-team-id");
        draggedData = { playerId: pid, sourceTeamId: tid };
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify(draggedData));
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        container
          .querySelectorAll(".drag-target-swap")
          .forEach((el) => el.classList.remove("drag-target-swap"));
        container
          .querySelectorAll(".drag-over-team")
          .forEach((el) => el.classList.remove("drag-over-team"));
        draggedData = null;
      });

      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        const targetPid = row.getAttribute("data-player-id");
        if (draggedData && draggedData.playerId !== targetPid) {
          row.classList.add("drag-target-swap");
        }
      });

      row.addEventListener("dragleave", (e) => {
        e.stopPropagation();
        row.classList.remove("drag-target-swap");
      });

      row.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove("drag-target-swap");
        const targetPid = row.getAttribute("data-player-id");
        const targetTid = row.getAttribute("data-team-id");

        if (
          draggedData &&
          draggedData.playerId &&
          draggedData.playerId !== targetPid
        ) {
          swapPlayers(
            draggedData.playerId,
            draggedData.sourceTeamId,
            targetPid,
            targetTid,
          );
        }
      });

      // Tap-to-Swap for mobile touchscreens
      row.addEventListener("click", () => {
        const pid = row.getAttribute("data-player-id");
        const tid = row.getAttribute("data-team-id");

        if (!tapSelected) {
          // First player selected
          tapSelected = { playerId: pid, sourceTeamId: tid, element: row };
          row.classList.add("tap-selected");
          const p = store.getPlayer(pid);
          showToast(
            `${p?.name} selecionado. Toque em outro jogador para trocar.`,
          );
        } else if (tapSelected.playerId === pid) {
          // Deselect if clicking the same player
          row.classList.remove("tap-selected");
          tapSelected = null;
        } else {
          // Second player clicked: execute swap!
          tapSelected.element.classList.remove("tap-selected");
          swapPlayers(tapSelected.playerId, tapSelected.sourceTeamId, pid, tid);
          tapSelected = null;
        }
      });
    });

    // Drag over team cards / lists
    container.querySelectorAll(".drop-target-team").forEach((card) => {
      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        card.classList.add("drag-over-team");
      });

      card.addEventListener("dragleave", () => {
        card.classList.remove("drag-over-team");
      });

      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("drag-over-team");
        const targetTeamId = card.getAttribute("data-team-id");

        if (
          draggedData &&
          draggedData.playerId &&
          draggedData.sourceTeamId !== targetTeamId
        ) {
          movePlayerToTeam(
            draggedData.playerId,
            draggedData.sourceTeamId,
            targetTeamId,
          );
        }
      });
    });

    // Bind add suggested player
    container.querySelectorAll(".btn-add-suggested").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const teamId = e.currentTarget.getAttribute("data-team-id");
        const pid = e.currentTarget.getAttribute("data-player-id");
        const team = pelada.teams.find((t) => t.id === teamId);
        if (team && team.playerIds.length < store.teamSize) {
          team.playerIds.push(pid);
          store.updatePeladaTeams(pelada.teams);
          render();
        }
      });
    });

    // Bind Start Match
    container
      .querySelector("#btn-start-match")
      .addEventListener("click", () => {
        store.startLivePelada();
        renderLivePelada(container, onNavigate);
        showToast("Pelada iniciada! Boa sorte a todos!");
      });
  }

  render();
}

// ----------------------------------------------------
// 3. Live Pelada Match Tracker — "Winner Stays" Rotation
// ----------------------------------------------------
function renderLivePelada(container, onNavigate) {
  const pelada = store.activePelada;

  // Self-heal: peladas started before the rotation feature existed won't have it yet
  if (store.isAdmin && !pelada.rotation) {
    store.ensureRotation();
  }

  // Teams the admin has tapped to kick off the very first match — only relevant while
  // rotation.currentMatch is still null. Persists across re-renders of this same mount.
  let pendingMatchSelection = [];

  // ----------------------------------------------------
  // Surgical DOM patches for the hot-loop actions (goal, assist, timer, score
  // correction) — these fire constantly during a live match, and a full `render()`
  // (container.innerHTML = ...) on every single tap visibly flashes the whole screen.
  // Same fix already applied to the per-second timer tick (see ensureMatchTimerTicking)
  // and the cloud-status badge (see Store#_setCloudStatus) — patch just the DOM nodes
  // that actually changed instead of rebuilding everything.
  // ----------------------------------------------------

  function patchPlayerCounters(playerId, isGuest) {
    const pStat = store.activePelada.stats[playerId] || {};
    const goalVal = isGuest ? pStat.guestGoals || 0 : pStat.goals || 0;
    const assistVal = isGuest ? pStat.guestAssists || 0 : pStat.assists || 0;
    const goalBtnSelector = isGuest ? ".btn-increase-guest-goal" : ".btn-increase-goal";
    const assistBtnSelector = isGuest
      ? ".btn-increase-guest-assist"
      : ".btn-increase-assist";

    container
      .querySelectorAll(`${goalBtnSelector}[data-id="${playerId}"]`)
      .forEach((btn) => {
        const span = btn.previousElementSibling;
        if (span?.classList.contains("count")) span.textContent = goalVal;
      });
    container
      .querySelectorAll(`${assistBtnSelector}[data-id="${playerId}"]`)
      .forEach((btn) => {
        const span = btn.previousElementSibling;
        if (span?.classList.contains("count")) span.textContent = assistVal;
      });

    if (!isGuest) {
      const ovr = computeCurrentOVRs(store)[playerId];
      if (ovr !== undefined) {
        container
          .querySelectorAll(`.mini-pitch-ovr-badge[data-id="${playerId}"]`)
          .forEach((badge) => {
            badge.textContent = ovr;
          });
      }
    }
  }

  function patchScoreboard() {
    const match = pelada.rotation?.currentMatch;
    if (!match) return;
    const scoreEl = container.querySelector(".mini-pitch-score");
    if (scoreEl) scoreEl.innerHTML = `${match.scoreA} <span>×</span> ${match.scoreB}`;
    refreshMatchControls();
  }

  function patchTimeline() {
    const listEl = container.querySelector(".pelada-timeline-list");
    if (!listEl) {
      // First event of the match — the timeline card doesn't exist in the DOM yet,
      // so it needs one full render to be created. Every event after this patches.
      render();
      return;
    }
    listEl.innerHTML = renderTimelineEntries(pelada);
  }

  /** Regenerates just the timer/finish button row + its status labels, and rebinds them. */
  function refreshMatchControls() {
    const match = pelada.rotation?.currentMatch;
    if (!match) return;
    const barEl = container.querySelector(".match-controls-buttons");
    const infoEl = container.querySelector(".match-controls-info");
    if (!barEl) return;

    const remainingMs = match.timerRunning
      ? Math.max(0, match.timerEndsAt - Date.now())
      : match.timerRemainingMs;
    const canFinish = match.scoreA >= 2 || match.scoreB >= 2 || remainingMs <= 0;
    const notStarted =
      !match.timerRunning && match.timerRemainingMs === match.timerDurationMs;
    const timeUp = remainingMs <= 0;

    if (infoEl) {
      infoEl.innerHTML = `
        ${timeUp ? '<span class="match-timeup-label">⏱️ Tempo esgotado!</span>' : ""}
        ${!timeUp && canFinish ? '<span class="match-ready-label">✅ Pronto para finalizar (2 gols)</span>' : ""}
      `;
    }

    barEl.innerHTML = `
      ${
        match.timerRunning
          ? `<button id="btn-pause-timer" class="btn btn-secondary">⏸️ Pausar</button>`
          : timeUp
            ? ""
            : `<button id="btn-start-timer" class="btn btn-secondary">${notStarted ? "▶️ Iniciar" : "▶️ Retomar"}</button>`
      }
      <button id="btn-finish-match" class="btn btn-gold" ${canFinish ? "" : "disabled"}>
        🏁 Finalizar
      </button>
    `;
    bindMatchControls();
  }

  /** Binds the timer/finish buttons — called after the initial render and after every refreshMatchControls() patch. */
  function bindMatchControls() {
    const startTimerBtn = container.querySelector("#btn-start-timer");
    if (startTimerBtn) {
      startTimerBtn.addEventListener("click", () => {
        store.startMatchTimer();
        playSound("whistleStart");
        refreshMatchControls();
      });
    }

    const pauseTimerBtn = container.querySelector("#btn-pause-timer");
    if (pauseTimerBtn) {
      pauseTimerBtn.addEventListener("click", () => {
        store.pauseMatchTimer();
        refreshMatchControls();
      });
    }

    // Bind Finish Match — applies the winner-stays / draw / 3-streak rotation rules.
    // This changes which teams are on the pitch, so it still warrants a full render().
    const finishMatchBtn = container.querySelector("#btn-finish-match");
    if (finishMatchBtn) {
      finishMatchBtn.addEventListener("click", () => {
        const match = pelada.rotation?.currentMatch;
        if (!match) return;
        const teamA = pelada.teams.find((t) => t.id === match.teamAId);
        const teamB = pelada.teams.find((t) => t.id === match.teamBId);

        openConfirmFinishMatchModal(match, teamA, teamB, () => {
          const result = store.endCurrentMatch();
          if (result.success) {
            playSound("whistleEnd");
            const teamAName =
              pelada.teams.find((t) => t.id === result.teamAId)?.name || "Time A";
            const teamBName =
              pelada.teams.find((t) => t.id === result.teamBId)?.name || "Time B";
            if (result.winnerId) {
              const winnerName =
                pelada.teams.find((t) => t.id === result.winnerId)?.name ||
                "Vencedor";
              const hi = Math.max(result.scoreA, result.scoreB);
              const lo = Math.min(result.scoreA, result.scoreB);
              showToast(`🏆 ${winnerName} venceu por ${hi}×${lo}!`);
            } else {
              showToast(
                `🤝 Empate! ${teamAName} ${result.scoreA}×${result.scoreB} ${teamBName}`,
              );
            }
          }
          handleReclaimedGuests(result.reclaimedGuests, render);
        });
      });
    }
  }

  function render() {
    const rotation = pelada.rotation;
    const match = rotation?.currentMatch;
    const teamA = match
      ? pelada.teams.find((t) => t.id === match.teamAId)
      : null;
    const teamB = match
      ? pelada.teams.find((t) => t.id === match.teamBId)
      : null;

    if (rotation) {
      pendingMatchSelection = pendingMatchSelection.filter((id) =>
        rotation.waitingTeamIds.includes(id),
      );
    }

    container.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h1 style="font-size: 1.6rem; font-weight: 800;">
          Controle de Gols & Assistências
        </h1>
      </div>

      <!-- Match Pitch: current confrontation, score & timer -->
      ${renderMatchPanel(rotation, match, teamA, teamB, pendingMatchSelection)}

      <!-- Active Teams -->
      ${
        match && teamA && teamB
          ? `
        <div class="teams-grid" data-team-count="2">
          ${[teamA, teamB].map((team) => renderActiveTeamCard(pelada, team)).join("")}
        </div>
      `
          : !store.isAdmin
            ? `
        <div class="card" style="text-align: center; padding: 32px 16px;">
          <p style="font-size: 0.95rem; color: var(--text-muted);">Aguardando o admin escolher o primeiro confronto...</p>
        </div>
      `
            : ""
      }

      <!-- Waiting Queue -->
      ${renderWaitingQueue(pelada, rotation, pendingMatchSelection)}

      <!-- Recent Timeline Events -->
      ${
        pelada.events && pelada.events.length > 0
          ? `
        <div class="card" style="margin-top: 20px;">
          <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 10px; color: var(--text-muted);">
            ⏱️ Linha do Tempo da Pelada
          </h3>
          <div class="pelada-timeline-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 160px; overflow-y: auto;">
            ${renderTimelineEntries(pelada)}
          </div>
        </div>
      `
          : ""
      }

      ${
        store.isAdmin
          ? `
        <button id="btn-finish-pelada" class="btn btn-red btn-lg" style="margin-top: 24px;">
          🏁 Terminar Pelada
        </button>
      `
          : ""
      }
    `;

    // Bind Goal / Assist clicks — patched in place (see patchPlayerCounters/patchScoreboard
    // above) instead of a full render(), since these fire constantly during a live match.
    container.querySelectorAll(".btn-increase-goal").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const pid = e.currentTarget.getAttribute("data-id");
        const teamId = e.currentTarget.getAttribute("data-team");
        store.recordGoal(pid, teamId, false);
        playSound("goal");
        patchPlayerCounters(pid, false);
        patchScoreboard();
        patchTimeline();
      });
    });

    container.querySelectorAll(".btn-decrease-goal").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const pid = e.currentTarget.getAttribute("data-id");
        store.removeGoal(pid, false);
        patchPlayerCounters(pid, false);
        patchScoreboard();
        patchTimeline();
      });
    });

    container.querySelectorAll(".btn-increase-assist").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const pid = e.currentTarget.getAttribute("data-id");
        const teamId = e.currentTarget.getAttribute("data-team");
        store.recordAssist(pid, teamId, false);
        patchPlayerCounters(pid, false);
        patchTimeline();
      });
    });

    container.querySelectorAll(".btn-decrease-assist").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const pid = e.currentTarget.getAttribute("data-id");
        store.removeAssist(pid, false);
        patchPlayerCounters(pid, false);
        patchTimeline();
      });
    });

    // Bind Guest Goal / Assist clicks
    container.querySelectorAll(".btn-increase-guest-goal").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const pid = e.currentTarget.getAttribute("data-id");
        const teamId = e.currentTarget.getAttribute("data-team");
        store.recordGoal(pid, teamId, true);
        playSound("goal");
        patchPlayerCounters(pid, true);
        patchScoreboard();
        patchTimeline();
      });
    });

    container.querySelectorAll(".btn-decrease-guest-goal").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const pid = e.currentTarget.getAttribute("data-id");
        store.removeGoal(pid, true);
        patchPlayerCounters(pid, true);
        patchScoreboard();
        patchTimeline();
      });
    });

    container.querySelectorAll(".btn-increase-guest-assist").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const pid = e.currentTarget.getAttribute("data-id");
        const teamId = e.currentTarget.getAttribute("data-team");
        store.recordAssist(pid, teamId, true);
        patchPlayerCounters(pid, true);
        patchTimeline();
      });
    });

    container.querySelectorAll(".btn-decrease-guest-assist").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const pid = e.currentTarget.getAttribute("data-id");
        store.removeAssist(pid, true);
        patchPlayerCounters(pid, true);
        patchTimeline();
      });
    });

    // Bind Early Departure & Substitute modal
    container.querySelectorAll(".btn-mark-departure").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const pid = e.currentTarget.getAttribute("data-id");
        const teamId = e.currentTarget.getAttribute("data-team");
        openSubstituteModal(pid, teamId, render);
      });
    });

    // Bind "team needs completion" pill (fewer than 5 active players)
    container.querySelectorAll(".btn-complete-team").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const teamId = e.currentTarget.getAttribute("data-team");
        openCompletionModal(teamId, render);
      });
    });

    // Bind Revert Departure (Return to match)
    container.querySelectorAll(".btn-revert-departure").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const pid = e.currentTarget.getAttribute("data-id");
        store.revertPlayerDeparture(pid);
        const p = store.getPlayer(pid);
        showToast(`${p?.name || "Jogador"} retornou ao jogo!`);
        render();
      });
    });

    // Bind Finish Pelada (admin only — button isn't rendered for non-admins)
    const finishBtn = container.querySelector("#btn-finish-pelada");
    if (finishBtn) {
      finishBtn.addEventListener("click", () => {
        openFinishPeladaModal(onNavigate);
      });
    }

    // Bind Match Timer & Finish Match controls (see refreshMatchControls/bindMatchControls
    // above — this is the same binding used after every subsequent patch, defined once).
    bindMatchControls();

    // Bind manual score adjustment (own goals / corrections — not tied to a player)
    container.querySelectorAll(".btn-adjust-score").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const teamId = e.currentTarget.getAttribute("data-team");
        const delta = Number(e.currentTarget.getAttribute("data-delta"));
        store.adjustMatchScore(teamId, delta);
        patchScoreboard();
        patchTimeline();
      });
    });

    // Bind Waiting Queue departure toggle
    container.querySelectorAll(".waiting-player-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const pid = e.currentTarget.getAttribute("data-id");
        const teamId = e.currentTarget.getAttribute("data-team");
        const isDeparted =
          e.currentTarget.getAttribute("data-departed") === "true";
        if (isDeparted) {
          store.revertPlayerDeparture(pid);
        } else {
          store.markPlayerDeparted(pid, teamId);
        }
        render();
      });
    });

    // Bind manual "first match" team selection (only rendered while there's no current match)
    container.querySelectorAll(".btn-toggle-match-selection").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const teamId = e.currentTarget.getAttribute("data-team");
        if (pendingMatchSelection.includes(teamId)) {
          pendingMatchSelection = pendingMatchSelection.filter(
            (id) => id !== teamId,
          );
        } else if (pendingMatchSelection.length < 2) {
          pendingMatchSelection = [...pendingMatchSelection, teamId];
        } else {
          showToast(
            "Você já selecionou 2 times. Toque em um deles para trocar a escolha.",
          );
          return;
        }
        render();
      });
    });

    const confirmFirstMatchBtn = container.querySelector(
      "#btn-confirm-first-match",
    );
    if (confirmFirstMatchBtn) {
      confirmFirstMatchBtn.addEventListener("click", () => {
        if (pendingMatchSelection.length !== 2) return;
        const result = store.startMatchBetween(
          pendingMatchSelection[0],
          pendingMatchSelection[1],
        );
        if (result?.success) {
          pendingMatchSelection = [];
          showToast("Confronto iniciado! Boa sorte aos dois times!");
        }
        handleReclaimedGuests(result?.reclaimedGuests, render);
      });
    }

    // Bind waiting-queue manual reordering — the array order IS the admin's priority list
    function moveInQueue(teamId, direction) {
      if (!rotation) return;
      const order = [...rotation.waitingTeamIds];
      const idx = order.indexOf(teamId);
      const newIdx = idx + direction;
      if (idx === -1 || newIdx < 0 || newIdx >= order.length) return;
      [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
      store.reorderWaitingQueue(order);
      render();
    }

    container.querySelectorAll(".btn-queue-up").forEach((btn) => {
      btn.addEventListener("click", (e) =>
        moveInQueue(e.currentTarget.getAttribute("data-team"), -1),
      );
    });
    container.querySelectorAll(".btn-queue-down").forEach((btn) => {
      btn.addEventListener("click", (e) =>
        moveInQueue(e.currentTarget.getAttribute("data-team"), 1),
      );
    });

    // Drag & drop reordering of the waiting queue (desktop) — drop inserts the dragged team
    // right before the drop target, matching the up/down buttons' "top = next up" semantics.
    let draggedQueueTeamId = null;
    container
      .querySelectorAll('.waiting-team-card[draggable="true"]')
      .forEach((card) => {
        card.addEventListener("dragstart", (e) => {
          draggedQueueTeamId = card.getAttribute("data-team-id");
          card.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", draggedQueueTeamId);
        });

        card.addEventListener("dragend", () => {
          card.classList.remove("dragging");
          container
            .querySelectorAll(".waiting-team-card.drag-over-queue")
            .forEach((el) => el.classList.remove("drag-over-queue"));
          draggedQueueTeamId = null;
        });

        card.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (
            draggedQueueTeamId &&
            draggedQueueTeamId !== card.getAttribute("data-team-id")
          ) {
            card.classList.add("drag-over-queue");
          }
        });

        card.addEventListener("dragleave", () =>
          card.classList.remove("drag-over-queue"),
        );

        card.addEventListener("drop", (e) => {
          e.preventDefault();
          card.classList.remove("drag-over-queue");
          const targetTeamId = card.getAttribute("data-team-id");
          if (
            !rotation ||
            !draggedQueueTeamId ||
            draggedQueueTeamId === targetTeamId
          )
            return;
          const order = rotation.waitingTeamIds.filter(
            (id) => id !== draggedQueueTeamId,
          );
          const targetIdx = order.indexOf(targetTeamId);
          order.splice(targetIdx, 0, draggedQueueTeamId);
          store.reorderWaitingQueue(order);
          render();
        });
      });
  }

  render();
}

// ----------------------------------------------------
// Early Departure & Guest Substitute Modal
// ----------------------------------------------------

/**
 * After a match ends/starts, any guest whose real team just took the pitch was pulled
 * back automatically (store.reclaimGuestsForTeams) — this reopens the substitute picker
 * for whichever team(s) just lost their guest that way, one at a time, then re-renders.
 */
function handleReclaimedGuests(reclaimedGuests, onAllDone) {
  if (!reclaimedGuests || reclaimedGuests.length === 0) {
    onAllDone();
    return;
  }

  const pelada = store.activePelada;
  reclaimedGuests.forEach((slot) => {
    const guest = store.getPlayer(slot.guestPlayerId);
    const team = pelada.teams.find((t) => t.id === slot.teamId);
    showToast(
      `⚠️ ${guest?.name || "O convidado"} voltou para o time dele, que entrou em campo — ${team?.name || "o time"} precisa de um novo substituto.`,
    );
  });

  let index = 0;
  function openNext() {
    if (index >= reclaimedGuests.length) {
      onAllDone();
      return;
    }
    const slot = reclaimedGuests[index];
    index += 1;
    if (slot.departedPlayerId) {
      openSubstituteModal(slot.departedPlayerId, slot.teamId, openNext, {
        isReclaim: true,
      });
    } else {
      // This guest was completing a team that started under-strength (no one
      // specific to replace) — reopen the completion picker instead.
      openCompletionModal(slot.teamId, openNext, { isReclaim: true });
    }
  }
  openNext();
}

function openSubstituteModal(
  departingPlayerId,
  teamId,
  onDone,
  { isReclaim = false } = {},
) {
  const departingPlayer = store.getPlayer(departingPlayerId);
  if (!departingPlayer) {
    onDone();
    return;
  }

  // Only players from teams currently sitting in the waiting queue can guest in — pulling
  // someone from the live opponent (or any team not actually free) doesn't make sense.
  // Also skip anyone already guesting elsewhere, so nobody gets double-booked.
  const pelada = store.activePelada;
  const waitingTeamIds = new Set(pelada.rotation?.waitingTeamIds || []);
  const alreadyGuesting = new Set(
    (pelada.guestSlots || []).map((g) => g.guestPlayerId),
  );
  const candidatePlayers = [];
  pelada.teams.forEach((t) => {
    if (!waitingTeamIds.has(t.id)) return;
    t.playerIds.forEach((pid) => {
      if (pelada.departedPlayerIds.includes(pid)) return;
      if (alreadyGuesting.has(pid)) return;
      const p = store.getPlayer(pid);
      if (p) candidatePlayers.push(p);
    });
  });

  const substituteSuggestions = getSubstituteSuggestions(
    departingPlayer,
    candidatePlayers,
  );

  const modalContainer = document.getElementById("modal-container");
  modalContainer.innerHTML = `
    <div class="modal-overlay" id="departure-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">${isReclaim ? "🔄 Novo substituto necessário" : `🚪 Saída: ${escapeHtml(departingPlayer.name)}`}</h2>
          <button class="modal-close" id="departure-modal-close">&times;</button>
        </div>

        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 14px;">
          ${
            isReclaim
              ? `O substituto de ${escapeHtml(departingPlayer.name)} voltou a jogar pelo próprio time, que entrou em campo. Escolha outro substituto da fila ou deixe o time desfalcado.`
              : `${escapeHtml(departingPlayer.name)} está saindo mais cedo. Os gols e assistências que ele fez até agora <strong>permanecem salvos</strong>.`
          }
        </p>

        <div class="card" style="background: var(--bg-card-subtle); padding: 14px; margin-bottom: 16px;">
          <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 8px; color: var(--pitch-green);">
            💡 Sugestão de Substitutos da Fila de Espera:
          </h3>
          <p style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 10px;">
            Atletas de times aguardando na fila, com nível similar de estrelas (${departingPlayer.stars}★):
          </p>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${
              substituteSuggestions.length > 0
                ? substituteSuggestions
                    .map(
                      (s) => `
              <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-card); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
                <div>
                  <strong>${escapeHtml(s.player.name)}</strong>
                  <span class="star-badge" style="font-size: 0.72rem; margin-left: 6px;">${s.player.stars}★</span>
                  <div style="font-size: 0.72rem; color: var(--text-dim);">${s.note}</div>
                </div>
                <button class="btn btn-primary btn-sm btn-select-substitute" data-guest-id="${s.player.id}">
                  Escolher
                </button>
              </div>
            `,
                    )
                    .join("")
                : `
              <p style="font-size: 0.8rem; color: var(--text-dim); text-align: center; padding: 8px 0;">
                Nenhum atleta disponível na fila de espera no momento.
              </p>
            `
            }

            <div style="text-align: center; margin-top: 8px;">
              <button id="btn-no-substitute" class="btn btn-secondary btn-sm">
                Não substituir agora (ficar com 4 ou escolher depois)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const close = () => {
    modalContainer.innerHTML = "";
  };
  const overlay = modalContainer.querySelector("#departure-overlay");
  modalContainer
    .querySelector("#departure-modal-close")
    .addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // Mark player departed (idempotent — already true when reopened after a reclaim)
  store.markPlayerDeparted(departingPlayerId, teamId);

  // Substitute buttons
  modalContainer.querySelectorAll(".btn-select-substitute").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const guestId = e.currentTarget.getAttribute("data-guest-id");
      store.assignGuestSubstitute(departingPlayerId, guestId, teamId);
      const guest = store.getPlayer(guestId);
      close();
      showToast(
        `${guest?.name} agora está completando o time! Gols dele não pontuam no ranking.`,
      );
      onDone();
    });
  });

  modalContainer
    .querySelector("#btn-no-substitute")
    .addEventListener("click", () => {
      close();
      if (!isReclaim)
        showToast(`${departingPlayer.name} registrado como saído.`);
      onDone();
    });
}

/**
 * Lets the admin fill a team that started under-strength (fewer than 5 active players — the
 * total headcount just didn't divide evenly, no one specific left) with a guest from the
 * waiting queue. Suggestions are ranked by how well each candidate balances the team's star
 * total (getSmartSuggestions), same logic as the setup-phase "closer to 20★" hints — unlike
 * the departure substitute modal, there's no single departing player's rating to match against.
 */
function openCompletionModal(teamId, onDone, { isReclaim = false } = {}) {
  const pelada = store.activePelada;
  const team = pelada.teams.find((t) => t.id === teamId);
  if (!team) {
    onDone();
    return;
  }

  const activeOriginalPlayers = team.playerIds
    .filter((pid) => !(pelada.departedPlayerIds || []).includes(pid))
    .map((pid) => store.getPlayer(pid))
    .filter(Boolean);
  const activeGuestPlayers = (pelada.guestSlots || [])
    .filter((g) => g.teamId === teamId)
    .map((g) => store.getPlayer(g.guestPlayerId))
    .filter(Boolean);
  const currentTeamPlayers = [...activeOriginalPlayers, ...activeGuestPlayers];

  // Only players from teams currently sitting in the waiting queue can guest in, and nobody
  // already guesting elsewhere — same eligibility rule as the departure substitute flow.
  const waitingTeamIds = new Set(pelada.rotation?.waitingTeamIds || []);
  const alreadyGuesting = new Set(
    (pelada.guestSlots || []).map((g) => g.guestPlayerId),
  );
  const candidatePlayers = [];
  pelada.teams.forEach((t) => {
    if (!waitingTeamIds.has(t.id)) return;
    t.playerIds.forEach((pid) => {
      if (pelada.departedPlayerIds.includes(pid)) return;
      if (alreadyGuesting.has(pid)) return;
      const p = store.getPlayer(pid);
      if (p) candidatePlayers.push(p);
    });
  });

  const suggestions = getSmartSuggestions(currentTeamPlayers, candidatePlayers, store.teamSize);

  const modalContainer = document.getElementById("modal-container");
  modalContainer.innerHTML = `
    <div class="modal-overlay" id="completion-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">${isReclaim ? "🔄 Novo reforço necessário" : `➕ Completar ${escapeHtml(team.name)}`}</h2>
          <button class="modal-close" id="completion-modal-close">&times;</button>
        </div>

        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 14px;">
          ${
            isReclaim
              ? `O reforço de ${escapeHtml(team.name)} voltou a jogar pelo próprio time, que entrou em campo. Escolha outro reforço da fila ou deixe o time desfalcado.`
              : `${escapeHtml(team.name)} está com apenas ${currentTeamPlayers.length}/${store.teamSize} jogadores. Escolha um reforço da fila de espera para completar o time.`
          }
        </p>

        <div class="card" style="background: var(--bg-card-subtle); padding: 14px; margin-bottom: 16px;">
          <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 8px; color: var(--pitch-green);">
            💡 Sugestões (equilíbrio de estrelas do time):
          </h3>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${
              suggestions.length > 0
                ? suggestions
                    .map(
                      (s) => `
              <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-card); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
                <div>
                  <strong>${escapeHtml(s.player.name)}</strong>
                  <span class="star-badge" style="font-size: 0.72rem; margin-left: 6px;">${s.player.stars}★</span>
                  <div style="font-size: 0.72rem; color: var(--text-dim);">${s.reason}</div>
                </div>
                <button class="btn btn-primary btn-sm btn-select-completion" data-guest-id="${s.player.id}">
                  Escolher
                </button>
              </div>
            `,
                    )
                    .join("")
                : `
              <p style="font-size: 0.8rem; color: var(--text-dim); text-align: center; padding: 8px 0;">
                Nenhum atleta disponível na fila de espera no momento.
              </p>
            `
            }

            <div style="text-align: center; margin-top: 8px;">
              <button id="btn-no-completion" class="btn btn-secondary btn-sm">
                Não completar agora (deixar o time com ${currentTeamPlayers.length})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const close = () => {
    modalContainer.innerHTML = "";
  };
  const overlay = modalContainer.querySelector("#completion-overlay");
  modalContainer
    .querySelector("#completion-modal-close")
    .addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  modalContainer.querySelectorAll(".btn-select-completion").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const guestId = e.currentTarget.getAttribute("data-guest-id");
      store.assignTeamCompletion(teamId, guestId);
      const guest = store.getPlayer(guestId);
      close();
      showToast(
        `${guest?.name} entrou para completar o ${team.name}! Gols dele não pontuam no ranking.`,
      );
      onDone();
    });
  });

  modalContainer
    .querySelector("#btn-no-completion")
    .addEventListener("click", () => {
      close();
      onDone();
    });
}

// ----------------------------------------------------
// "Terminar Pelada" Summary & Awards Modal
// ----------------------------------------------------
function openFinishPeladaModal(onNavigate) {
  const pelada = store.activePelada;
  const participatingPlayerIds = new Set();
  pelada.teams.forEach((t) =>
    t.playerIds.forEach((id) => participatingPlayerIds.add(id)),
  );
  const players = Array.from(participatingPlayerIds)
    .map((id) => store.getPlayer(id))
    .filter(Boolean);

  let totalGoals = 0;
  let totalAssists = 0;
  Object.values(pelada.stats).forEach((st) => {
    totalGoals += st.goals || 0;
    totalAssists += st.assists || 0;
  });

  const modalContainer = document.getElementById("modal-container");
  modalContainer.innerHTML = `
    <div class="modal-overlay" id="finish-overlay">
      <div class="modal-content" style="max-width: 580px;">
        <div class="modal-header">
          <h2 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
            🏁 Encerrar Pelada & Atualizar Ranking
          </h2>
          <button class="modal-close" id="finish-modal-close">&times;</button>
        </div>

        <div style="background: var(--bg-card-subtle); border-radius: 12px; padding: 14px; margin-bottom: 18px; display: flex; justify-content: space-around; text-align: center;">
          <div>
            <div style="font-size: 1.4rem; font-weight: 800; color: var(--pitch-green);">${totalGoals}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">Gols Válidos</div>
          </div>
          <div>
            <div style="font-size: 1.4rem; font-weight: 800; color: var(--accent-blue);">${totalAssists}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">Assistências</div>
          </div>
          <div>
            <div style="font-size: 1.4rem; font-weight: 800; color: var(--accent-gold);">${players.length}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">Participações (+1)</div>
          </div>
        </div>

        <form id="finish-pelada-form">
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 18px; line-height: 1.5;">
            Gols, assistências e participações serão salvos no ranking agora.
            ⭐ Craque, 🏆 Seleção, 🎯 Puskas e 🐟 Bagre podem ser definidos depois na aba <strong>Histórico</strong>, quando a votação do WhatsApp fechar.
          </p>

          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" id="finish-modal-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary btn-lg" style="width: auto;">
              Salvar & Atualizar Tabela!
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const close = () => {
    modalContainer.innerHTML = "";
  };
  const overlay = modalContainer.querySelector("#finish-overlay");
  modalContainer
    .querySelector("#finish-modal-close")
    .addEventListener("click", close);
  modalContainer
    .querySelector("#finish-modal-cancel")
    .addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  modalContainer
    .querySelector("#finish-pelada-form")
    .addEventListener("submit", (e) => {
      e.preventDefault();

      store.finishPelada();

      close();

      // Trigger celebration confetti
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });

      showToast("Pelada encerrada! Ranking atualizado com sucesso.");

      // Navigate to ranking tab to show updated standings
      if (typeof onNavigate === "function") {
        onNavigate("ranking");
      }
    });
}

/** Confirmation modal for "Finalizar" on the current match — asked before endCurrentMatch()
 *  commits the result and advances the winner-stays rotation, since that's not reversible
 *  from here (unlike a goal/assist, which has an undo button right next to it). */
function openConfirmFinishMatchModal(match, teamA, teamB, onConfirm) {
  const modalContainer = document.getElementById("modal-container");
  modalContainer.innerHTML = `
    <div class="modal-overlay" id="confirm-finish-match-overlay">
      <div class="modal-content" style="max-width: 420px;">
        <div class="modal-header">
          <h2 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
            🏁 Finalizar Partida?
          </h2>
          <button class="modal-close" id="confirm-finish-match-close">&times;</button>
        </div>

        <div style="background: var(--bg-card-subtle); border-radius: 12px; padding: 16px; margin-bottom: 16px; display: flex; align-items: center; justify-content: center; gap: 14px;">
          <div style="flex: 1; text-align: center;">
            <div style="font-size: 0.82rem; font-weight: 700; color: ${teamA?.color || "var(--text-main)"};">${escapeHtml(teamA?.name || "Time A")}</div>
          </div>
          <div style="font-size: 1.6rem; font-weight: 900; white-space: nowrap;">${match.scoreA} <span style="color: var(--text-dim);">×</span> ${match.scoreB}</div>
          <div style="flex: 1; text-align: center;">
            <div style="font-size: 0.82rem; font-weight: 700; color: ${teamB?.color || "var(--text-main)"};">${escapeHtml(teamB?.name || "Time B")}</div>
          </div>
        </div>

        <p style="font-size: 0.86rem; color: var(--text-muted); margin-bottom: 18px; line-height: 1.5;">
          Isso encerra a partida com o placar acima e avança o rodízio de times (vitória, empate ou 3 vitórias seguidas). Confira o placar antes de continuar.
        </p>

        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button type="button" class="btn btn-secondary" id="confirm-finish-match-cancel">Cancelar</button>
          <button type="button" class="btn btn-gold" id="confirm-finish-match-confirm">🏁 Sim, Finalizar</button>
        </div>
      </div>
    </div>
  `;

  const close = () => {
    modalContainer.innerHTML = "";
  };
  const overlay = modalContainer.querySelector("#confirm-finish-match-overlay");
  modalContainer
    .querySelector("#confirm-finish-match-close")
    .addEventListener("click", close);
  modalContainer
    .querySelector("#confirm-finish-match-cancel")
    .addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  modalContainer
    .querySelector("#confirm-finish-match-confirm")
    .addEventListener("click", () => {
      close();
      onConfirm();
    });
}

// ----------------------------------------------------
// Match Pitch — the two teams currently facing off, score & timer
// ----------------------------------------------------
// 5-a-side formation (default), goalkeeper not shown here: 2 back, 1 middle, 2 front
const FORMATION_SLOTS_5 = ["BACK1", "BACK2", "MID", "FRONT1", "FRONT2"];
const FORMATION_COORDS_5 = {
  BACK1: { x: 30, y: 25 },
  BACK2: { x: 30, y: 75 },
  MID: { x: 55, y: 50 },
  FRONT1: { x: 78, y: 25 },
  FRONT2: { x: 78, y: 75 },
};
const POSITION_PREFERENCE_SLOTS_5 = {
  Fixo: ["BACK1", "BACK2"],
  Ala: ["MID"],
  Pivô: ["FRONT1", "FRONT2"],
};

// 6-a-side formation: 3 evenly-spaced columns (back/mid/front), 2 players per column —
// avoids the single-center MID slot of the 5-a-side layout, which would otherwise sit
// right on top of a 6th player with nowhere else clean to go.
const FORMATION_SLOTS_6 = ["BACK1", "BACK2", "MID1", "MID2", "FRONT1", "FRONT2"];
const FORMATION_COORDS_6 = {
  BACK1: { x: 22, y: 25 },
  BACK2: { x: 22, y: 75 },
  MID1: { x: 50, y: 25 },
  MID2: { x: 50, y: 75 },
  FRONT1: { x: 78, y: 25 },
  FRONT2: { x: 78, y: 75 },
};
const POSITION_PREFERENCE_SLOTS_6 = {
  Fixo: ["BACK1", "BACK2"],
  Ala: ["MID1", "MID2"],
  Pivô: ["FRONT1", "FRONT2"],
};

function getFormationSlots(teamSize) {
  return teamSize === 6 ? FORMATION_SLOTS_6 : FORMATION_SLOTS_5;
}
function getFormationCoordsMap(teamSize) {
  return teamSize === 6 ? FORMATION_COORDS_6 : FORMATION_COORDS_5;
}
function getPositionPreferenceSlots(teamSize) {
  return teamSize === 6 ? POSITION_PREFERENCE_SLOTS_6 : POSITION_PREFERENCE_SLOTS_5;
}

/** Places teammates onto formation slots (5 or 6, per teamSize), honoring favoritePosition where possible; the rest fill in (deterministically, so the layout doesn't jitter on every re-render). */
function assignFormationSlots(players, teamSize) {
  const slots = getFormationSlots(teamSize);
  const preferenceSlots = getPositionPreferenceSlots(teamSize);
  const bySlot = {};
  let remaining = [...players];

  remaining.slice().forEach((player) => {
    const candidates = preferenceSlots[player.favoritePosition] || [];
    const openSlot = candidates.find((slot) => !bySlot[slot]);
    if (openSlot) {
      bySlot[openSlot] = player;
      remaining = remaining.filter((p) => p.id !== player.id);
    }
  });

  const openSlots = slots.filter((slot) => !bySlot[slot]);
  const fillers = [...remaining].sort((a, b) => a.id.localeCompare(b.id));
  openSlots.forEach((slot, i) => {
    if (fillers[i]) bySlot[slot] = fillers[i];
  });

  return slots.map((slot) => ({ slot, player: bySlot[slot] })).filter(
    (entry) => entry.player,
  );
}

/** Mirrors the formation horizontally for the right-hand team, since both sides face the center. */
function getFormationCoords(slot, isLeft, teamSize) {
  const coord = getFormationCoordsMap(teamSize)[slot];
  return isLeft ? coord : { x: 100 - coord.x, y: coord.y };
}

function renderMatchPanel(
  rotation,
  match,
  teamA,
  teamB,
  pendingMatchSelection = [],
) {
  if (!rotation || !match || !teamA || !teamB) {
    if (rotation && store.isAdmin) {
      const selectedCount = pendingMatchSelection.length;
      return `
        <div class="card" style="text-align: center; padding: 24px 16px;">
          <p style="font-size: 0.95rem; font-weight: 700; margin-bottom: 4px;">⚽ Escolha o primeiro confronto</p>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px;">
            Selecione os 2 times que já estão completos na fila abaixo (${selectedCount}/2 selecionados).
          </p>
          ${
            selectedCount === 2
              ? `
            <button id="btn-confirm-first-match" class="btn btn-primary btn-lg" style="margin-top: 10px; width: auto;">
              🚀 Iniciar Partida
            </button>
          `
              : ""
          }
        </div>
      `;
    }
    return `
      <div class="card" style="text-align: center; padding: 32px 16px;">
        <p style="font-size: 0.95rem; color: var(--text-muted);">Não há confronto em andamento — não há times suficientes disponíveis.</p>
      </div>
    `;
  }

  const ovrMap = computeCurrentOVRs(store);

  const remainingMs = match.timerRunning
    ? Math.max(0, match.timerEndsAt - Date.now())
    : match.timerRemainingMs;
  const canFinish = match.scoreA >= 2 || match.scoreB >= 2 || remainingMs <= 0;
  const notStarted =
    !match.timerRunning && match.timerRemainingMs === match.timerDurationMs;
  const timeUp = remainingMs <= 0;

  return `
    <div class="mini-pitch-scroll">
      <div class="mini-pitch" style="grid-template-columns: repeat(2, 1fr);">
        <div class="mini-pitch-halfway"></div>
        <div class="mini-pitch-circle"></div>
        <div class="mini-pitch-goal-box left"></div>
        <div class="mini-pitch-goal-box right"></div>

        <div class="mini-pitch-scoreboard">
          <div class="mini-pitch-score">${match.scoreA} <span>×</span> ${match.scoreB}</div>
          <div class="mini-pitch-timer" data-timer-display>${formatDuration(remainingMs)}</div>
        </div>

        ${[teamA, teamB]
          .map((team, teamIndex) => {
            const teamPlayers = team.playerIds
              .map((id) => store.getPlayer(id))
              .filter(Boolean);
            const hasStreak =
              rotation.streakTeamId === team.id && rotation.streakCount > 0;
            const isLeft = teamIndex === 0;
            const positions = assignFormationSlots(teamPlayers, store.teamSize);
            return `
            <div class="mini-pitch-lane">
              <div class="mini-pitch-lane-header">
                <span class="mini-pitch-lane-label" style="color: ${team.color};">${escapeHtml(team.name)}</span>
                ${hasStreak ? `<span class="mini-pitch-streak">🔥${rotation.streakCount}</span>` : ""}
              </div>
              ${positions
                .map(({ slot, player }) => {
                  const { x, y } = getFormationCoords(slot, isLeft, store.teamSize);
                  return `
                  <div class="mini-pitch-position" style="left: ${x}%; top: ${y}%;">
                    <div class="mini-pitch-chip" style="border-color: ${team.color};" title="${escapeHtml(player.name)}">
                      ${
                        store.avatars[player.id]
                          ? `<img src="${getAvatarDataUri(store.avatars[player.id])}" alt="" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />`
                          : escapeHtml(player.name.charAt(0).toUpperCase())
                      }
                      <span class="mini-pitch-ovr-badge" data-id="${player.id}">${ovrMap[player.id] ?? ""}</span>
                    </div>
                    <span class="mini-pitch-position-name">${escapeHtml(player.name)}</span>
                  </div>
                `;
                })
                .join("")}
            </div>
          `;
          })
          .join("")}
      </div>
    </div>

    ${
      store.isAdmin
        ? `
      <div class="match-controls">
        <div class="match-controls-info">
          ${timeUp ? '<span class="match-timeup-label">⏱️ Tempo esgotado!</span>' : ""}
          ${!timeUp && canFinish ? '<span class="match-ready-label">✅ Pronto para finalizar (2 gols)</span>' : ""}
        </div>
        <div class="match-controls-buttons">
          ${
            match.timerRunning
              ? `<button id="btn-pause-timer" class="btn btn-secondary">⏸️ Pausar</button>`
              : timeUp
                ? ""
                : `<button id="btn-start-timer" class="btn btn-secondary">${notStarted ? "▶️ Iniciar" : "▶️ Retomar"}</button>`
          }
          <button id="btn-finish-match" class="btn btn-gold" ${canFinish ? "" : "disabled"}>
            🏁 Finalizar
          </button>
        </div>

        <div class="match-score-adjust">
          <span class="match-score-adjust-label" title="Gols e assistências sempre precisam de um jogador — use isto para gol contra ou correções de placar.">⚠️ Gol contra / correção de placar:</span>
          ${[teamA, teamB]
            .map(
              (team) => `
            <div class="match-score-adjust-team">
              <span class="match-score-adjust-team-name" style="color: ${team.color};">${escapeHtml(team.name)}</span>
              <button class="btn-adjust-score" data-team="${team.id}" data-delta="-1" title="Remover 1 gol de ${escapeHtml(team.name)}">−</button>
              <button class="btn-adjust-score" data-team="${team.id}" data-delta="1" title="Adicionar 1 gol para ${escapeHtml(team.name)}">+</button>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `
        : ""
    }
  `;
}

/** One editable team card (goal/assist counters, departure, guest substitution) for a team currently on the pitch. */
function renderActiveTeamCard(pelada, team) {
  const diaristaIds = new Set(pelada.diaristaPlayerIds || []);
  const teamPlayers = team.playerIds
    .map((id) => store.getPlayer(id))
    .filter(Boolean);
  const activeGuests = (pelada.guestSlots || []).filter(
    (g) => g.teamId === team.id,
  );
  const completeness = store.getTeamCompleteness(team.id);
  const shortfall = Math.max(0, store.teamSize - completeness);

  return `
    <div class="team-card" style="border-top: 4px solid ${team.color};">
      <div class="team-card-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="width: 12px; height: 12px; border-radius: 50%; background: ${team.color};"></span>
          <span style="font-size: 1.1rem; font-weight: 800;">${escapeHtml(team.name)}</span>
        </div>
      </div>

      <div class="team-players-list">
        <!-- Original Team Players -->
        ${teamPlayers
          .map((p) => {
            const isDeparted = (pelada.departedPlayerIds || []).includes(p.id);
            const isDiarista = diaristaIds.has(p.id);
            const pStat = pelada.stats[p.id] || { goals: 0, assists: 0 };

            return `
            <div class="team-player-row ${isDeparted ? "departed" : ""} ${isDiarista ? "diarista" : ""}">
              <div class="player-row-header">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden;">
                  <span class="name" style="font-weight: 700; font-size: 0.92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(p.name)}">
                    ${escapeHtml(p.name)}
                  </span>
                  <span class="star-badge" style="font-size: 0.68rem; padding: 1px 5px; flex-shrink: 0;">
                    ${p.stars.toFixed(1)}★
                  </span>
                  ${isDiarista ? '<span class="diarista-badge">💰</span>' : ""}
                </div>

                ${
                  isDeparted
                    ? `
                  <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                    <span style="font-size: 0.72rem; color: var(--accent-red); font-weight: 700; white-space: nowrap;">
                      Saiu (${pStat.goals}G / ${pStat.assists}A)
                    </span>
                    ${
                      store.isAdmin
                        ? `
                      <button class="btn btn-primary btn-sm btn-revert-departure" data-id="${p.id}" data-team="${team.id}" title="Reverter saída e voltar ao jogo" style="padding: 3px 8px; font-size: 0.72rem; white-space: nowrap;">
                        ↩️ Voltar
                      </button>
                    `
                        : ""
                    }
                  </div>
                `
                    : store.isAdmin
                      ? `
                  <button class="btn btn-secondary btn-sm btn-mark-departure" data-id="${p.id}" data-team="${team.id}" title="Jogador foi embora mais cedo" style="padding: 3px 6px; font-size: 0.72rem; color: var(--accent-red); white-space: nowrap; flex-shrink: 0;">
                    🚪 Saiu
                  </button>
                `
                      : `
                  <span style="font-size: 0.8rem; color: var(--text-main); white-space: nowrap; flex-shrink: 0;">
                    ⚽ ${pStat.goals} &nbsp; 👟 ${pStat.assists}
                  </span>
                `
                }
              </div>

              ${
                !isDeparted && store.isAdmin
                  ? `
                <div class="live-controls">
                  <!-- Goal Counter -->
                  <div class="stat-counter" title="Gols marcados">
                    <button class="stat-btn btn-goal btn-decrease-goal" data-id="${p.id}">-</button>
                    <span class="count">${pStat.goals}</span>
                    <button class="stat-btn btn-goal btn-increase-goal" data-id="${p.id}" data-team="${team.id}">+⚽</button>
                  </div>

                  <!-- Assist Counter -->
                  <div class="stat-counter" title="Assistências">
                    <button class="stat-btn btn-assist btn-decrease-assist" data-id="${p.id}">-</button>
                    <span class="count">${pStat.assists}</span>
                    <button class="stat-btn btn-assist btn-increase-assist" data-id="${p.id}" data-team="${team.id}">+👟</button>
                  </div>
                </div>
              `
                  : ""
              }
            </div>
          `;
          })
          .join("")}

        <!-- Guest Completers Playing for this Team -->
        ${activeGuests
          .map((slot) => {
            const guestPlayer = store.getPlayer(slot.guestPlayerId);
            const departedPlayer = store.getPlayer(slot.departedPlayerId);
            if (!guestPlayer) return "";

            const pStat = pelada.stats[guestPlayer.id] || {
              guestGoals: 0,
              guestAssists: 0,
            };

            return `
            <div class="team-player-row" style="border: 1px dashed var(--accent-purple); background: rgba(139, 92, 246, 0.06);">
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(guestPlayer.name)}</span>
                  <span class="guest-badge">⚡ Convidado</span>
                </div>
                <span style="font-size: 0.72rem; color: var(--text-dim);">
                  ${departedPlayer ? `Substituindo ${departedPlayer.name}` : "Completando o time"}
                </span>
              </div>

              <div class="live-controls">
                ${
                  store.isAdmin
                    ? `
                  <!-- Guest Goal Counter (Does not count in ranking) -->
                  <div class="stat-counter" title="Gols do Convidado (não contam para ranking)">
                    <button class="stat-btn btn-goal btn-decrease-guest-goal" data-id="${guestPlayer.id}">-</button>
                    <span class="count">${pStat.guestGoals || 0}</span>
                    <button class="stat-btn btn-goal btn-increase-guest-goal" data-id="${guestPlayer.id}" data-team="${team.id}">+⚽</button>
                  </div>

                  <!-- Guest Assist Counter -->
                  <div class="stat-counter" title="Assistências do Convidado (não contam para ranking)">
                    <button class="stat-btn btn-assist btn-decrease-guest-assist" data-id="${guestPlayer.id}">-</button>
                    <span class="count">${pStat.guestAssists || 0}</span>
                    <button class="stat-btn btn-assist btn-increase-guest-assist" data-id="${guestPlayer.id}" data-team="${team.id}">+👟</button>
                  </div>
                `
                    : `
                  <span style="font-size: 0.8rem; color: var(--text-main); white-space: nowrap;">
                    ⚽ ${pStat.guestGoals || 0} &nbsp; 👟 ${pStat.guestAssists || 0}
                  </span>
                `
                }
              </div>
            </div>
          `;
          })
          .join("")}

        <!-- Team needs completion: fewer than 5 active players (started under-strength or a completer got reclaimed) -->
        ${
          shortfall > 0
            ? store.isAdmin
              ? `
          <button class="btn-complete-team" data-team="${team.id}">
            ➕ Time incompleto (${completeness}/${store.teamSize}) — sugerir jogador para completar
          </button>
        `
              : `
          <div class="team-incomplete-note">⚠️ Time incompleto (${completeness}/${store.teamSize})</div>
        `
            : ""
        }
      </div>
    </div>
  `;
}

/**
 * Compact list of the teams waiting their turn. The order of `rotation.waitingTeamIds` IS the
 * priority queue (top = next up) — it starts sorted by availability but the admin can freely
 * drag/reorder it afterwards, and (while there's no current match) tap teams to pick the first confrontation.
 */
function renderWaitingQueue(pelada, rotation, pendingMatchSelection = []) {
  if (
    !rotation ||
    !Array.isArray(rotation.waitingTeamIds) ||
    rotation.waitingTeamIds.length === 0
  )
    return "";

  const queue = rotation.waitingTeamIds;
  const departed = new Set(pelada.departedPlayerIds || []);
  const pickingFirstMatch = store.isAdmin && !rotation.currentMatch;

  return `
    <div class="card" style="margin-top: 20px;">
      <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
        ⏳ Fila de Espera ${store.isAdmin ? '<span style="font-weight: 400; font-size: 0.78rem;">(arraste ou use ▲▼ para reordenar)</span>' : ""}
      </h3>
      <div class="waiting-queue-list">
        ${queue
          .map((teamId, idx) => {
            const team = pelada.teams.find((t) => t.id === teamId);
            if (!team) return "";
            const completeness = store.getTeamCompleteness(teamId);
            const players = team.playerIds
              .map((id) => store.getPlayer(id))
              .filter(Boolean);
            const isSelected = pendingMatchSelection.includes(teamId);

            return `
            <div class="waiting-team-card ${isSelected ? "selected-for-match" : ""}" data-team-id="${team.id}" style="border-left: 4px solid ${team.color};" ${store.isAdmin ? 'draggable="true"' : ""}>
              <div class="waiting-team-header">
                ${store.isAdmin ? '<span class="waiting-team-drag-handle" title="Arraste para reordenar">⠿</span>' : ""}
                <span class="waiting-team-position">${idx + 1}º</span>
                <span style="font-weight: 800;">${escapeHtml(team.name)}</span>
                <span class="waiting-team-completeness ${completeness < store.teamSize ? "incomplete" : ""}">${completeness}/${store.teamSize} disponíveis</span>
                ${
                  store.isAdmin
                    ? `
                  <div class="waiting-team-reorder-btns">
                    <button class="btn-queue-up" data-team="${team.id}" title="Subir na fila" ${idx === 0 ? "disabled" : ""}>▲</button>
                    <button class="btn-queue-down" data-team="${team.id}" title="Descer na fila" ${idx === queue.length - 1 ? "disabled" : ""}>▼</button>
                  </div>
                `
                    : ""
                }
              </div>
              <div class="waiting-team-players">
                ${players
                  .map((p) => {
                    const isDeparted = departed.has(p.id);
                    return `
                    <span class="waiting-player-chip ${isDeparted ? "departed" : ""}">
                      ${escapeHtml(p.name)}
                      ${
                        store.isAdmin
                          ? `
                        <button class="waiting-player-toggle" data-id="${p.id}" data-team="${team.id}" data-departed="${isDeparted}" title="${isDeparted ? "Marcar como disponível" : "Marcar como ausente"}">
                          ${isDeparted ? "↩️" : "🚪"}
                        </button>
                      `
                          : ""
                      }
                    </span>
                  `;
                  })
                  .join("")}
              </div>
              ${
                pickingFirstMatch
                  ? `
                <button class="btn ${isSelected ? "btn-primary" : "btn-secondary"} btn-sm btn-toggle-match-selection" data-team="${team.id}" style="margin-top: 8px; width: 100%;">
                  ${isSelected ? "✅ Selecionado para o 1º confronto" : "Escalar para o 1º confronto"}
                </button>
              `
                  : ""
              }
            </div>
          `;
          })
          .join("")}
      </div>
    </div>
  `;
}

/** Formats a millisecond duration as m:ss for the match countdown. */
function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// A single app-wide ticking clock keeps the match countdown live without
// forcing a full re-render every second (renderLivePelada is recreated on
// every store mutation, so a per-render interval would leak).
let matchTimerIntervalStarted = false;
function ensureMatchTimerTicking() {
  if (matchTimerIntervalStarted) return;
  matchTimerIntervalStarted = true;
  setInterval(() => {
    const pelada = store.activePelada;
    const match =
      pelada?.status === "live" ? pelada.rotation?.currentMatch : null;
    if (!match) return;

    const remainingMs = match.timerRunning
      ? Math.max(0, match.timerEndsAt - Date.now())
      : match.timerRemainingMs;

    const timerEl = document.querySelector("[data-timer-display]");
    if (timerEl) timerEl.textContent = formatDuration(remainingMs);

    const finishBtn = document.querySelector("#btn-finish-match");
    if (finishBtn) {
      const canFinish =
        match.scoreA >= 2 || match.scoreB >= 2 || remainingMs <= 0;
      finishBtn.disabled = !canFinish;
    }

    if (match.timerRunning && remainingMs <= 0) {
      store.pauseMatchTimer();
    }
  }, 1000);
}
ensureMatchTimerTicking();

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Shared by the full render and the surgical per-goal/assist DOM patch (see renderLivePelada's
 * patchTimeline) so the timeline's markup only ever lives in one place.
 */
function renderTimelineEntries(pelada) {
  return (pelada.events || [])
    .slice(0, 10)
    .map((ev) => {
      if (ev.type === "manual-adjustment") {
        const team = pelada.teams.find((t) => t.id === ev.teamId);
        const teamName = team ? team.name : "Time";
        return `
          <div style="font-size: 0.82rem; display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: var(--bg-card-subtle); border-radius: 6px;">
            <span>
              ⚠️ Ajuste manual: <strong>${escapeHtml(teamName)}</strong> ${ev.delta > 0 ? "+1" : "-1"} (gol contra / correção)
            </span>
            <span style="color: var(--text-dim); font-size: 0.75rem;">${ev.time}</span>
          </div>
        `;
      }
      const player = store.getPlayer(ev.playerId);
      const name = player ? player.name : "Atleta";
      return `
        <div style="font-size: 0.82rem; display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: var(--bg-card-subtle); border-radius: 6px;">
          <span>
            ${ev.type === "goal" ? "⚽ GOL de" : "👟 ASSISTÊNCIA de"} <strong>${escapeHtml(name)}</strong>
            ${ev.isGuest ? '<span class="guest-badge" style="font-size: 0.65rem;">(Convidado)</span>' : ""}
          </span>
          <span style="color: var(--text-dim); font-size: 0.75rem;">${ev.time}</span>
        </div>
      `;
    })
    .join("");
}
