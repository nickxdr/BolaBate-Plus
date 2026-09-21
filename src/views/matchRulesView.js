import {
  store,
  MIN_MATCH_DURATION_MIN,
  MAX_MATCH_DURATION_MIN,
  MIN_GOALS_TO_FINISH,
  MAX_GOALS_TO_FINISH,
  MIN_WIN_STREAK_TO_REST,
  MAX_WIN_STREAK_TO_REST,
} from "../state/store.js";
import { showToast } from "./rankingView.js";

const DEFAULT_MINUTES = 10;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Milliseconds -> whole minutes for display, tolerating a missing/legacy value. */
function toMinutes(ms) {
  return clamp(
    Math.round((Number(ms) || DEFAULT_MINUTES * 60000) / 60000),
    MIN_MATCH_DURATION_MIN,
    MAX_MATCH_DURATION_MIN,
  );
}

/** Shared markup for the compact − value + controls used by the numeric rules. */
function stepperMarkup(idPrefix, value, min, max) {
  return `
    <div class="rule-stepper">
      <button type="button" class="rule-step-btn" id="${idPrefix}-minus" aria-label="Diminuir" ${value <= min ? "disabled" : ""}>−</button>
      <span class="rule-step-value" id="${idPrefix}-value">${value}</span>
      <button type="button" class="rule-step-btn" id="${idPrefix}-plus" aria-label="Aumentar" ${value >= max ? "disabled" : ""}>+</button>
    </div>
  `;
}

/**
 * "Regras da Partida" screen — the destination the Ajustes tab's shortcut button
 * redirects to. Lets the admin tune the league-wide match rules (duration, goal target,
 * winner-stays rotation and win-streak limit); regular players get a read-only summary.
 * It's a sub-screen rather than its own bottom-nav item, so it offers a back button.
 */
