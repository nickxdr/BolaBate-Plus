import { store } from "../state/store.js";
import { showToast } from "./rankingView.js";
import { suggestPlayerRating } from "../services/ratingSuggestion.js";
import { getPlayerAchievements } from "../services/achievement.js";
import {
  AVATAR_TABS,
  AVATAR_COLOR_TABS,
  AVATAR_EDITOR_TABS,
  DEFAULT_AVATAR_CONFIG,
  getAvatarDataUri,
} from "../services/avatar.js";
import { computeCurrentOVRs } from "../services/ovr.js";

function ovrTierClass(ovr) {
  if (ovr >= 85) return "ovr-elite";
  if (ovr >= 70) return "ovr-good";
  if (ovr >= 55) return "ovr-mid";
  return "ovr-low";
}

/**
 * Diaristas (day-rate guests) declutter the roster management screen once their
 * pelada is over — UNLESS they turn out to have real data: prior participation
 * as a mensalista (player.participacao, synced from monthlyStats, never counts
 * diarista appearances) or in any past ranking table. Purely a display filter —
 * the player record itself is untouched, so history/attendance still work.
 */
export function isHiddenDiarista(player) {
  if (Number(player.participacao) > 0) return false;

  return store.history.some((entry) =>
    (entry.diaristaPlayerIds || []).includes(player.id),
  );
}

