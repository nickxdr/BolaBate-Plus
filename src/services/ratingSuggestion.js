// Sugestão de nota do jogador (admin): analisa o desempenho recente vs. a nota atual
// e sugere aumentar (+0,5), diminuir (−0,5) ou manter. Pura função de leitura —
// não altera nada, só orienta o admin no modal de edição.
//
// Justa com quem está jogando bem:
//  - a base de cálculo é POR JOGADOR: assim que ele tem ≥2 jogos no mês atual, é o
//    mês atual que decide — o que ele está marcando agora conta;
//  - bagre nunca zera o que ele fez: a penalidade é limitada aos gols+assistências;
//  - quem marca ≥0,5 gol/jogo OU ≥0,75 gol+assist/jogo não recebe sugestão de queda.
const RATING_SUGGEST_MONTHS_PT = [
  "", "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

// Pesos do índice de forma (todos por jogo).
const GOAL_WEIGHT = 2.0;
const ASSIST_WEIGHT = 1.5;
const AWARD_WEIGHT = 2.0; // craque / puskas
const SELECAO_WEIGHT = 1.0;
const BAGRE_WEIGHT = 1.5;

// Produção mínima para quem está jogando bem ficar protegido de sugestão de queda.
const PROTECT_GOALS_PER_GAME = 0.5;
const PROTECT_GOAL_INVOLVEMENT_PER_GAME = 0.75;

/**
 * Base de cálculo POR JOGADOR: o mês atual assim que ele tiver ≥2 jogos nele — quem
 * está em campo e marcando agora precisa ser avaliado pelo agora; caso contrário o
 * mês anterior, se ele tiver jogado nele; senão o mês atual.
 * (Antes a regra era "se QUALQUER jogador jogou mês passado, todo mundo é avaliado
 * no mês passado" — aí quem já tinha marcado gols no mês corrente era julgado pela
 * seca do mês anterior.)
 */
function ratingBasePeriodKey(monthlyStats, targetKey, playerId) {
  const prev = previousPeriodKey(targetKey);
  const gamesIn = (key) =>
    Number(monthlyStats?.[key]?.players?.[playerId]?.participacao) || 0;

  if (gamesIn(targetKey) >= 2) return targetKey;
  if (prev && gamesIn(prev) >= 1) return prev;
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
 * Total de peladas já jogadas por este jogador (carreira) — é o contador usado pelo
 * cooldown de sugestões. Inclui as aparições como goleiro, para que um jogador que
 * rotaciona entre posição e gol também destrave a próxima sugestão ao jogar.
 */
function careerGamesPlayed(player) {
  return (Number(player?.participacao) || 0) + (Number(player?.gkParticipacao) || 0);
}

/**
 * Critério de QUEDA por faixa de nota: quanto maior a nota, mais difícil cair
 * (evita cortes bruscos em jogadores de alto nível). A subida continua com a
 * regra global (índice ≥ 3,0) — a rigidez por faixa só protege a queda.
 *
 * - 0,5–3,0★ → flexível: índice < 0,8 com ≥ 2 jogos (como sempre foi)
 * - 3,5–4,5★ → médio:    índice < 0,5 com ≥ 3 jogos
 * - 5,0★     → muito estrito: índice < 0,3 com ≥ 4 jogos
 */
function downgradeRule(stars) {
  if (stars >= 5.0) {
    return { minGames: 4, maxPerGame: 0.3, label: "muito estrito (5,0★)" };
  }
  if (stars >= 3.5) {
    return { minGames: 3, maxPerGame: 0.5, label: "médio (3,5–4,5★)" };
  }
  return { minGames: 2, maxPerGame: 0.8, label: "flexível (0,5–3,0★)" };
}

/**
 * Calcula a sugestão de nota para UM jogador.
 * Retorna { direction: 'up'|'keep'|'down', suggestedStars, currentStars,
 *   baseKey, games, goals, assists, craque, puskas, selecao, bagre,
 *   score, reason, cooldown? }.
 * `cooldown: true` quando a sugestão está pausada por já ter sido aplicada antes.
 *
 * Ajuste por faixa: score alto (>= 3.0 e nota < 5.0) → sugerir +0,5 (regra global);
 * score baixo → sugerir −0,5 SOMENTE se passar do critério da faixa da nota atual
 * (ver downgradeRule(): 0,5–3,0★ flexível, 3,5–4,5★ médio, 5,0★ muito estrito);
 * sem jogos no período → neutro (sem dados).
 *
 * Proteção a quem está jogando bem: quem tem ≥0,5 gol/jogo OU ≥0,75 gol+assist/jogo
 * na base de cálculo nunca recebe sugestão de queda, e o bagre é limitado pelos
 * gols+assistências (nunca zera a produção dele).
 *
 * Cooldown: depois que o admin APLICA uma sugestão (pra cima ou pra baixo) — ou seja,
 * salva uma nota diferente com a sugestão na tela — nenhuma outra é sugerida para esse
 * jogador até que ele jogue ao menos mais uma pelada. A contagem de carreira
 * (player.participacao + gkParticipacao) precisa passar do valor registrado em
 * player.lastRatingSuggestionGames (gravado por store.markRatingSuggestionApplied()).
 * Só visualizar a sugestão não pausa nada.
 */
export function suggestPlayerRating(monthlyStats, player, periodKey) {
  const currentStars = Math.max(0.5, Math.min(5.0, Number(player?.stars) || 3.0));
  const baseKey = ratingBasePeriodKey(monthlyStats, periodKey, player?.id);
  const s = monthlyStats?.[baseKey]?.players?.[player?.id] || {};
  const games = Number(s.participacao) || 0;
  const goals = Number(s.goals) || 0;
  const assists = Number(s.assists) || 0;
  const craque = Number(s.craque) || 0;
  const puskas = Number(s.puskas) || 0;
  const selecao = Number(s.selecao) || 0;
  const bagre = Number(s.bagre) || 0;

  // Votos de bagre no máximo cancelam os gols+assistências dele — nunca levam o
  // índice de quem está marcando para o negativo só por causa da votação.
  const bagreCap = goals * GOAL_WEIGHT + assists * ASSIST_WEIGHT;
  const bagrePenalty = Math.min(bagre * BAGRE_WEIGHT, bagreCap);

  const perGame =
    games > 0
      ? (goals * GOAL_WEIGHT +
          assists * ASSIST_WEIGHT +
          craque * AWARD_WEIGHT +
          puskas * AWARD_WEIGHT +
          selecao * SELECAO_WEIGHT -
          bagrePenalty) /
        games
      : 0;

  const baseLabel = monthShortLabel(baseKey);
  const statsLabel = `${goals}g ${assists}a em ${games}j (${baseLabel})`;

  // Quem está marcando está jogando bem → imune a sugestão de queda neste período.
  const goalsPerGame = games > 0 ? goals / games : 0;
  const involvementPerGame = games > 0 ? (goals + assists) / games : 0;
  const isPlayingWell =
    goalsPerGame >= PROTECT_GOALS_PER_GAME ||
    involvementPerGame >= PROTECT_GOAL_INVOLVEMENT_PER_GAME;

  // Cooldown: a sugestão já foi APLICADA para este jogador e ele ainda não jogou outra
  // pelada desde então — não recomendamos de novo (evita sugerir a mesma queda várias
  // vezes seguidas depois que o admin já agiu sobre ela).
  const appliedGames = player?.lastRatingSuggestionGames;
  if (appliedGames !== undefined && appliedGames !== null && appliedGames !== "") {
    const careerGames = careerGamesPlayed(player);
    if (careerGames <= Number(appliedGames)) {
      return {
        direction: "keep", cooldown: true, suggestedStars: currentStars, currentStars,
        baseKey, games, goals, assists, craque, puskas, selecao, bagre,
        score: perGame,
        reason: `Sugestão já registrada — ${player?.name || "O jogador"} precisa jogar ao menos uma nova pelada antes de outra sugestão de nota.`,
      };
    }
  }

  if (games === 0) {
    return {
      direction: "keep", suggestedStars: currentStars, currentStars,
      baseKey, games, goals, assists, craque, puskas, selecao, bagre,
      score: 0, reason: `Sem jogos registrados em ${baseLabel} — sem dados para sugerir.`,
    };
  }

  // Critério de queda da faixa atual da nota (0,5–3,0★ flexível / 3,5–4,5★ médio /
  // 5,0★ muito estrito) — usado no guard da nota mínima e na sugestão de queda.
  const downgrade = downgradeRule(currentStars);
  const isDowngrade = perGame < downgrade.maxPerGame && games >= downgrade.minGames;

  // Nota máxima/mínima: não há para onde ir
  if (perGame >= 3.0 && currentStars >= 5.0) {
    return {
      direction: "keep", suggestedStars: currentStars, currentStars,
      baseKey, games, goals, assists, craque, puskas, selecao, bagre,
      score: perGame, reason: `Fase ótima (${statsLabel}), mas já está na nota máxima (5,0).`,
    };
  }
  if (isDowngrade && currentStars <= 0.5) {
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
  if (isDowngrade && isPlayingWell) {
    return {
      direction: "keep", suggestedStars: currentStars, currentStars,
      baseKey, games, goals, assists, craque, puskas, selecao, bagre,
      score: perGame,
      reason: `Marcação em alta: ${statsLabel} (média de ${goalsPerGame.toFixed(2).replace(".", ",")} gols/jogo) — nota mantida, sem sugestão de queda.`,
    };
  }
  if (isDowngrade) {
    const suggestedStars = Math.max(0.5, Math.round((currentStars - 0.5) * 2) / 2);
    const criterion = `critério ${downgrade.label}: índice < ${String(downgrade.maxPerGame).replace(".", ",")} por jogo em ≥${downgrade.minGames} jogos`;
    return {
      direction: "down", suggestedStars, currentStars,
      baseKey, games, goals, assists, craque, puskas, selecao, bagre,
      score: perGame, reason: `Fase abaixo: ${statsLabel}${bagre > 0 ? `, ${bagre}× bagre` : ""} (${criterion}). Sugestão: ${currentStars.toFixed(1)} → ${suggestedStars.toFixed(1)}.`,
    };
  }
  const formLabel = perGame >= 1.5 ? "boa e estável" : "regular";
  return {
    direction: "keep", suggestedStars: currentStars, currentStars,
    baseKey, games, goals, assists, craque, puskas, selecao, bagre,
    score: perGame, reason: `Fase ${formLabel}: ${statsLabel}. Nota ${currentStars.toFixed(1)} parece adequada — manter.`,
  };
}