export function renderMatchRulesView(navigateTo) {
  const container = document.createElement("div");
  container.className = "view-container";

  function render() {
    const canEdit = store.isAdmin;
    const currentMinutes = toMinutes(store.matchDurationMs);

    container.innerHTML = `
      <button id="btn-rules-back" class="btn btn-secondary btn-sm" style="margin-bottom: 14px;">
        ← Voltar aos Ajustes
      </button>

      <div style="margin-bottom: 20px;">
        <h1 style="font-size: 1.6rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
          ⚽ Regras da Partida
        </h1>
        <p style="color: var(--text-muted); font-size: 0.85rem;">
          Ajuste como as partidas funcionam. As regras valem para toda a pelada e são sincronizadas entre os dispositivos.
        </p>
      </div>

      ${
        canEdit
          ? `
      <!-- Duration -->
      <div class="card">
        <h2 class="rule-section-title">⏱️ Definir duração da partida</h2>
        <p class="rule-section-desc">
          Quanto tempo cada partida deve durar. O cronômetro do campinho ao vivo usa esse valor.
        </p>

        <div class="duration-input-row">
          <button type="button" class="duration-step-btn" id="btn-duration-minus" aria-label="Diminuir duração">−</button>
          <div class="duration-input-wrap">
            <input
              id="match-duration-custom"
              type="number"
              inputmode="numeric"
              min="${MIN_MATCH_DURATION_MIN}"
              max="${MAX_MATCH_DURATION_MIN}"
              step="1"
              value="${currentMinutes}"
              aria-label="Duração da partida em minutos"
            />
            <span class="duration-input-unit">min</span>
          </div>
          <button type="button" class="duration-step-btn" id="btn-duration-plus" aria-label="Aumentar duração">+</button>
        </div>

        <p class="duration-range-hint">Valor entre ${MIN_MATCH_DURATION_MIN} e ${MAX_MATCH_DURATION_MIN} minutos</p>

        <button id="btn-save-match-duration" class="btn btn-primary duration-save-btn">💾 Salvar duração</button>
      </div>

      <!-- Rotation & score rules -->
      <div class="card">
        <h2 class="rule-section-title">🏁 Regras de placar e rodízio</h2>

        <div class="rule-row">
          <div class="rule-row-info">
            <div class="rule-row-title">🥅 Limite de gols</div>
            <div class="rule-row-desc">Se desligado, a partida só termina quando o tempo chegar a 0.</div>
          </div>
          <button
            type="button"
            class="rule-toggle ${store.goalLimitEnabled ? "on" : ""}"
            id="toggle-goal-limit"
            role="switch"
            aria-checked="${store.goalLimitEnabled ? "true" : "false"}"
            aria-label="Limite de gols"
          >
            <span class="rule-toggle-knob"></span>
          </button>
        </div>

        <div class="rule-row ${store.goalLimitEnabled ? "" : "disabled"}">
          <div class="rule-row-info">
            <div class="rule-row-title">🥅 Gols para finalizar</div>
            <div class="rule-row-desc">Quantos gols um time precisa fazer para a partida poder acabar antes do tempo.</div>
          </div>
          ${stepperMarkup("goals", store.goalsToFinish, MIN_GOALS_TO_FINISH, MAX_GOALS_TO_FINISH)}
        </div>

        <div class="rule-row">
          <div class="rule-row-info">
            <div class="rule-row-title">🔥 Limite de vitórias</div>
            <div class="rule-row-desc">Time vencedor continua em campo até ser derrotado.</div>
          </div>
          <button
            type="button"
            class="rule-toggle ${store.winLimitEnabled ? "on" : ""}"
            id="toggle-win-limit"
            role="switch"
            aria-checked="${store.winLimitEnabled ? "true" : "false"}"
            aria-label="Limite de vitórias"
          >
            <span class="rule-toggle-knob"></span>
          </button>
        </div>

        <div class="rule-row ${store.winLimitEnabled ? "" : "disabled"}">
          <div class="rule-row-info">
            <div class="rule-row-title">🔥 Vitórias seguidas para descansar</div>
            <div class="rule-row-desc">Depois de quantas vitórias seguidas o time vencedor sai para descansar.</div>
          </div>
          ${stepperMarkup("streak", store.winStreakToRest, MIN_WIN_STREAK_TO_REST, MAX_WIN_STREAK_TO_REST)}
        </div>

        <p class="rule-footnote">
          ℹ️ As regras de placar e rodízio passam a valer imediatamente, inclusive para a partida em andamento.
        </p>
      </div>
      `
          : `
      <div class="card">
        <h2 class="rule-section-title">📋 Regras atuais</h2>
        <div class="rules-summary">
          <div class="rules-summary-row"><span>⏱️ Duração da partida</span><strong>${currentMinutes} min</strong></div>
          <div class="rules-summary-row"><span>🥅 Limite de gols</span><strong>${store.goalLimitEnabled ? `Até ${store.goalsToFinish} gol(s)` : "Só quando o tempo zerar"}</strong></div>
          <div class="rules-summary-row"><span>🔥 Limite de vitórias</span><strong>${store.winLimitEnabled ? `Após ${store.winStreakToRest} vitória(s)` : "Até perder"}</strong></div>
          <div class="rules-summary-row"><span>🔥 Vitórias seguidas para descansar</span><strong>${store.winStreakToRest}</strong></div>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 14px; text-align: center;">
          🔒 Apenas o administrador pode alterar as regras da partida.
        </p>
      </div>
      `
      }
    `;

    const backBtn = container.querySelector("#btn-rules-back");
    if (typeof navigateTo === "function") {
      backBtn.addEventListener("click", () => navigateTo("settings"));
    } else {
      backBtn.style.display = "none";
    }

    if (!canEdit) return;

    /** Runs an admin setter, toasts the result and re-renders the screen. */
    function commit(result, successMessage) {
      if (result?.success) {
        showToast(successMessage);
      } else if (result?.error) {
        showToast("❌ " + result.error);
      }
      render();
    }

    // --- Duration -----------------------------------------------------------
    const customInput = container.querySelector("#match-duration-custom");
    const saveBtn = container.querySelector("#btn-save-match-duration");
    const durationMinusBtn = container.querySelector("#btn-duration-minus");
    const durationPlusBtn = container.querySelector("#btn-duration-plus");

    function syncDurationButtons() {
      const value = Number(customInput.value);
      durationMinusBtn.disabled = Number.isFinite(value) && value <= MIN_MATCH_DURATION_MIN;
      durationPlusBtn.disabled = Number.isFinite(value) && value >= MAX_MATCH_DURATION_MIN;
    }

    function stepDuration(delta) {
      const current = Number(customInput.value);
      const base = Number.isFinite(current) && current > 0 ? current : DEFAULT_MINUTES;
      customInput.value = String(
        clamp(Math.round(base) + delta, MIN_MATCH_DURATION_MIN, MAX_MATCH_DURATION_MIN),
      );
      syncDurationButtons();
    }

    function saveDuration() {
      const value = Number(customInput.value);
      if (!Number.isFinite(value) || value < MIN_MATCH_DURATION_MIN || value > MAX_MATCH_DURATION_MIN) {
        showToast(
          `⚠️ Escolha um valor entre ${MIN_MATCH_DURATION_MIN} e ${MAX_MATCH_DURATION_MIN} minutos.`,
        );
        return;
      }
      const minutes = Math.round(value);
      commit(store.setMatchDuration(minutes), `⏱️ Duração alterada para ${minutes} min!`);
    }

    durationMinusBtn.addEventListener("click", () => stepDuration(-1));
    durationPlusBtn.addEventListener("click", () => stepDuration(1));
    customInput.addEventListener("input", syncDurationButtons);
    saveBtn.addEventListener("click", saveDuration);
    customInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveDuration();
      }
    });
    syncDurationButtons();

    // --- Numeric rule steppers ----------------------------------------------
    /** Binds a compact −/+ stepper to a store rule setter. */
    function bindStepper(idPrefix, min, max, getValue, apply, successMessage) {
      const minusBtn = container.querySelector(`#${idPrefix}-minus`);
      const plusBtn = container.querySelector(`#${idPrefix}-plus`);

      function change(delta) {
        const next = clamp(getValue() + delta, min, max);
        if (next === getValue()) return;
        commit(apply(next), successMessage(next));
      }

      minusBtn.addEventListener("click", () => change(-1));
      plusBtn.addEventListener("click", () => change(1));
    }

    // Only meaningful while the goal limit is on — the row is dimmed otherwise.
    if (store.goalLimitEnabled) {
      bindStepper(
        "goals",
        MIN_GOALS_TO_FINISH,
        MAX_GOALS_TO_FINISH,
        () => store.goalsToFinish,
        (value) => store.setGoalsToFinish(value),
        (value) => `🥅 A partida pode acabar com ${value} gol(s).`,
      );
    }

    // Only meaningful while the win limit is on — the row is dimmed otherwise.
    if (store.winLimitEnabled) {
      bindStepper(
        "streak",
        MIN_WIN_STREAK_TO_REST,
        MAX_WIN_STREAK_TO_REST,
        () => store.winStreakToRest,
        (value) => store.setWinStreakToRest(value),
        (value) => `🔥 Time vencedor descansa após ${value} vitória(s).`,
      );
    }

    // --- Goal-limit toggle --------------------------------------------------
    const goalLimitToggle = container.querySelector("#toggle-goal-limit");
    goalLimitToggle.addEventListener("click", () => {
      const next = !store.goalLimitEnabled;
      commit(
        store.setGoalLimitEnabled(next),
        next
          ? `🥅 Limite de gols ativado: a partida pode acabar com ${store.goalsToFinish} gol(s).`
          : "🥅 Limite de gols removido: a partida só termina quando o tempo zerar.",
      );
    });

    // --- Win-limit toggle ---------------------------------------------------
    const winLimitToggle = container.querySelector("#toggle-win-limit");
    winLimitToggle.addEventListener("click", () => {
      const next = !store.winLimitEnabled;
      commit(
        store.setWinLimitEnabled(next),
        next
          ? `🔥 Limite de vitórias ativado: o vencedor descansa após ${store.winStreakToRest} vitória(s).`
          : "🔥 Time vencedor continua em campo até ser derrotado.",
      );
    });
  }

  render();
  return container;
}
