// Sugestão de nota do jogador (admin): analisa o desempenho recente
// (mês anterior, ou mês atual como fallback) vs. a nota atual e sugere
// aumentar (+0,5), diminuir (−0,5) ou manter. Pura função de leitura —
// não altera nada, só orienta o admin no modal de edição.
const RATING_SUGGEST_MONTHS_PT = [
  "", "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function ratingBasePeriodKey(monthlyStats, targetKey) {
  const prev = previousPeriodKey(targetKey);
  const hasActivity = (stats) =>
    Object.values(stats || {}).some(
      (s) =>
        (Number(s.participacao) || 0) > 0 ||
        (Number(s.goals) || 0) > 0 ||
        (Number(s.assists) || 0) > 0
    );
  if (prev && hasActivity(monthlyStats?.[prev]?.players)) return prev;
  return targetKey;
}

function previousPeriodKey(periodKeyStr) {
  const [y, m] = String(periodKeyStr || "").split("-").map(Number);
  if (!y || !m) return null;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function monthShortLabel(key) {
  const [y, m] = String(key || "").split("-").map(Number);
  if (!y || !m) return String(key || "");
  return `${RATING_SUGGEST_MONTHS_PT[m]}/${String(y).slice(2)}`;
}

/**
 * Calcula a sugestão de nota para UM jogador.
 * Retorna { direction: 'up'|'keep'|'down', suggestedStars, currentStars,
 *   baseKey, games, goals, assists, craque, puskas, selecao, bagre,
 *   score, reason }.
 *
 * Lógica: índice de forma por jogo (gols×2 + assists×1.5 + craque×2 +
 * puskas×2 + seleção − bagre×1.5, dividido pelos jogos) comparado com
 * faixas fixas calibradas pela nota atual:
 * - score alto (>= 3.0 e nota < 5.0) → sugerir +0,5
 * - score baixo (< 0.8 e nota > 0.5, com ao menos 2 jogos) → sugerir −0,5
 * - sem jogos no período → neutro (sem dados)
 */
export function suggestPlayerRating(monthlyStats, player, periodKey) {
  const currentStars = Math.max(0.5, Math.min(5.0, Number(player?.stars) || 3.0));
  const baseKey = ratingBasePeriodKey(monthlyStats, periodKey);
  const s = monthlyStats?.[baseKey]?.players?.[player?.id] || {};
  const games = Number(s.participacao) || 0;
  const goals = Number(s.goals) || 0;
  const assists = Number(s.assists) || 0;
  const craque = Number(s.craque) || 0;
  const puskas = Number(s.puskas) || 0;
  const selecao = Number(s.selecao) || 0;
  const bagre = Number(s.bagre) || 0;
  const perGame =
    games > 0
      ? (goals * 2 + assists * 1.5 + craque * 2 + puskas * 2 + selecao - bagre * 1.5) / games
      : 0;

  const baseLabel = monthShortLabel(baseKey);
  const statsLabel = `${goals}g ${assists}a em ${games}j (${baseLabel})`;

  if (games === 0) {
    return {
      direction: "keep", suggestedStars: currentStars, currentStars,
      baseKey, games, goals, assists, craque, puskas, selecao, bagre,
      score: 0, reason: `Sem jogos registrados em ${baseLabel} — sem dados para sugerir.`,
    };
  }

  // Nota máxima/mínima: não há para onde ir
  if (perGame >= 3.0 && currentStars >= 5.0) {
    return {
      direction: "keep", suggestedStars: currentStars, currentStars,
      baseKey, games, goals, assists, craque, puskas, selecao, bagre,
      score: perGame, reason: `Fase ótima (${statsLabel}), mas já está na nota máxima (5,0).`,
    };
  }
  if (perGame < 0.8 && games >= 2 && currentStars <= 0.5) {
    return {
      direction: "keep", suggestedStars: currentStars, currentStars,
      baseKey, games, goals, assists, craque, puskas, selecao, bagre,
      score: perGame, reason: `Fase ruim (${statsLabel}), mas já está na nota mínima (0,5).`,
    };
  }

  if (perGame >= 3.0) {
    const suggestedStars = Math.min(5.0, Math.round((currentStars + 0.5) * 2) / 2);
    return {
      direction: "up", suggestedStars, currentStars,
      baseKey, games, goals, assists, craque, puskas, selecao, bagre,
      score: perGame, reason: `Fase ótima: ${statsLabel}. Sugestão: ${currentStars.toFixed(1)} → ${suggestedStars.toFixed(1)}.`,
    };
  }
  if (perGame < 0.8 && games >= 2) {
    const suggestedStars = Math.max(0.5, Math.round((currentStars - 0.5) * 2) / 2);
    return {
      direction: "down", suggestedStars, currentStars,
      baseKey, games, goals, assists, craque, puskas, selecao, bagre,
      score: perGame, reason: `Fase abaixo: ${statsLabel}${bagre > 0 ? `, ${bagre}× bagre` : ""}. Sugestão: ${currentStars.toFixed(1)} → ${suggestedStars.toFixed(1)}.`,
    };
  }
  const formLabel = perGame >= 1.5 ? "boa e estável" : "regular";
  return {
    direction: "keep", suggestedStars: currentStars, currentStars,
    baseKey, games, goals, assists, craque, puskas, selecao, bagre,
    score: perGame, reason: `Fase ${formLabel}: ${statsLabel}. Nota ${currentStars.toFixed(1)} parece adequada — manter.`,
  };
}