export function renderPlayersView() {
  const container = document.createElement("div");
  container.className = "view-container";

  let searchTerm = "";
  let sortBy = "name";
  let positionFilter = "all";
  let starsFilter = "all";

  function getFilteredPlayers() {
    return store.players
      .filter((p) => !isHiddenDiarista(p))
      .filter((p) => {
        const term = searchTerm.trim().toLowerCase();

        if (!term) return true;

        if (p.name.toLowerCase().includes(term)) return true;

        // Busca por nota: aceita "4", "4.5", "4,5".
        // "4" lista 4.0 e 4.5; "4.5"/"4,5" filtra a nota exata.
        const numMatch = term.replace(",", ".").match(/\d+(\.\d+)?/);

        if (numMatch) {
          const numTerm = numMatch[0];
          const starsStr = Number(p.stars).toFixed(1);

          if (starsStr.startsWith(numTerm)) return true;
        }

        return false;
      })
      .filter((p) => {
        if (starsFilter === "all") return true;

        return Number(p.stars).toFixed(1) === starsFilter;
      })
      .filter((p) => {
        if (positionFilter === "all") return true;

        if (positionFilter === "none") {
          return !p.favoritePosition;
        }

        return p.favoritePosition === positionFilter;
      })
      .sort((a, b) => {
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }

        if (sortBy === "stars-desc") {
          return b.stars - a.stars;
        }

        if (sortBy === "stars-asc") {
          return a.stars - b.stars;
        }

        return 0;
      });
  }

  function render() {
    const players = getFilteredPlayers();

    container.innerHTML = `
      <div class="players-header">
        <div>
          <h1 class="players-title">
            👥 Gestão de Jogadores
          </h1>

          <p class="players-subtitle">
            Cadastre jogadores e altere apenas o nome e as estrelas. As estatísticas
            (gols, assistências, votos) são editadas na aba Ranking.
          </p>
        </div>

        <button id="btn-add-player" class="btn btn-primary players-add-btn">
          <svg
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            stroke-width="2.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>

          Adicionar Jogador
        </button>
      </div>

      <!-- Search & Filters Toolbar -->
      <div class="card players-toolbar-card">
        <div class="players-toolbar">

          <input
            type="text"
            id="player-search"
            class="input-field players-search-input"
            placeholder="Buscar por nome"
            value="${escapeHtml(searchTerm)}"
          />

          <div class="players-sort">
            <span class="players-sort-label">
              Nota:
            </span>

            <select
              id="player-stars-filter"
              class="input-field players-sort-select"
            >
              <option value="all" ${
                starsFilter === "all" ? "selected" : ""
              }>Todas as notas</option>

              ${["5.0", "4.5", "4.0", "3.5", "3.0", "2.5", "2.0", "1.5", "1.0", "0.5"]
                .map(
                  (s) =>
                    `<option value="${s}" ${
                      starsFilter === s ? "selected" : ""
                    }>${s} ★</option>`,
                )
                .join("")}
            </select>
          </div>

          <div class="players-sort">
            <span class="players-sort-label">
              Posição:
            </span>

            <select
              id="player-position-filter"
              class="input-field players-sort-select"
            >
              <option value="all" ${
                positionFilter === "all" ? "selected" : ""
              }>Todas as posições</option>

              <option value="Fixo" ${
                positionFilter === "Fixo" ? "selected" : ""
              }>Fixo</option>

              <option value="Ala" ${
                positionFilter === "Ala" ? "selected" : ""
              }>Ala</option>

              <option value="Pivô" ${
                positionFilter === "Pivô" ? "selected" : ""
              }>Pivô</option>

              <option value="none" ${
                positionFilter === "none" ? "selected" : ""
              }>Não definida</option>
            </select>
          </div>

          <div class="players-sort">
            <span class="players-sort-label">
              Ordenar:
            </span>

            <select
              id="player-sort"
              class="input-field players-sort-select"
            >
              <option value="name" ${
                sortBy === "name" ? "selected" : ""
              }>
                Nome (A-Z)
              </option>

              <option value="stars-desc" ${
                sortBy === "stars-desc" ? "selected" : ""
              }>
                Mais Estrelas (5.0 → 0.5)
              </option>

              <option value="stars-asc" ${
                sortBy === "stars-asc" ? "selected" : ""
              }>
                Menos Estrelas (0.5 → 5.0)
              </option>
            </select>
          </div>

        </div>
      </div>

      <!-- Players Cards Grid -->
      <div
        style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px;"
        id="players-grid"
      >
        ${players
          .map((player) => {
            return `
              <div
                class="card"
                style="padding: 16px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 0;"
              >
                <div style="display: flex; align-items: center; gap: 12px;">

                  <button
                    class="btn-edit-avatar"
                    data-id="${player.id}"
                    title="Personalizar avatar"
                    style="width: 44px; height: 44px; border-radius: 12px; overflow: hidden; padding: 0; border: 1px solid var(--border-color); background: var(--bg-card-subtle); cursor: pointer; flex-shrink: 0;"
                  >
                    <img
                      src="${getAvatarDataUri(store.avatars[player.id])}"
                      alt=""
                      style="width: 100%; height: 100%; object-fit: cover;"
                    />
                  </button>

                  <div>
                    <h3
                      style="font-size: 1.05rem; font-weight: 700; margin-bottom: 2px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;"
                    >
                      ${escapeHtml(player.name)}

                      ${
                        store.isAdmin
                          ? `
                            <span
                              class="star-badge"
                              style="cursor: pointer;"
                              data-edit-stars="${player.id}"
                              title="Clique para editar nome e estrelas"
                            >
                              ★ ${player.stars.toFixed(1)}
                            </span>
                          `
                          : `
                            <span
                              class="star-badge"
                              title="Somente o administrador pode editar"
                            >
                              ★ ${player.stars.toFixed(1)}
                            </span>
                          `
                      }
                    </h3>

                    <div
                      style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;"
                    >
                      <span class="player-position-label">
                        ${escapeHtml(
                          player.favoritePosition || "Posição não definida",
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div style="display: flex; gap: 6px;">

                  <button
                    class="btn btn-secondary btn-sm btn-profile-player"
                    data-id="${player.id}"
                    title="Ver perfil e evolução"
                  >
                    📊
                  </button>

                  ${
                    store.isAdmin
                      ? `
                        <button
                          class="btn btn-secondary btn-sm btn-edit-player"
                          data-id="${player.id}"
                          title="Editar nome e estrelas"
                        >
                          ✏️
                        </button>

                        <button
                          class="btn btn-secondary btn-sm btn-delete-player"
                          data-id="${player.id}"
                          style="color: var(--accent-red);"
                          title="Excluir jogador"
                        >
                          🗑️
                        </button>
                      `
                      : ""
                  }

                </div>
              </div>
            `;
          })
          .join("")}
      </div>

      ${
        players.length === 0
          ? `
            <div
              style="text-align: center; padding: 48px 16px; color: var(--text-muted);"
            >
              <p style="font-size: 1.1rem; font-weight: 600;">
                Nenhum jogador encontrado.
              </p>
            </div>
          `
          : ""
      }
    `;

    // Bind search and filter events
    const searchInput = container.querySelector("#player-search");

    searchInput.addEventListener("input", (e) => {
      searchTerm = e.target.value;
      render();

      const input = container.querySelector("#player-search");

      if (input) {
        input.focus();
        input.setSelectionRange(
          searchTerm.length,
          searchTerm.length,
        );
      }
    });

    const sortSelect = container.querySelector("#player-sort");

    sortSelect.addEventListener("change", (e) => {
      sortBy = e.target.value;
      render();
    });

    const positionSelect = container.querySelector(
      "#player-position-filter",
    );

    positionSelect.addEventListener("change", (e) => {
      positionFilter = e.target.value;
      render();
    });

    const starsSelect = container.querySelector(
      "#player-stars-filter",
    );

    starsSelect.addEventListener("change", (e) => {
      starsFilter = e.target.value;
      render();
    });

    // Bind Add Player
    container
      .querySelector("#btn-add-player")
      .addEventListener("click", () => {
        openAddPlayerModal();
      });

    // Bind Edit Player
    container.querySelectorAll(".btn-edit-player").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-id");
        openEditPlayerModal(id);
      });
    });

    // Bind Profile
    container
      .querySelectorAll(".btn-profile-player")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          openPlayerProfileModal(
            e.currentTarget.getAttribute("data-id"),
          );
        });
      });

    // Bind Avatar Editor
    container.querySelectorAll(".btn-edit-avatar").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        openAvatarEditorModal(
          e.currentTarget.getAttribute("data-id"),
          render,
        );
      });
    });

    // Bind Direct Star Click
    container.querySelectorAll("[data-edit-stars]").forEach((badge) => {
      badge.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-edit-stars");
        openEditPlayerModal(id);
      });
    });

    // Bind Delete Player
    container
      .querySelectorAll(".btn-delete-player")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const id = e.currentTarget.getAttribute("data-id");
          const player = store.getPlayer(id);

          if (!player) return;

          if (
            confirm(
              `Tem certeza que deseja excluir "${player.name}"? As estatísticas dele serão removidas.`,
            )
          ) {
            store.deletePlayer(id);
            showToast(`Jogador "${player.name}" removido.`);
            render();
          }
        });
      });
  }

  // ============================================================
  // ADICIONAR JOGADOR
  // ============================================================
  function openAddPlayerModal() {
    const modal = document.createElement("div");

    modal.className = "modal-overlay";

    modal.innerHTML = `
      <div class="modal-content players-add-modal">

        <div class="modal-header">
          <h2>Adicionar Jogadores</h2>

          <button
            class="modal-close"
            type="button"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div class="player-add-tabs">
          <button
            type="button"
            class="player-add-tab active"
            data-mode="single"
          >
            Um jogador
          </button>

          <button
            type="button"
            class="player-add-tab"
            data-mode="multiple"
          >
            Vários jogadores
          </button>
        </div>

        <!-- MODO INDIVIDUAL -->
        <form
          id="add-player-form"
          class="player-add-mode active"
          data-mode="single"
        >
          <div class="form-group">
            <label for="player-name">
              Nome
            </label>

            <input
              type="text"
              id="player-name"
              name="name"
              placeholder="Digite o nome do jogador"
              autocomplete="off"
              required
            />
          </div>

          <div class="form-group">
            <label for="player-stars">
              Nota inicial:
              <strong id="player-stars-value">
                3.0 ★
              </strong>
            </label>

            <input
              type="range"
              id="player-stars"
              name="stars"
              min="0.5"
              max="5"
              step="0.5"
              value="3"
            />
          </div>

          <div class="form-group">
            <label for="player-position">
              Posição favorita
            </label>

            <select
              id="player-position"
              name="favoritePosition"
            >
              <option value="">Não definida</option>
              <option value="Fixo">Fixo</option>
              <option value="Ala">Ala</option>
              <option value="Pivô">Pivô</option>
            </select>
          </div>

          <div class="modal-actions">
            <button
              type="button"
              class="btn btn-secondary btn-cancel"
            >
              Cancelar
            </button>

            <button
              type="submit"
              class="btn btn-primary"
            >
              Adicionar jogador
            </button>
          </div>
        </form>

        <!-- MODO VÁRIOS -->
        <form
          id="add-multiple-players-form"
          class="player-add-mode"
          data-mode="multiple"
        >
          <div class="form-group">
            <label for="multiple-player-names">
              Jogadores
            </label>

            <textarea
              id="multiple-player-names"
              name="names"
              rows="7"
              placeholder="Digite um jogador por linha&#10;&#10;João&#10;Pedro&#10;Marcos&#10;Rafael"
              autocomplete="off"
            ></textarea>

            <small class="form-hint">
              Digite um jogador por linha.
            </small>
          </div>

          <div
            id="multiple-players-preview"
            class="multiple-players-preview"
          >
            <div class="multiple-players-count">
              Nenhum jogador informado
            </div>
          </div>

          <div class="form-group">
            <label for="multiple-player-stars">
              Nota inicial:
              <strong id="multiple-player-stars-value">
                3.0 ★
              </strong>
            </label>

            <input
              type="range"
              id="multiple-player-stars"
              name="stars"
              min="0.5"
              max="5"
              step="0.5"
              value="3"
            />
          </div>

          <div class="form-group">
            <label for="multiple-player-position">
              Posição favorita
            </label>

            <select
              id="multiple-player-position"
              name="favoritePosition"
            >
              <option value="">Não definida</option>
              <option value="Fixo">Fixo</option>
              <option value="Ala">Ala</option>
              <option value="Pivô">Pivô</option>
            </select>
          </div>

          <div class="modal-actions">
            <button
              type="button"
              class="btn btn-secondary btn-cancel"
            >
              Cancelar
            </button>

            <button
              type="submit"
              class="btn btn-primary"
              id="btn-add-multiple-players"
              disabled
            >
              Adicionar jogadores
            </button>
          </div>
        </form>

      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
      modal.remove();
    };

    // ============================================================
    // ELEMENTOS
    // ============================================================

    const tabs = modal.querySelectorAll(".player-add-tab");
    const modes = modal.querySelectorAll(".player-add-mode");

    const singleForm = modal.querySelector(
      "#add-player-form",
    );

    const multipleForm = modal.querySelector(
      "#add-multiple-players-form",
    );

    const singleStars = modal.querySelector(
      "#player-stars",
    );

    const singleStarsValue = modal.querySelector(
      "#player-stars-value",
    );

    const multipleStars = modal.querySelector(
      "#multiple-player-stars",
    );

    const multipleStarsValue = modal.querySelector(
      "#multiple-player-stars-value",
    );

    const multipleNames = modal.querySelector(
      "#multiple-player-names",
    );

    const multiplePreview = modal.querySelector(
      "#multiple-players-preview",
    );

    const multipleSubmit = modal.querySelector(
      "#btn-add-multiple-players",
    );

    // ============================================================
    // TROCA ENTRE "UM" E "VÁRIOS"
    // ============================================================

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const mode = tab.dataset.mode;

        tabs.forEach((t) => {
          t.classList.toggle(
            "active",
            t.dataset.mode === mode,
          );
        });

        modes.forEach((form) => {
          form.classList.toggle(
            "active",
            form.dataset.mode === mode,
          );
        });

        if (mode === "single") {
          setTimeout(() => {
            modal.querySelector("#player-name")?.focus();
          }, 50);
        } else {
          setTimeout(() => {
            multipleNames?.focus();
          }, 50);
        }
      });
    });

    // ============================================================
    // NOTA - INDIVIDUAL
    // ============================================================

    singleStars.addEventListener("input", () => {
      singleStarsValue.textContent =
        `${Number(singleStars.value).toFixed(1)} ★`;
    });

    // ============================================================
    // NOTA - VÁRIOS
    // ============================================================

    multipleStars.addEventListener("input", () => {
      multipleStarsValue.textContent =
        `${Number(multipleStars.value).toFixed(1)} ★`;
    });

    // ============================================================
    // NORMALIZAÇÃO DOS NOMES
    // ============================================================

    const getMultipleNames = () => {
      const lines = multipleNames.value
        .split("\n")
        .map((name) => name.trim())
        .filter(Boolean);

      const uniqueNames = [];
      const seen = new Set();

      lines.forEach((name) => {
        const key = name.toLocaleLowerCase();

        if (!seen.has(key)) {
          seen.add(key);
          uniqueNames.push(name);
        }
      });

      return uniqueNames;
    };

    // ============================================================
    // VERIFICA NOMES JÁ EXISTENTES
    // ============================================================

    const getExistingPlayerNames = () => {
      return new Set(
        store.players.map((player) =>
          String(player.name || "")
            .trim()
            .toLocaleLowerCase(),
        ),
      );
    };

    // ============================================================
    // ATUALIZA PREVIEW
    // ============================================================

    const updateMultiplePreview = () => {
      const names = getMultipleNames();
      const existingNames = getExistingPlayerNames();

      if (!names.length) {
        multiplePreview.innerHTML = `
          <div class="multiple-players-count">
            Nenhum jogador informado
          </div>
        `;

        multipleSubmit.disabled = true;
        multipleSubmit.textContent = "Adicionar jogadores";

        return;
      }

      const newNames = names.filter(
        (name) =>
          !existingNames.has(
            name.toLocaleLowerCase(),
          ),
      );

      const duplicatedNames = names.filter(
        (name) =>
          existingNames.has(
            name.toLocaleLowerCase(),
          ),
      );

      let previewHtml = `
        <div class="multiple-players-count">
          <strong>${names.length}</strong>
          ${
            names.length === 1
              ? "jogador informado"
              : "jogadores informados"
          }
        </div>
      `;

      if (newNames.length) {
        previewHtml += `
          <div class="multiple-players-new">
            <strong>${newNames.length}</strong>
            ${
              newNames.length === 1
                ? "será adicionado"
                : "serão adicionados"
            }
          </div>
        `;
      }

      if (duplicatedNames.length) {
        previewHtml += `
          <div class="multiple-players-existing">
            <strong>${duplicatedNames.length}</strong>
            ${
              duplicatedNames.length === 1
                ? "já está cadastrado e será ignorado"
                : "já estão cadastrados e serão ignorados"
            }
          </div>
        `;
      }

      multiplePreview.innerHTML = previewHtml;

      if (newNames.length) {
        multipleSubmit.disabled = false;

        multipleSubmit.textContent =
          `Adicionar ${newNames.length} jogador${
            newNames.length === 1 ? "" : "es"
          }`;
      } else {
        multipleSubmit.disabled = true;
        multipleSubmit.textContent =
          "Nenhum novo jogador";
      }
    };

    multipleNames.addEventListener(
      "input",
      updateMultiplePreview,
    );

    // ============================================================
    // SUBMIT - INDIVIDUAL
    // ============================================================

    singleForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const name =
        singleForm.elements.name.value.trim();

      const stars = parseFloat(
        singleStars.value,
      );

      const favoritePosition =
        singleForm.elements.favoritePosition.value;

      if (!name) {
        showToast("Digite o nome do jogador.");
        return;
      }

      const created = store.addPlayer(
        name,
        stars,
        favoritePosition,
      );

      if (created) {
        closeModal();

        showToast(
          `Jogador "${created.name}" adicionado com sucesso!`,
        );

        render();
      }
    });

    // ============================================================
    // SUBMIT - VÁRIOS
    // ============================================================

    multipleForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const names = getMultipleNames();
      const existingNames =
        getExistingPlayerNames();

      const namesToAdd = names.filter(
        (name) =>
          !existingNames.has(
            name.toLocaleLowerCase(),
          ),
      );

      if (!namesToAdd.length) {
        showToast(
          "Nenhum jogador novo para adicionar.",
        );
        return;
      }

      const stars = parseFloat(
        multipleStars.value,
      );

      const favoritePosition =
        multipleForm.elements.favoritePosition.value;

      let addedCount = 0;

      namesToAdd.forEach((name) => {
        const created = store.addPlayer(
          name,
          stars,
          favoritePosition,
        );

        if (created) {
          addedCount++;
        }
      });

      if (addedCount > 0) {
        closeModal();

        showToast(
          `${addedCount} jogador${
            addedCount === 1 ? "" : "es"
          } adicionado${
            addedCount === 1 ? "" : "s"
          } com sucesso!`,
        );

        render();
      }
    });

    // ============================================================
    // FECHAR
    // ============================================================

    modal
      .querySelectorAll(
        ".modal-close, .btn-cancel",
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          closeModal,
        );
      });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // ESC
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        closeModal();

        document.removeEventListener(
          "keydown",
          handleEscape,
        );
      }
    };

    document.addEventListener(
      "keydown",
      handleEscape,
    );

    // ============================================================
    // FOCO INICIAL
    // ============================================================

    setTimeout(() => {
      modal
        .querySelector("#player-name")
        ?.focus();
    }, 50);
  }

  // ============================================================
  // EDITAR JOGADOR
  // ============================================================

  function openEditPlayerModal(id) {
    const player = store.getPlayer(id);

    if (!player) return;

    const modalContainer =
      document.getElementById("modal-container");

    const suggestion = suggestPlayerRating(
      store.monthlyStats,
      player,
      store.currentPeriodKey(),
    );

    const suggestionHtml =
      buildRatingSuggestionHtml(suggestion);

    modalContainer.innerHTML = `
      <div
        class="modal-overlay"
        id="edit-modal-overlay"
      >
        <div
          class="modal-content"
          style="max-width: 520px;"
        >
          <div class="modal-header">
            <h2 class="modal-title">
              Editar Jogador
            </h2>

            <button
              class="modal-close"
              id="edit-modal-close"
            >
              &times;
            </button>
          </div>

          <form id="edit-player-form">

            <div style="margin-bottom: 14px;">
              <label
                style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 4px; color: var(--text-muted);"
              >
                Nome do Jogador
              </label>

              <input
                type="text"
                name="name"
                class="input-field"
                value="${escapeHtml(player.name)}"
                required
              />
            </div>

            <div style="margin-bottom: 16px;">
              <label
                style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 4px; color: var(--text-muted);"
              >
                Nível de Habilidade (0.5 a 5.0 Estrelas)
              </label>

              ${suggestionHtml}

              <div
                style="display: flex; align-items: center; gap: 12px; margin-top: 10px;"
              >
                <input
                  type="range"
                  name="stars"
                  id="edit-star-range"
                  min="0.5"
                  max="5.0"
                  step="0.5"
                  value="${player.stars}"
                  style="flex: 1; accent-color: var(--accent-gold); cursor: pointer;"
                />

                <span
                  id="edit-star-label"
                  class="star-badge"
                  style="font-size: 1rem; min-width: 60px; justify-content: center;"
                >
                  ${player.stars.toFixed(1)} ★
                </span>
              </div>
            </div>

            <div
              style="display: flex; gap: 10px; justify-content: flex-end;"
            >
              <button
                type="button"
                class="btn btn-secondary"
                id="edit-modal-cancel"
              >
                Cancelar
              </button>

              <button
                type="submit"
                class="btn btn-primary"
              >
                Salvar Alterações
              </button>
            </div>

          </form>
        </div>
      </div>
    `;

    const close = () => {
      modalContainer.innerHTML = "";
    };

    const overlay = modalContainer.querySelector(
      "#edit-modal-overlay",
    );

    modalContainer
      .querySelector("#edit-modal-close")
      .addEventListener("click", close);

    modalContainer
      .querySelector("#edit-modal-cancel")
      .addEventListener("click", close);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    const starRange =
      modalContainer.querySelector(
        "#edit-star-range",
      );

    const starLabel =
      modalContainer.querySelector(
        "#edit-star-label",
      );

    starRange.addEventListener("input", (e) => {
      starLabel.textContent =
        Number(e.target.value).toFixed(1) +
        " ★";
    });

    const applyBtn =
      modalContainer.querySelector(
        "#apply-rating-suggestion",
      );

    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        starRange.value = String(
          suggestion.suggestedStars,
        );

        starLabel.textContent =
          Number(
            suggestion.suggestedStars,
          ).toFixed(1) + " ★";
      });
    }

    const form =
      modalContainer.querySelector(
        "#edit-player-form",
      );

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const newName =
        form.name.value.trim();

      const newStars =
        parseFloat(starRange.value);

      store.updatePlayer(id, {
        name: newName,
        stars: newStars,
      });

      close();

      showToast(
        `Jogador "${newName}" atualizado!`,
      );

      render();
    });
  }

  /**
   * Painel de sugestão de nota dentro do modal de edição.
   */
  function buildRatingSuggestionHtml(
    suggestion,
  ) {
    const tone =
      suggestion.direction === "up"
        ? {
            border: "rgba(16,185,129,.45)",
            bg: "rgba(16,185,129,.10)",
            icon: "📈",
            title: "Sugestão: aumentar a nota",
          }
        : suggestion.direction === "down"
          ? {
              border: "rgba(239,68,68,.45)",
              bg: "rgba(239,68,68,.10)",
              icon: "📉",
              title: "Sugestão: diminuir a nota",
            }
          : {
              border: "var(--border-color)",
              bg: "var(--bg-card-subtle)",
              icon: "✋",
              title: "Sugestão: manter a nota",
            };

    const showApply =
      suggestion.direction !== "keep" &&
      Number(suggestion.suggestedStars) !==
        Number(suggestion.currentStars);

    return `
      <div
        style="border: 1px solid ${tone.border}; background: ${tone.bg}; border-radius: 12px; padding: 10px 12px; margin-bottom: 4px;"
      >
        <div
          style="font-size: 0.82rem; font-weight: 800; display: flex; align-items: center; gap: 6px;"
        >
          <span
            style="flex: 1 1 auto; min-width: 0;"
          >
            ${tone.icon} ${tone.title}
          </span>

          <span
            style="font-weight: 700; color: #F59E0B; white-space: nowrap; flex-shrink: 0;"
          >
            ${Number(
              suggestion.currentStars,
            ).toFixed(1)}
            →
            ${Number(
              suggestion.suggestedStars,
            ).toFixed(1)}★
          </span>
        </div>

        <div
          style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;"
        >
          ${escapeHtml(suggestion.reason)}
        </div>

        ${
          showApply
            ? `
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                id="apply-rating-suggestion"
                style="margin-top: 8px;"
              >
                ⚡ Aplicar sugestão
                (${Number(
                  suggestion.suggestedStars,
                ).toFixed(1)}★)
              </button>
            `
            : ""
        }
      </div>
    `;
  }

  // ============================================================
  // PERFIL DO JOGADOR
  // ============================================================

  function openPlayerProfileModal(id) {
    const player = store.getPlayer(id);

    if (!player) return;

    const modalContainer =
      document.getElementById("modal-container");

    const now = new Date();

    const months = Array.from(
      { length: 12 },
      (_, index) => {
        const date = new Date(
          now.getFullYear(),
          now.getMonth() - (11 - index),
          1,
        );

        const key = `${date.getFullYear()}-${String(
          date.getMonth() + 1,
        ).padStart(2, "0")}`;

        return {
          key,

          label: date
            .toLocaleDateString("pt-BR", {
              month: "short",
              year: "2-digit",
            })
            .replace(".", ""),

          stats:
            store.getPeriodSnapshot(
              date.getFullYear(),
              date.getMonth() + 1,
            ).players?.[id] || {},
        };
      },
    );

    const totals = [
      "goals",
      "assists",
      "participacao",
      "selecao",
      "puskas",
      "craque",
      "bagre",
      "wins",
      "draws",
      "losses",
    ].reduce((result, field) => {
      result[field] = months.reduce(
        (sum, month) =>
          sum +
          (Number(month.stats[field]) || 0),
        0,
      );

      return result;
    }, {});

    const totalMatches =
      totals.wins +
      totals.draws +
      totals.losses;

    const winRate =
      totalMatches > 0
        ? Math.round(
            (totals.wins / totalMatches) * 100,
          )
        : 0;

    const winRateTone =
      winRate >= 60
        ? "win-rate-high"
        : winRate >= 40
          ? "win-rate-medium"
          : "win-rate-low";

    const frequentCompanions =
      getFrequentCompanions(id);

    const positions = [
      "Fixo",
      "Ala",
      "Pivô",
    ];

    const achievements =
      getPlayerAchievements(id);

    const ovr =
      computeCurrentOVRs(store)[id] ?? 0;

    modalContainer.innerHTML = `
      <div
        class="modal-overlay"
        id="profile-modal-overlay"
      >
        <div class="modal-content player-profile-modal">

          <div class="modal-header">

            <div
              style="display: flex; align-items: center; gap: 12px;"
            >
              <button
                class="btn-edit-avatar"
                data-id="${player.id}"
                title="Personalizar avatar"
                style="width: 56px; height: 56px; border-radius: 14px; overflow: hidden; padding: 0; border: 1px solid var(--border-color); background: var(--bg-card-subtle); cursor: pointer; flex-shrink: 0;"
              >
                <img
                  src="${getAvatarDataUri(
                    store.avatars[player.id],
                  )}"
                  alt=""
                  style="width: 100%; height: 100%; object-fit: cover;"
                />
              </button>

              <div
                class="ovr-badge ${ovrTierClass(ovr)}"
                title="Overall — calculado a partir das estrelas e do desempenho em relação à média da liga"
              >
                <span class="ovr-number">
                  ${ovr}
                </span>

                <span class="ovr-label">
                  OVR
                </span>
              </div>

              <div>
                <span class="profile-eyebrow">
                  Perfil individual
                </span>

                <h2 class="modal-title">
                  ${escapeHtml(player.name)}
                </h2>
              </div>
            </div>

            <button
              class="modal-close"
              id="profile-modal-close"
              aria-label="Fechar perfil"
            >
              &times;
            </button>

          </div>

          <div class="profile-preferences">
            <div>
              <span class="profile-field-label">
                Posição favorita
              </span>

              <p class="profile-field-note">
                Escolha a posição em que o jogador prefere atuar.
              </p>
            </div>

            <div class="profile-position-control">
              <select
                id="profile-position"
                class="input-field"
                ${store.isAdmin ? "" : "disabled"}
              >
                <option value="">
                  Não definida
                </option>

                ${positions
                  .map(
                    (position) => `
                      <option
                        value="${position}"
                        ${
                          player.favoritePosition ===
                          position
                            ? "selected"
                            : ""
                        }
                      >
                        ${position}
                      </option>
                    `,
                  )
                  .join("")}
              </select>

              ${
                store.isAdmin
                  ? `
                    <button
                      type="button"
                      class="btn btn-primary btn-sm"
                      id="save-profile-position"
                    >
                      Salvar
                    </button>
                  `
                  : ""
              }
            </div>
          </div>

          <div class="profile-summary-grid">

            ${profileMetric(
              "⚽",
              "Gols",
              totals.goals,
              "goals",
            )}

            ${profileMetric(
              "👟",
              "Assistências",
              totals.assists,
              "assists",
            )}

            ${profileMetric(
              "📅",
              "Participações",
              totals.participacao,
              "matches",
            )}

            ${profileMetric(
              "🏆",
              "Prêmios",
              totals.selecao +
                totals.puskas +
                totals.craque +
                totals.bagre,
              "awards",
            )}

            ${profileMetric(
              "📈",
              `Aproveitamento (${totals.wins}V / ${totals.draws}E / ${totals.losses}D)`,
              `${winRate}%`,
              `win-rate ${winRateTone}`,
            )}

          </div>

          <div class="profile-section-heading">
            <div>
              <h3>Evolução mensal</h3>
              <p>Últimos 12 meses registrados</p>
            </div>

            <span class="star-badge">
              ★ ${Number(player.stars).toFixed(1)}
            </span>
          </div>

          <div class="profile-table-wrap">
            <table class="profile-table">

              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Gols</th>
                  <th>Assist.</th>
                  <th>Part.</th>
                  <th>Prêmios</th>
                </tr>
              </thead>

              <tbody>
                ${months
                  .map((month) => {
                    const stats = month.stats;

                    const awards =
                      (Number(stats.selecao) || 0) +
                      (Number(stats.puskas) || 0) +
                      (Number(stats.craque) || 0) +
                      (Number(stats.bagre) || 0);

                    return `
                      <tr>
                        <th scope="row">
                          ${month.label}
                        </th>

                        <td class="profile-goals">
                          ${Number(stats.goals) || 0}
                        </td>

                        <td class="profile-assists">
                          ${Number(stats.assists) || 0}
                        </td>

                        <td>
                          ${Number(
                            stats.participacao,
                          ) || 0}
                        </td>

                        <td>
                          ${awards}
                        </td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>

            </table>
          </div>

          <div class="profile-section-heading">
            <div>
              <h3>Conquistas</h3>
              <p>
                Desafios desbloqueados ao longo da carreira
              </p>
            </div>

            <span class="profile-achievements-count">
              ${
                achievements.filter(
                  (a) => a.unlocked,
                ).length
              }/${achievements.length}
            </span>
          </div>

          <div class="profile-achievements">
            ${achievements
              .map((achievement) => {
                const progress = Math.min(
                  achievement.progress,
                  achievement.target,
                );

                const percentage = Math.min(
                  (achievement.progress /
                    achievement.target) *
                    100,
                  100,
                );

                return `
                  <div
                    class="profile-achievement ${
                      achievement.unlocked
                        ? "unlocked"
                        : "locked"
                    }"
                  >
                    <div class="profile-achievement-icon">
                      ${achievement.icon}
                    </div>

                    <div class="profile-achievement-content">

                      <div class="profile-achievement-header">
                        <strong>
                          ${escapeHtml(
                            achievement.name,
                          )}
                        </strong>

                        <span>
                          ${
                            achievement.unlocked
                              ? "✓ Desbloqueada"
                              : `${progress}/${achievement.target}`
                          }
                        </span>
                      </div>

                      <p>
                        ${escapeHtml(
                          achievement.description,
                        )}
                      </p>

                      <div class="profile-achievement-progress">
                        <div
                          class="profile-achievement-progress-bar"
                          style="width: ${percentage}%"
                        ></div>
                      </div>

                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>

          <p class="profile-awards-note">
            Prêmios:
            ${totals.craque} Craque,
            ${totals.selecao} Seleção,
            ${totals.puskas} Puskas e
            ${totals.bagre} Bagre.
          </p>

          <div class="profile-companions-section">
            <section>

              <div class="profile-section-heading">
                <div>
                  <h3>
                    Companheiros mais frequentes
                  </h3>

                  <p>
                    Jogadores que mais dividiram o time
                  </p>
                </div>
              </div>

              ${
                frequentCompanions.length
                  ? `
                    <ol class="profile-companions-list">
                      ${frequentCompanions
                        .map(
                          (item) => `
                            <li>
                              <strong>
                                ${escapeHtml(
                                  item.name,
                                )}
                              </strong>

                              <span>
                                ${item.count}
                                ${
                                  item.count === 1
                                    ? "vez"
                                    : "vezes"
                                }
                              </span>
                            </li>
                          `,
                        )
                        .join("")}
                    </ol>
                  `
                  : `
                    <p class="profile-empty-note">
                      Ainda não há companheiros registrados.
                    </p>
                  `
              }

            </section>
          </div>

        </div>
      </div>
    `;

    const close = () => {
      modalContainer.innerHTML = "";
    };

    modalContainer
      .querySelector("#profile-modal-close")
      .addEventListener("click", close);

    modalContainer
      .querySelector("#profile-modal-overlay")
      .addEventListener("click", (event) => {
        if (
          event.target.id ===
          "profile-modal-overlay"
        ) {
          close();
        }
      });

    modalContainer
      .querySelector("#save-profile-position")
      ?.addEventListener("click", () => {
        const position =
          modalContainer.querySelector(
            "#profile-position",
          ).value;

        store.updatePlayer(id, {
          favoritePosition: position,
        });

        showToast(
          "Posição favorita atualizada.",
        );

        openPlayerProfileModal(id);
      });

    modalContainer
      .querySelector(".btn-edit-avatar")
      .addEventListener("click", () => {
        openAvatarEditorModal(
          id,
          () => openPlayerProfileModal(id),
        );
      });
  }

  // ============================================================
  // AVATAR EDITOR
  // ============================================================

  function openAvatarEditorModal(
    playerId,
    onDone,
  ) {
    const player = store.getPlayer(playerId);

    if (!player) {
      onDone?.();
      return;
    }

    const workingConfig = {
      ...DEFAULT_AVATAR_CONFIG,
      ...(store.avatars[playerId] || {}),
    };

    let activeGroup = "traits";
    let activeTabKey = AVATAR_TABS[0].key;

    const modalContainer =
      document.getElementById("modal-container");

    function getActiveTab() {
      return activeGroup === "colors"
        ? AVATAR_COLOR_TABS.find(
            (t) => t.key === activeTabKey,
          )
        : AVATAR_TABS.find(
            (t) => t.key === activeTabKey,
          );
    }

    function buildGridHtml() {
      const isColorTab =
        activeGroup === "colors";

      const activeTab = getActiveTab();
      const optionKey = activeTab.key;

      if (isColorTab) {
        return activeTab.colors
          .map((color) => {
            const isSelected =
              workingConfig[optionKey] === color;

            const swatchStyle =
              color === "transparent"
                ? "background: repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 50% / 12px 12px;"
                : `background: #${color};`;

            return `
              <button
                class="avatar-color-swatch ${
                  isSelected ? "selected" : ""
                }"
                data-color="${color}"
                style="${swatchStyle}"
                title="${color}"
              ></button>
            `;
          })
          .join("");
      }

      const optionList =
        activeTab.key === "clothing"
          ? [
              ...activeTab.jerseyOptions.map(
                (opt) => ({
                  ...opt,
                  field: "jersey",
                }),
              ),
              ...activeTab.options.map(
                (opt) => ({
                  ...opt,
                  field: "clothing",
                }),
              ),
            ]
          : (
              activeTab.nullable
                ? [
                    {
                      value: null,
                      label: "Nenhum",
                    },
                    ...activeTab.options,
                  ]
                : activeTab.options
            ).map((opt) => ({
              ...opt,
              field: optionKey,
            }));

      return optionList
        .map((opt) => {
          const isSelected =
            opt.field === "clothing"
              ? !workingConfig.jersey &&
                workingConfig.clothing ===
                  opt.value
              : workingConfig[opt.field] ===
                opt.value;

          const previewConfig =
            opt.field === "clothing"
              ? {
                  ...workingConfig,
                  jersey: null,
                  clothing: opt.value,
                }
              : {
                  ...workingConfig,
                  [opt.field]: opt.value,
                };

          return `
            <button
              class="avatar-option-tile ${
                isSelected ? "selected" : ""
              }"
              data-field="${opt.field}"
              data-value="${
                opt.value ?? "__none__"
              }"
              title="${escapeHtml(opt.label)}"
            >
              <img
                src="${getAvatarDataUri(
                  previewConfig,
                )}"
                alt="${escapeHtml(opt.label)}"
              />
            </button>
          `;
        })
        .join("");
    }

    function bindGridListeners() {
      modalContainer
        .querySelectorAll(".avatar-option-tile")
        .forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const field =
              e.currentTarget.getAttribute(
                "data-field",
              );

            const raw =
              e.currentTarget.getAttribute(
                "data-value",
              );

            const value =
              raw === "__none__"
                ? null
                : raw;

            if (field === "clothing") {
              workingConfig.jersey = null;
            }

            workingConfig[field] = value;

            patchAfterChange();
          });
        });

      modalContainer
        .querySelectorAll(
          ".avatar-color-swatch",
        )
        .forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const optionKey =
              getActiveTab().key;

            if (
              optionKey === "clothesColor"
            ) {
              workingConfig.jersey = null;
            }

            workingConfig[optionKey] =
              e.currentTarget.getAttribute(
                "data-color",
              );

            patchAfterChange();
          });
        });
    }

    function patchAfterChange() {
      modalContainer.querySelector(
        ".avatar-editor-preview img",
      ).src = getAvatarDataUri(
        workingConfig,
      );

      const gridEl =
        modalContainer.querySelector(
          ".avatar-editor-grid",
        );

      gridEl.innerHTML =
        buildGridHtml();

      bindGridListeners();
    }

    function switchTab(group, key) {
      activeGroup = group;
      activeTabKey = key;

      modalContainer
        .querySelectorAll(".avatar-tab-btn")
        .forEach((btn) => {
          const isActive =
            btn.getAttribute("data-group") ===
              activeGroup &&
            btn.getAttribute("data-tab") ===
              activeTabKey;

          btn.classList.toggle(
            "active",
            isActive,
          );
        });

      modalContainer
        .querySelector(
          ".avatar-tab-btn.active",
        )
        ?.scrollIntoView({
          inline: "center",
          block: "nearest",
        });

      const gridEl =
        modalContainer.querySelector(
          ".avatar-editor-grid",
        );

      gridEl.innerHTML =
        buildGridHtml();

      bindGridListeners();
    }

    modalContainer.innerHTML = `
      <div
        class="modal-overlay"
        id="avatar-modal-overlay"
      >
        <div
          class="modal-content avatar-editor-modal"
        >
          <div class="modal-header">

            <h2 class="modal-title">
              🎨 Avatar de
              ${escapeHtml(player.name)}
            </h2>

            <button
              class="modal-close"
              id="avatar-modal-close"
            >
              &times;
            </button>

          </div>

          <div class="avatar-editor-preview">
            <img
              src="${getAvatarDataUri(
                workingConfig,
              )}"
              alt="Pré-visualização do avatar"
            />
          </div>

          <div class="avatar-editor-tabs">
            ${AVATAR_EDITOR_TABS.map(
              (t) => `
                <button
                  class="avatar-tab-btn ${
                    activeGroup === t.group &&
                    activeTabKey === t.key
                      ? "active"
                      : ""
                  }"
                  data-group="${t.group}"
                  data-tab="${t.key}"
                >
                  ${t.label}
                </button>
              `,
            ).join("")}
          </div>

          <div class="avatar-editor-grid">
            ${buildGridHtml()}
          </div>

          <div
            style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;"
          >
            <button
              id="avatar-cancel"
              class="btn btn-secondary"
            >
              Cancelar
            </button>

            <button
              id="avatar-save"
              class="btn btn-primary"
            >
              💾 Salvar Avatar
            </button>
          </div>

        </div>
      </div>
    `;

    const close = () => {
      modalContainer.innerHTML = "";
      onDone?.();
    };

    modalContainer
      .querySelector("#avatar-modal-close")
      .addEventListener(
        "click",
        close,
      );

    modalContainer
      .querySelector("#avatar-modal-overlay")
      .addEventListener("click", (e) => {
        if (
          e.target.id ===
          "avatar-modal-overlay"
        ) {
          close();
        }
      });

    modalContainer
      .querySelector("#avatar-cancel")
      .addEventListener("click", close);

    modalContainer
      .querySelectorAll(".avatar-tab-btn")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          switchTab(
            e.currentTarget.getAttribute(
              "data-group",
            ),
            e.currentTarget.getAttribute(
              "data-tab",
            ),
          );
        });
      });

    modalContainer
      .querySelector("#avatar-save")
      .addEventListener("click", () => {
        store.updatePlayerAvatar(
          playerId,
          workingConfig,
        );

        showToast(
          `🎉 Avatar de ${player.name} atualizado!`,
        );

        close();
      });

    bindGridListeners();
  }

  // ============================================================
  // COMPANHEIROS
  // ============================================================

  function getFrequentCompanions(playerId) {
    const counts = new Map();

    store.history.forEach((entry) => {
      (entry.teams || []).forEach((team) => {
        const playerIds =
          team.playerIds || [];

        if (!playerIds.includes(playerId)) {
          return;
        }

        playerIds.forEach((companionId) => {
          if (companionId === playerId) {
            return;
          }

          counts.set(
            companionId,
            (counts.get(companionId) || 0) + 1,
          );
        });
      });
    });

    return Array.from(counts.entries())
      .map(([companionId, count]) => ({
        name:
          store.getPlayer(companionId)?.name ||
          "Jogador removido",
        count,
      }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 4);
  }

  // ============================================================
  // MÉTRICA DO PERFIL
  // ============================================================

  function profileMetric(
    icon,
    label,
    value,
    tone,
  ) {
    return `
      <div class="profile-metric ${tone}">
        <span class="profile-metric-icon">
          ${icon}
        </span>

        <span class="profile-metric-value">
          ${value}
        </span>

        <span class="profile-metric-label">
          ${label}
        </span>
      </div>
    `;
  }

  render();

  return container;
}

// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}