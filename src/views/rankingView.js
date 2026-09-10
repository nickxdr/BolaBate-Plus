import { store } from "../state/store.js";
import { calculatePointsFromStats } from "../data/seedData.js";
import {
  emptyPlayerStats,
  statsHaveActivity,
} from "../services/periodStats.js";
import { computeCumulativeOVRsAsOf } from "../services/ovr.js";

function capitalizeMonth(str) {
  return str ? String(str).charAt(0).toUpperCase() + String(str).slice(1) : str;
}

// Ranking table sort state — kept at module scope so the chosen ordering
// survives view re-renders (period changes, live updates, tab switches).
// Default: official league table (most points first).
let rankingSortKey = "points"; // 'name' | 'ovr' | 'points' | 'goals' | 'assists' | 'selecao' | 'puskas' | 'craque' | 'bagre' | 'participacao'
let rankingSortDir = "desc";   // 'asc' | 'desc'

export function renderRankingView() {
  const container = document.createElement("div");
  container.className = "view-container";
  // Period selection defaults
  const now = new Date();
  const selKey = store.selectedPeriodKey || store.currentPeriodKey();
  const isAnnual = store.isAnnualSelected();
  const selYear = Number(String(selKey).split("-")[0]) || now.getFullYear();
  const selMonth = isAnnual
    ? "anual"
    : Number(String(selKey).split("-")[1]) || now.getMonth() + 1;

  // Build period selector UI
  const years = store.getAvailableYears();
  const months = store.getMonthsForYear(Number(selYear));

  // Determine current snapshot for selected period (monthly or annual)
  const snapshot = isAnnual
    ? store.getYearSnapshot(selYear)
    : store.getPeriodSnapshot(Number(selYear), Number(selMonth));

  // Calculate sorted rankings from period snapshot (fallback to zeros)
  const periodOvrMap = computeCumulativeOVRsAsOf(store, Number(selYear), Number(selMonth) || 1, isAnnual);
  const rankedPlayers = [...store.players]
    .map((p) => {
      const stats =
        (snapshot && snapshot.players && snapshot.players[p.id]) ||
        emptyPlayerStats();
      return {
        ...p,
        goals: stats.goals || 0,
        assists: stats.assists || 0,
        selecao: stats.selecao || 0,
        puskas: stats.puskas || 0,
        craque: stats.craque || 0,
        bagre: stats.bagre || 0,
        participacao: stats.participacao || 0,
        totalPoints: calculatePointsFromStats(stats),
        ovr: periodOvrMap[p.id] || 0,
      };
    })
    .filter((p) => statsHaveActivity(p))
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.craque !== a.craque) return b.craque - a.craque;
      return b.assists - a.assists;
    });

  // The rows shown in the table can be re-ordered by clicking any column
  // header (Gols, Assists, Bagre, ...). "rankedPlayers" above always stays in
  // official league order so the WhatsApp share/leader still reflect the real
  // table; "tablePlayers" is the display copy the user can reorder. Each player
  // keeps their official position + G4/Z4 badge — only the row order changes.
  let tablePlayers = [...rankedPlayers];

  function applySort() {
    tablePlayers.sort((a, b) => {
      let result =
        rankingSortKey === "name"
          ? a.name.localeCompare(b.name)
          : Number(b[rankingSortKey] || 0) - Number(a[rankingSortKey] || 0);
      if (result === 0) {
        // Deterministic tie-break: points desc, then name A-Z
        if (b.totalPoints !== a.totalPoints) result = b.totalPoints - a.totalPoints;
        else result = a.name.localeCompare(b.name);
      }
      return rankingSortDir === "asc" ? -result : result;
    });
  }
  applySort();

  const totalPlayers = rankedPlayers.length;
  // G4 is first 4, Z4 is bottom 4 (or less if few players)
  const g4Limit = 4;
  const z4StartIndex = Math.max(4, totalPlayers - 4);

  container.innerHTML = `
    <div class="ranking-header">
      <div>
        <h1 class="ranking-title">
          🏆 Tabela da Liga
          <button id="btn-share-whatsapp" class="ranking-share-icon-btn" title="Copiar ranking formatado para WhatsApp" aria-label="Compartilhar ranking">
            📤
          </button>
        </h1>
        <p style="color: var(--text-muted); font-size: 0.85rem;">
          Escolha o mês (ou Anual) e o ano para ver a tabela do período.
        </p>
      </div>
      <div class="ranking-header-controls">
        <div class="ranking-period-group">
          <div class="ranking-period-field">
            <label style="font-size:0.85rem; color:var(--text-muted);">Ano: </label>
            <select id="period-year" class="input-field ranking-period-select">
              ${years.map((y) => `<option value="${y}" ${String(y) === String(selYear) ? "selected" : ""}>${y}</option>`).join("")}
            </select>
          </div>
          <div class="ranking-period-field">
            <label style="font-size:0.85rem; color:var(--text-muted);">Mês: </label>
            <select id="period-month" class="input-field ranking-period-select">
              <option value="anual" ${isAnnual ? "selected" : ""}>Anual</option>
              ${months.map((m) => `<option value="${m}" ${!isAnnual && Number(m) === Number(selMonth) ? "selected" : ""}>${capitalizeMonth(new Date(0, m - 1).toLocaleString("pt-BR", { month: "long" }))}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- Table Container -->
    ${
      rankedPlayers.length === 0
        ? `
      <div class="card" style="text-align:center; padding: 36px 16px;">
        <div style="font-size: 2rem; margin-bottom: 8px;">📅</div>
        <h2 style="font-size: 1.05rem; margin-bottom: 6px;">Nenhuma estatística neste período</h2>
        <p style="color: var(--text-muted); font-size: 0.88rem;">
          Encerre uma pelada ou escolha outro período para ver a tabela.
        </p>
      </div>
    `
        : `
    <div class="table-responsive">
      <table class="ranking-table">
        <thead><tr></tr></thead>
        <tbody id="ranking-tbody"></tbody>
      </table>
    </div>
    `
    }
  `;

  // --- Column sorting: click any header to reorder the table by that stat ---
  function sortArrow(key) {
    if (key !== rankingSortKey) return '<span class="sort-arrow" aria-hidden="true">↕</span>';
    return rankingSortDir === "asc"
      ? '<span class="sort-arrow" aria-hidden="true">▲</span>'
      : '<span class="sort-arrow" aria-hidden="true">▼</span>';
  }

  function renderHeadRowHtml() {
    const thClass = (key) => `sortable-th ${rankingSortKey === key ? "sort-active" : ""}`;
    return `
      <tr>
        <th style="width: 50px;">Pos</th>
        <th style="text-align: left; padding-left: 14px;" class="${thClass("name")}" data-sort="name" title="Ordenar por nome (A-Z)">Jogador ${sortArrow("name")}</th>
        <th class="${thClass("ovr")}" data-sort="ovr" title="Ordenar por OVR">OVR ${sortArrow("ovr")}</th>
        <th style="color: var(--pitch-green);" class="${thClass("points")}" data-sort="points" title="Ordenar por pontos">Pontos ${sortArrow("points")}</th>
        <th class="${thClass("goals")}" data-sort="goals" title="Ordenar por gols">Gols (+3) ${sortArrow("goals")}</th>
        <th class="${thClass("assists")}" data-sort="assists" title="Ordenar por assistências">Assists (+2) ${sortArrow("assists")}</th>
        <th class="${thClass("selecao")}" data-sort="selecao" title="Ordenar por seleção">Seleção (+4) ${sortArrow("selecao")}</th>
        <th class="${thClass("puskas")}" data-sort="puskas" title="Ordenar por puskas">Puskas (+3) ${sortArrow("puskas")}</th>
        <th class="${thClass("craque")}" data-sort="craque" title="Ordenar por craques">Craque (+5) ${sortArrow("craque")}</th>
        <th class="${thClass("bagre")}" data-sort="bagre" title="Ordenar por bagres">Bagre (-3) ${sortArrow("bagre")}</th>
        <th class="${thClass("participacao")}" data-sort="participacao" title="Ordenar por participações">Part. (+1) ${sortArrow("participacao")}</th>
        ${isAnnual ? "" : '<th style="width: 40px;">Ação</th>'}
      </tr>
    `;
  }

  function renderRowsHtml() {
    // Official position map: each player keeps the position (and G4/Z4 badge)
    // of the real points table no matter which column the user re-orders by.
    const officialPosById = new Map();
    rankedPlayers.forEach((p, i) => officialPosById.set(p.id, i + 1));

    return tablePlayers
      .map((player) => {
        const pos = officialPosById.get(player.id) || rankedPlayers.length;
        const isTop1 = pos === 1;
        const isG4 = pos <= g4Limit;
        const isZ4 = pos > z4StartIndex;

        let rowClass = "";
        if (isTop1) rowClass = "top-1";
        else if (isG4) rowClass = "in-g4";
        else if (isZ4) rowClass = "in-z4";

        let actionCell = "<td></td>";
        if (store.isAdmin && !isAnnual) {
          actionCell = `<td>
            <button class="btn btn-secondary btn-sm edit-player-stat-btn" data-id="${player.id}" style="padding: 3px 7px;" title="Editar dados">✏️</button>
          </td>`;
        }

        return `
      <tr class="${rowClass}">
        <td style="font-weight: 800;">${isTop1 ? "1º" : pos + "º"}</td>
        <td class="player-name-cell">
          <span style="font-weight: 700;">${escapeHtml(player.name)}</span>
          <span class="star-badge" style="font-size: 0.72rem; padding: 1px 6px; margin-left: 6px;">${player.stars.toFixed(1)}★</span>
          ${isG4 ? '<span style="font-size: 0.68rem; background: var(--g4-bg); color: var(--g4-text); padding: 1px 5px; border-radius: 4px; margin-left: 4px; font-weight: 800;">G4</span>' : ""}
          ${isZ4 ? '<span style="font-size: 0.68rem; background: var(--z4-bg); color: var(--z4-text); padding: 1px 5px; border-radius: 4px; margin-left: 4px; font-weight: 800;">Z4</span>' : ""}
        </td>
        <td><span class="star-badge" style="font-size: 0.72rem; padding: 1px 6px;">${player.ovr}</span></td>
        <td class="points-cell" style="font-size: 1.1rem; font-weight: 900;">${player.totalPoints}</td>
        <td>${player.goals}</td>
        <td>${player.assists}</td>
        <td>${player.selecao}</td>
        <td>${player.puskas}</td>
        <td>${player.craque}</td>
        <td>${player.bagre}</td>
        <td>${player.participacao}</td>
        ${actionCell}
      </tr>
    `;
      })
      .join("");
  }

  function refreshTable() {
    const table = container.querySelector(".ranking-table");
    if (!table) return;

    const headRow = table.querySelector("thead tr");
    if (headRow) headRow.innerHTML = renderHeadRowHtml();

    const tbody = table.querySelector("#ranking-tbody");
    if (tbody) {
      tbody.innerHTML = renderRowsHtml();
      container.querySelectorAll(".edit-player-stat-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const pid = e.currentTarget.getAttribute("data-id");
          openEditPlayerModal(pid);
        });
      });
    }
  }

  function setSort(key) {
    if (key === rankingSortKey) {
      rankingSortDir = rankingSortDir === "asc" ? "desc" : "asc";
    } else {
      rankingSortKey = key;
      rankingSortDir = key === "name" ? "asc" : "desc";
    }
    applySort();
    refreshTable();
  }

  // Event delegation: the listener lives on the <table> element, so it keeps
  // working after header cells are re-created by refreshTable().
  const table = container.querySelector(".ranking-table");
  if (table) {
    table.addEventListener("click", (e) => {
      const th = e.target.closest?.("th[data-sort]");
      if (!th) return;
      setSort(th.getAttribute("data-sort"));
    });
  }

  refreshTable();

  // Attach event handlers
  const yearSelect = container.querySelector("#period-year");
  const monthSelect = container.querySelector("#period-month");
  function onPeriodChange() {
    const y = Number(yearSelect.value);
    const m =
      monthSelect.value === "anual" ? "anual" : Number(monthSelect.value);
    store.setSelectedPeriod(y, m);
  }
  yearSelect.addEventListener("change", onPeriodChange);
  monthSelect.addEventListener("change", onPeriodChange);

  container
    .querySelector("#btn-share-whatsapp")
    .addEventListener("click", () => {
      const shareLabel = isAnnual
        ? `Anual • ${selYear}`
        : capitalizeMonth(
            new Date(Number(selYear), Number(selMonth) - 1).toLocaleString(
              "pt-BR",
              { month: "long", year: "numeric" },
            ),
          );
      shareRankingWhatsApp(rankedPlayers, shareLabel);
    });

  return container;
}

function shareRankingWhatsApp(rankedPlayers, periodLabel = "") {
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
      let badge = "";
      if (pos === 1) badge = "👑";
      else if (pos <= 4) badge = "🟢 G4";
      else if (pos > rankedPlayers.length - 4) badge = "🔴 Z4";

      text += `${pos}º ${p.name} - ${p.totalPoints} pts (⚽ ${p.goals} | 👟 ${p.assists} | ⭐ ${p.craque} | 🐟 ${p.bagre}) ${badge}\n`;
    });

    text += `\n_Gerado por BolaBate+ ⚽🔥_`;
  }

  navigator.clipboard
    .writeText(text)
    .then(() => {
      showToast("Tabela copiada para o WhatsApp! Cole no grupo.");
    })
    .catch(() => {
      // Fallback if clipboard blocked
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      showToast("Tabela copiada para a área de transferência!");
    });
}

function openEditPlayerModal(playerId) {
  const player = store.getPlayer(playerId);
  if (!player) return;
  const stats = store.getPeriodPlayerStats(playerId);

  const modalContainer = document.getElementById("modal-container");
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

  const overlay = modalContainer.querySelector("#edit-player-overlay");
  const close = () => {
    modalContainer.innerHTML = "";
  };

  modalContainer
    .querySelector("#modal-close-btn")
    .addEventListener("click", close);
  modalContainer
    .querySelector("#modal-cancel-btn")
    .addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  modalContainer
    .querySelector("#edit-player-stats-form")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      store.updatePlayer(playerId, {
        goals: formData.get("goals"),
        assists: formData.get("assists"),
        craque: formData.get("craque"),
        selecao: formData.get("selecao"),
        puskas: formData.get("puskas"),
        bagre: formData.get("bagre"),
        participacao: formData.get("participacao"),
      });
      close();
      showToast(`Dados de ${player.name} atualizados!`);
    });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function showToast(message) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span>⚽</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translate(-50%, -20px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}
