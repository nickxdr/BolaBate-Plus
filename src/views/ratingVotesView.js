import { store } from "../state/store.js";
import { showToast } from "./rankingView.js";
import { auth } from "../services/firebase.js";

const MONTH_NAMES_PT = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function monthLabel(key) {
  const [y, m] = String(key || "").split("-").map(Number);
  if (!y || !m) return String(key || "");
  return `${MONTH_NAMES_PT[m] || m}/${y}`;
}

export function currentVoter() {
  const u = auth?.currentUser || null;
  return { uid: u?.uid || "", email: u?.email || "" };
}

export function choiceLabel(c) {
  return c === "up" ? "aumentar" : c === "down" ? "diminuir" : "manter";
}

export function escapeVoteHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeSuggestions(cycleKey) {
  try {
    return store.suggestRatingCandidates(cycleKey);
  } catch (e) {
    return { monthKey: cycleKey, baseKey: cycleKey, up: [], down: [] };
  }
}

function renderSuggestionChip(c) {
  return `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-secondary);">
      <div style="min-width: 0;">
        <div style="font-size: 0.83rem; font-weight: 700;">${escapeVoteHtml(c.name)} <span style="color:#F59E0B;">${Number(c.stars).toFixed(1)}★</span></div>
        <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeVoteHtml(c.reason)}</div>
      </div>
      <button class="btn btn-secondary btn-sm btn-suggest-proposal"
        data-player-id="${c.playerId}" data-direction="${c.direction}" data-reason="${escapeVoteHtml(c.reason)}">
        ${c.direction === "down" ? "📉 Propor −" : "📈 Propor +"}
      </button>
    </div>`;
}

function renderSuggestionsBlock(s) {
  const hasAny = (s.up?.length || 0) + (s.down?.length || 0) > 0;
  if (!hasAny) return "";
  return `
    <div style="margin-bottom: 12px; padding: 10px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-card-subtle);">
      <div style="font-size: 0.78rem; font-weight: 800; color: var(--text-muted); margin-bottom: 8px;">
        ✨ SUGESTÕES AUTOMÁTICAS (base: ${escapeVoteHtml(s.baseKey || "")})
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px;">
        ${(s.up || []).map(renderSuggestionChip).join("")}
        ${(s.down || []).map(renderSuggestionChip).join("")}
      </div>
    </div>`;
}

function renderProposalCard(p) {
  const player = store.getPlayer(p.playerId);
  const name = player?.name || "Jogador removido";
  const stars = player ? Number(player.stars).toFixed(1) : "—";
  const tally = store.tallyRatingProposal(p);
  const total = Math.max(1, tally.total);
  const pct = (n) => Math.round((n / total) * 100);
  const statusBadge = {
    open: `<span style="color: var(--accent-gold);">🟡 aberta</span>`,
    approved: `<span style="color: var(--pitch-green);">🟢 aprovada (${choiceLabel(p.decidedChoice)})</span>`,
    rejected: `<span style="color: var(--text-dim);">⚪ arquivada (manter)</span>`,
    applied: `<span style="color: var(--accent-blue);">✅ aplicada (${p.appliedDelta > 0 ? "+" : ""}${Number(p.appliedDelta).toFixed(1)})</span>`,
  }[p.status] || p.status;
  const myUid = String(auth?.currentUser?.uid || auth?.currentUser?.email || "admin");
  const myVote = p.votes?.[myUid]?.choice || null;
  const dirIcon = p.direction === "down" ? "📉 diminuir" : "📈 aumentar";
  const done = p.status === "applied" || p.status === "rejected";
  const bars = ["up", "keep", "down"].map((c) => `
    <div style="flex: 1; text-align: center; background: var(--bg-app); border-radius: 8px; padding: 4px 2px; border: 1px solid ${myVote === c ? "var(--pitch-green)" : "var(--border-color)"};">
      <div style="font-size: 0.68rem; color: var(--text-muted);">${choiceLabel(c)}</div>
      <div style="font-size: 0.95rem; font-weight: 800;">${tally[c]}</div>
      <div style="height: 4px; border-radius: 2px; background: var(--border-color); margin-top: 3px;">
        <div style="height: 100%; width: ${pct(tally[c])}%; border-radius: 2px; background: ${c === "up" ? "var(--pitch-green)" : c === "down" ? "var(--accent-red)" : "var(--text-dim)"};"></div>
      </div>
    </div>`).join("");
  const actions = done
    ? `<span style="font-size: 0.75rem; color: var(--text-dim);">Votação encerrada p/ esta proposta.</span>`
    : `<button class="btn ${myVote === "up" ? "btn-primary" : "btn-secondary"} btn-sm btn-cast-vote" data-id="${p.id}" data-choice="up">👍 Aumentar</button>
      <button class="btn ${myVote === "keep" ? "btn-primary" : "btn-secondary"} btn-sm btn-cast-vote" data-id="${p.id}" data-choice="keep">✋ Manter</button>
      <button class="btn ${myVote === "down" ? "btn-primary" : "btn-secondary"} btn-sm btn-cast-vote" data-id="${p.id}" data-choice="down">👎 Diminuir</button>
      <span style="flex: 1;"></span>
      ${p.status === "approved"
        ? `<button class="btn btn-primary btn-sm btn-apply-proposal" data-id="${p.id}">⚡ Aplicar ${p.decidedChoice === "down" ? "−0,5" : "+0,5"}</button>`
        : `<button class="btn btn-secondary btn-sm btn-close-proposal" data-id="${p.id}">🏁 Apurar</button>`}`;
  return `
    <div data-proposal-id="${p.id}" style="border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; background: var(--bg-secondary);">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
        <div style="min-width: 0;">
          <div style="font-size: 0.92rem; font-weight: 800;">
            ${escapeVoteHtml(name)} <span style="color:#F59E0B;">${stars}★</span>
            <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted);">· ${dirIcon}</span>
          </div>
          ${p.reason ? `<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">💬 ${escapeVoteHtml(p.reason)}</div>` : ""}
          <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 2px;">
            ${statusBadge}
            ${p.suggestedByEmail ? ` · por ${escapeVoteHtml(p.suggestedByEmail)}` : ""}
            ${tally.tie && tally.total > 0 ? ` · <strong>empate</strong>` : tally.winner ? ` · vencendo: <strong>${choiceLabel(tally.winner)}</strong>` : ""}
          </div>
        </div>
        <button class="btn btn-secondary btn-sm btn-delete-proposal" data-id="${p.id}" style="color: var(--accent-red);">🗑️</button>
      </div>
      <div style="display: flex; gap: 6px; margin-top: 8px;">${bars}</div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; align-items: center;">${actions}</div>
    </div>`;
}

export function renderRatingVotesSection() {
  if (!store.isAdmin) return "";
  const cycleKey = store.currentPeriodKey();
  const cycle = store.getCurrentRatingCycle();
  const proposals = [...(cycle?.proposals || [])].sort(
    (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );
  const openCount = proposals.filter((p) => p.status === "open").length;
  const suggestions = safeSuggestions(cycleKey);
  const historyKeys = Object.keys(store.ratingVotes || {})
    .filter((k) => k !== cycleKey).sort().reverse().slice(0, 3);
  let historyHtml = "";
  if (historyKeys.length) {
    const blocks = historyKeys.map((k) => {
      const c = store.getRatingCycle(k);
      const list = (c?.proposals || []);
      const rows = list.length === 0
        ? `<div style="font-size: 0.75rem; color: var(--text-dim);">Sem propostas.</div>`
        : list.map((p) => {
          const nm = store.getPlayer(p.playerId)?.name || "Jogador removido";
          const t = store.tallyRatingProposal(p);
          return `<div style="font-size: 0.76rem; color: var(--text-muted);">• ${escapeVoteHtml(nm)} (${p.direction === "down" ? "−" : "+"}) — ${p.status} · 👍${t.up} ✋${t.keep} 👎${t.down}</div>`;
        }).join("");
      return `<div style="border: 1px solid var(--border-color); border-radius: 10px; padding: 8px 10px;">
        <div style="font-size: 0.8rem; font-weight: 800;">${escapeVoteHtml(monthLabel(k))} · ${list.length} proposta(s)${c?.status === "closed" ? " · encerrado" : ""}</div>${rows}</div>`;
    }).join("");
    historyHtml = `<details style="margin-top: 12px;">
      <summary style="font-size: 0.82rem; font-weight: 700; color: var(--text-muted); cursor: pointer;">📚 Meses anteriores (${historyKeys.length})</summary>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">${blocks}</div>
    </details>`;
  }
  const listHtml = proposals.length === 0
    ? `<div style="font-size: 0.85rem; color: var(--text-dim); padding: 10px; text-align: center; border: 1px dashed var(--border-color); border-radius: 10px;">Nenhuma proposta neste mês. Crie a primeira acima. 👆</div>`
    : proposals.map(renderProposalCard).join("");
  const cycleBtn = cycle?.status === "closed"
    ? `<button class="btn btn-secondary btn-sm" id="btn-reopen-rating-cycle">🔓 Reabrir mês</button>`
    : `<button class="btn btn-secondary btn-sm" id="btn-close-rating-cycle" ${proposals.length === 0 ? "disabled" : ""}>🏁 Encerrar mês</button>`;
  return `
    <div class="card" id="rating-votes-card" style="margin-bottom: 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 6px;">
        <h2 style="font-size: 1.1rem; font-weight: 800; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          🗳️ Votação mensal das notas
          <span style="font-size: 0.72rem; font-weight: 700; background: var(--accent-gold-bg); color: var(--accent-gold); border: 1px solid rgba(245,158,11,.4); padding: 2px 8px; border-radius: 10px;">
            ${escapeVoteHtml(monthLabel(cycleKey))} · ${openCount} aberta(s)
          </span>
        </h2>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-primary btn-sm" id="btn-new-rating-proposal">➕ Nova proposta</button>
          ${cycleBtn}
        </div>
      </div>
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
        🔒 Apenas administradores. Cada proposta sugere <strong>aumentar (+0,5)</strong> ou
        <strong>diminuir (−0,5)</strong> a nota de <strong>um jogador</strong>. Cada admin vota
        <strong>aumentar / manter / diminuir</strong> — vence a maioria; empate ou vitória do
        "manter" = nota inalterada. Propostas aprovadas precisam ser <strong>aplicadas</strong>.
      </p>
      ${renderSuggestionsBlock(suggestions)}
      <div style="display: flex; flex-direction: column; gap: 10px;">${listHtml}</div>
      ${historyHtml}
    </div>`;
}



export function bindRatingVotesSection(container, rerender) {
  if (!store.isAdmin) return;
  const card = container.querySelector("#rating-votes-card");
  if (!card) return;
  card.querySelector("#btn-new-rating-proposal")?.addEventListener("click", () => {
    openCreateRatingProposalModal(() => rerender?.());
  });
  card.querySelectorAll(".btn-suggest-proposal").forEach((btn) => {
    btn.addEventListener("click", () => {
      const res = store.createRatingProposal(
        btn.getAttribute("data-player-id"), btn.getAttribute("data-direction"),
        btn.getAttribute("data-reason"), currentVoter());
      showToast(res.success ? "📋 Proposta criada! Vote abaixo." : "⚠️ " + res.error);
      rerender?.();
    });
  });
  card.querySelectorAll(".btn-cast-vote").forEach((btn) => {
    btn.addEventListener("click", () => {
      const res = store.castRatingVote(btn.getAttribute("data-id"), btn.getAttribute("data-choice"), currentVoter());
      if (!res.success) showToast("⚠️ " + res.error);
      rerender?.();
    });
  });
  card.querySelectorAll(".btn-close-proposal").forEach((btn) => {
    btn.addEventListener("click", () => {
      const res = store.closeRatingProposal(btn.getAttribute("data-id"));
      if (!res.success) { showToast("⚠️ " + res.error); return; }
      showToast(res.result === "approved" ? "🟢 Aprovada! Clique em Aplicar." : "⚪ Arquivada (manter/empate).");
      rerender?.();
    });
  });
  card.querySelectorAll(".btn-apply-proposal").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const found = store.findRatingProposal(id);
      const nm = found ? store.getPlayer(found.proposal.playerId)?.name : "?";
      if (!confirm(`Aplicar a mudança de nota de "${nm}"?`)) return;
      const res = store.applyRatingProposal(id);
      showToast(res.success ? `⭐ ${nm}: ${Number(res.before).toFixed(1)} → ${Number(res.after).toFixed(1)}` : "⚠️ " + res.error);
      rerender?.();
    });
  });
  card.querySelectorAll(".btn-delete-proposal").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("Excluir esta proposta?")) return;
      const res = store.deleteRatingProposal(btn.getAttribute("data-id"));
      if (!res.success) showToast("⚠️ " + res.error);
      rerender?.();
    });
  });
  card.querySelector("#btn-close-rating-cycle")?.addEventListener("click", () => {
    if (!confirm("Encerrar a votação deste mês? As propostas abertas serão apuradas.")) return;
    store.closeRatingCycle();
    showToast("🏁 Votação do mês encerrada.");
    rerender?.();
  });
  card.querySelector("#btn-reopen-rating-cycle")?.addEventListener("click", () => {
    store.reopenRatingCycle();
    showToast("🔓 Votação do mês reaberta.");
    rerender?.();
  });
}



export function openCreateRatingProposalModal(onDone) {
  if (!store.isAdmin) { showToast("🔒 Apenas o administrador pode criar propostas."); return; }
  const modalContainer = document.getElementById("modal-container");
  const cycle = store.getCurrentRatingCycle();
  const taken = new Set((cycle?.proposals || []).filter((p) => p.status !== "rejected").map((p) => p.playerId));
  const options = [...store.players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
    const dis = taken.has(p.id) ? "disabled" : "";
    return `<option value="${p.id}" ${dis}>${escapeVoteHtml(p.name)} — ${Number(p.stars).toFixed(1)}★${taken.has(p.id) ? " (já tem proposta)" : ""}</option>`;
  }).join("");
  modalContainer.innerHTML = `
    <div class="modal-overlay" id="rating-proposal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">🗳️ Nova proposta (${escapeVoteHtml(monthLabel(store.currentPeriodKey()))})</h2>
          <button class="modal-close" id="rating-proposal-close">✕</button>
        </div>
        <form id="rating-proposal-form" style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="font-size: 0.82rem; font-weight: 700;">Jogador</label>
            <select name="playerId" class="input-field" required>
              <option value="">Selecione...</option>
              ${options}
            </select>
          </div>
          <div>
            <label style="font-size: 0.82rem; font-weight: 700;">Sugestão</label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <label style="flex: 1; display: flex; gap: 6px; align-items: center; border: 1px solid var(--border-color); border-radius: 10px; padding: 8px 10px; font-size: 0.85rem;">
                <input type="radio" name="direction" value="up" checked /> 📈 Aumentar (+0,5)
              </label>
              <label style="flex: 1; display: flex; gap: 6px; align-items: center; border: 1px solid var(--border-color); border-radius: 10px; padding: 8px 10px; font-size: 0.85rem;">
                <input type="radio" name="direction" value="down" /> 📉 Diminuir (−0,5)
              </label>
            </div>
          </div>
          <div>
            <label style="font-size: 0.82rem; font-weight: 700;">Motivo (opcional)</label>
            <input name="reason" class="input-field" maxlength="280" placeholder="Ex: artilharia do mês..." />
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" id="rating-proposal-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary">📋 Criar proposta</button>
          </div>
        </form>
      </div>
    </div>`;
  const close = () => { modalContainer.innerHTML = ""; onDone?.(); };
  modalContainer.querySelector("#rating-proposal-close").addEventListener("click", close);
  modalContainer.querySelector("#rating-proposal-cancel").addEventListener("click", close);
  modalContainer.querySelector("#rating-proposal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "rating-proposal-overlay") close();
  });
  modalContainer.querySelector("#rating-proposal-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = store.createRatingProposal(
      String(fd.get("playerId") || ""), String(fd.get("direction") || "up"),
      String(fd.get("reason") || ""), currentVoter());
    if (!res.success) { showToast("⚠️ " + res.error); return; }
    modalContainer.innerHTML = "";
    showToast("📋 Proposta criada! Agora vote nela.");
    onDone?.();
  });
}
