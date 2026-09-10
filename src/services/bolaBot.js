import { store } from "../state/store.js";
import { statsHaveActivity } from "./periodStats.js";

/**
 * BolaBot
 * BolaBate local intelligence+
 *
 * Analisa dados reais do store e responde perguntas
 * sobre ranking, evolução, desempenho e pelada atual.
 */

const RANKING_WEIGHTS = {
  goals: 3,
  assists: 2,
  selecao: 4,
  puskas: 3,
  craque: 5,
  bagre: -3,
  participacao: 1
};

/* =========================================================
   UTILITÁRIOS
========================================================= */

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getPlayers() {
  return Array.isArray(store.players) ? store.players : [];
}

function getPelada() {
  return store.activePelada || null;
}

function formatPlayerName(player) {
  return player?.name || "Ninguém";
}

function getRankingScore(player) {
  return (
    (Number(player.goals) || 0) * RANKING_WEIGHTS.goals +
    (Number(player.assists) || 0) * RANKING_WEIGHTS.assists +
    (Number(player.selecao) || 0) * RANKING_WEIGHTS.selecao +
    (Number(player.puskas) || 0) * RANKING_WEIGHTS.puskas +
    (Number(player.craque) || 0) * RANKING_WEIGHTS.craque -
    (Number(player.bagre) || 0) * 3 +
    (Number(player.participacao) || 0)
  );
}

function getPeriodRankingScore(stats) {
  if (!stats) return 0;

  return (
    (Number(stats.goals) || 0) * RANKING_WEIGHTS.goals +
    (Number(stats.assists) || 0) * RANKING_WEIGHTS.assists +
    (Number(stats.selecao) || 0) * RANKING_WEIGHTS.selecao +
    (Number(stats.puskas) || 0) * RANKING_WEIGHTS.puskas +
    (Number(stats.craque) || 0) * RANKING_WEIGHTS.craque -
    (Number(stats.bagre) || 0) * 3 +
    (Number(stats.participacao) || 0)
  );
}

/* =========================================================
   RANKING / ESTATÍSTICAS GERAIS
========================================================= */

function getBestPlayer() {
  const players = getPlayers();

  if (!players.length) return null;

  return [...players].sort(
    (a, b) => getRankingScore(b) - getRankingScore(a)
  )[0];
}

function answerRanking() {
  const player = getBestPlayer();

  if (!player) {
    return "Ainda não tenho jogadores suficientes para analisar o ranking.";
  }

  const score = getRankingScore(player);

  return `👑 No ranking geral (todos os tempos), o melhor jogador é **${formatPlayerName(
    player
  )}**, com ${score} pontos.`;
}

/* =========================================================
   ESCOPO DE PERÍODO (ANO / MÊS)
========================================================= */

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];

/** Ano em contexto: o que estiver selecionado na Tabela da Liga, ou o ano atual do dispositivo. */
function getContextYear() {
  const key = String(store.selectedPeriodKey || store.currentPeriodKey());

  return Number(key.split("-")[0]) || new Date().getFullYear();
}

/** Mês em contexto (YYYY-MM): o mês selecionado na Tabela da Liga quando ela está em modo mensal, senão o mês atual. */
function getContextPeriodKey() {
  const key = String(store.selectedPeriodKey || "");
  const month = key.split("-")[1];

  if (month && month !== "anual") return key;

  return store.currentPeriodKey();
}

function formatMonthLabel(periodKey) {
  const [year, month] = String(periodKey).split("-").map(Number);
  const name = MONTH_NAMES[month - 1];

  return name ? `${name} de ${year}` : String(periodKey);
}

/** Jogadores com atividade num snapshot, ordenados com os mesmos critérios da Tabela da Liga (pontos, gols, craque, assistências). */
function getRankedPlayersFromSnapshot(snapshot) {
  return getPlayers()
    .map((player) => {
      const stats = snapshot?.players?.[player.id];

      return {
        player,
        stats,
        score: getPeriodRankingScore(stats)
      };
    })
    .filter((entry) => statsHaveActivity(entry.stats))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.stats.goals || 0) !== (a.stats.goals || 0)) {
        return (b.stats.goals || 0) - (a.stats.goals || 0);
      }
      if ((b.stats.craque || 0) !== (a.stats.craque || 0)) {
        return (b.stats.craque || 0) - (a.stats.craque || 0);
      }

      return (b.stats.assists || 0) - (a.stats.assists || 0);
    });
}

/** Meses que realmente têm dados, do mais recente para o mais antigo — para orientar quando uma consulta vem vazia. */
function getRecentMonthsWithData(limit = 3) {
  return Object.keys(store.monthlyStats || {})
    .sort()
    .slice(-limit)
    .reverse();
}

const SCOPE_YEAR = "year";
const SCOPE_MONTH = "month";

// Palavras que situam a pergunta no ano inteiro ou num mês específico (já sem acentos, via normalizeText).
const YEAR_HINTS = [
  "do ano",
  "no ano",
  "deste ano",
  "desse ano",
  "nesse ano",
  "esse ano",
  "este ano",
  "do anual"
];

const MONTH_HINTS = [
  "do mes",
  "no mes",
  "deste mes",
  "desse mes",
  "nesse mes",
  "esse mes",
  "este mes"
];

/**
 * De qual período a pergunta trata, conforme as palavras usadas: SCOPE_YEAR para
 * "no ano", SCOPE_MONTH para "no mês", ou null quando nenhum é citado (aí a resposta
 * cobre todos os tempos).
 */
function detectPeriodScope(text) {
  const mentionsYear = YEAR_HINTS.some((hint) => text.includes(hint));
  const mentionsMonth = MONTH_HINTS.some((hint) => text.includes(hint));

  if (mentionsYear && !mentionsMonth) return SCOPE_YEAR;
  if (mentionsMonth && !mentionsYear) return SCOPE_MONTH;

  return null;
}

/**
 * Resolve de qual snapshot a resposta deve ler: o acumulado do ano, o do mês, ou
 * (quando scope é null) os totais de carreira. Ano/mês respeitam o período
 * selecionado na Tabela da Liga e, no período atual, já incluem os gols/assistências
 * da pelada ao vivo que ainda não foram commitados.
 */
function resolvePeriodScope(scope) {
  if (scope === SCOPE_YEAR) {
    const year = getContextYear();

    return { snapshot: store.getYearSnapshot(year), label: String(year) };
  }

  if (scope === SCOPE_MONTH) {
    const key = getContextPeriodKey();
    const [year, month] = String(key).split("-").map(Number);

    return {
      snapshot: store.getPeriodSnapshot(year, month),
      label: formatMonthLabel(key)
    };
  }

  const players = {};

  getPlayers().forEach((player) => {
    players[player.id] = player;
  });

  return { snapshot: { players }, label: null };
}

/** Jogadores com atividade num snapshot, ordenados por uma única estatística (empate vai para o melhor no geral). */
function getPlayersByStat(snapshot, field) {
  return getPlayers()
    .map((player) => {
      const stats = snapshot?.players?.[player.id] || {};

      return {
        player,
        stats,
        value: Number(stats[field]) || 0,
        score: getPeriodRankingScore(stats)
      };
    })
    .filter((entry) => statsHaveActivity(entry.stats))
    .sort((a, b) => (b.value - a.value) || (b.score - a.score));
}

function answerBestOfYear() {
  const { snapshot, label } = resolvePeriodScope(SCOPE_YEAR);
  const best = getRankedPlayersFromSnapshot(snapshot)[0];

  if (!best) {
    return `📅 Ainda não tenho dados registrados em ${label} para montar o ranking do ano.`;
  }

  return `👑 O melhor jogador de **${label}** é **${best.player.name}**, com ${best.score} pontos no ranking anual.

⚽ Gols: ${best.stats.goals || 0}
🎯 Assistências: ${best.stats.assists || 0}
🙋 Participações: ${best.stats.participacao || 0}`;
}

function answerBestOfMonth() {
  const { snapshot, label } = resolvePeriodScope(SCOPE_MONTH);
  const best = getRankedPlayersFromSnapshot(snapshot)[0];

  if (!best) {
    const months = getRecentMonthsWithData();

    const hint = months.length
      ? `\n\nMeses com dados: ${months.map(formatMonthLabel).join(", ")}.`
      : "";

    return `📅 Ainda não tenho dados registrados em ${label}.${hint}`;
  }

  return `👑 O melhor jogador de **${label}** é **${best.player.name}**, com ${best.score} pontos no ranking do mês.

⚽ Gols: ${best.stats.goals || 0}
🎯 Assistências: ${best.stats.assists || 0}
🙋 Participações: ${best.stats.participacao || 0}`;
}

function answerWorstPlayer(scope) {
  const { snapshot, label } = resolvePeriodScope(scope);
  const ranked = getRankedPlayersFromSnapshot(snapshot);
  const worst = ranked[ranked.length - 1];

  if (!worst) {
    return scope
      ? `📉 Não tenho dados de ranking em ${label}.`
      : "Ainda não tenho jogadores suficientes para analisar o ranking.";
  }

  if (!scope) {
    return `📉 Atualmente, **${formatPlayerName(
      worst.player
    )}** está na última posição do ranking, com ${worst.score} pontos.`;
  }

  return `📉 Em **${label}**, o pior do ranking é **${formatPlayerName(
    worst.player
  )}**, com ${worst.score} pontos.`;
}

function answerGoals(scope) {
  const { snapshot, label } = resolvePeriodScope(scope);
  const best = getPlayersByStat(snapshot, "goals")[0];

  if (!best) {
    return scope
      ? `⚽ Ainda não tenho dados de gols em ${label}.`
      : "Ainda não tenho dados de gols.";
  }

  const goals = best.value;

  return `⚽ Quem mais fez gols${
    scope ? ` em **${label}**` : ""
  } é **${formatPlayerName(best.player)}**, com ${goals} gol${
    goals === 1 ? "" : "s"
  }.`;
}

function answerAssists(scope) {
  const { snapshot, label } = resolvePeriodScope(scope);
  const best = getPlayersByStat(snapshot, "assists")[0];

  if (!best) {
    return scope
      ? `🎯 Ainda não tenho dados de assistências em ${label}.`
      : "Ainda não tenho dados de assistências.";
  }

  const assists = best.value;

  return `🎯 Quem mais deu assistências${
    scope ? ` em **${label}**` : ""
  } é **${formatPlayerName(best.player)}**, com ${assists} assistência${
    assists === 1 ? "" : "s"
  }.`;
}

function answerStats(playerName) {
  const players = getPlayers();

  const player = players.find(
    (p) => normalizeText(p.name) === normalizeText(playerName)
  );

  if (!player) {
    return `Não encontrei nenhum jogador chamado **${playerName}**.`;
  }

  const score = getRankingScore(player);

  return `📊 **${player.name}**

⭐ Nota: ${player.stars ?? "-"}
🏆 Ranking: ${score} pontos
⚽ Gols: ${player.goals || 0}
🎯 Assistências: ${player.assists || 0}
🔥 Seleção: ${player.selecao || 0}
✨ Puskás: ${player.puskas || 0}
👑 Craque: ${player.craque || 0}
🐟 Bagre: ${player.bagre || 0}
🙋 Participações: ${player.participacao || 0}`;
}

/* =========================================================
   EVOLUÇÃO
========================================================= */

function getPreviousPeriodKey(key) {
  const [year, month] = String(key).split("-").map(Number);

  if (!year || !month) return null;

  if (month === 1) {
    return `${year - 1}-12`;
  }

  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

function getPlayersEvolution(currentKey, previousKey) {
  const currentPeriod = store.monthlyStats?.[currentKey];
  const previousPeriod = store.monthlyStats?.[previousKey];

  if (!currentPeriod) return [];

  return getPlayers().map((player) => {
    const currentStats =
      currentPeriod.players?.[player.id] || {};

    const previousStats =
      previousPeriod?.players?.[player.id] || {};

    const currentScore =
      getPeriodRankingScore(currentStats);

    const previousScore =
      getPeriodRankingScore(previousStats);

    return {
      player,
      currentStats,
      previousStats,
      currentScore,
      previousScore,
      evolution: currentScore - previousScore
    };
  });
}

function getMostImprovedPlayer() {
  const currentKey = store.currentPeriodKey();
  const previousKey = getPreviousPeriodKey(currentKey);

  if (!previousKey) return null;

  const evolution = getPlayersEvolution(
    currentKey,
    previousKey
  );

  if (!evolution.length) return null;

  return [...evolution].sort(
    (a, b) => b.evolution - a.evolution
  )[0];
}

function answerEvolution() {
  const currentKey = store.currentPeriodKey();
  const previousKey = getPreviousPeriodKey(currentKey);

  if (!previousKey) {
    return "Ainda não consegui determinar o período anterior. 📈";
  }

  const currentPeriod = store.monthlyStats?.[currentKey];

  if (!currentPeriod) {
    return "Ainda não existem dados registrados para este mês. 📈";
  }

  const result = getMostImprovedPlayer();

  if (!result) {
    return "Ainda não tenho dados suficientes para analisar a evolução. 📈";
  }

  const {
    player,
    currentScore,
    previousScore,
    evolution
  } = result;

  if (evolution <= 0) {
    return `📉 Até agora, nenhum jogador evoluiu em relação ao mês anterior.

O melhor resultado foi de **${player.name}**, com ${currentScore} pontos neste mês contra ${previousScore} no mês anterior.`;
  }

  return `🚀 **${player.name}** foi quem mais evoluiu este mês!

📊 Mês anterior: ${previousScore} pontos
🔥 Este mês: ${currentScore} pontos
📈 Evolução: **+${evolution} pontos**`;
}

function answerPlayerEvolution(player) {
  const currentKey = store.currentPeriodKey();
  const previousKey = getPreviousPeriodKey(currentKey);

  if (!previousKey) {
    return "Ainda não consegui determinar o período anterior. 📈";
  }

  const currentPeriod = store.monthlyStats?.[currentKey];
  const previousPeriod = store.monthlyStats?.[previousKey];

  const currentStats =
    currentPeriod?.players?.[player.id] || {};

  const previousStats =
    previousPeriod?.players?.[player.id] || {};

  const currentScore =
    getPeriodRankingScore(currentStats);

  const previousScore =
    getPeriodRankingScore(previousStats);

  const evolution =
    currentScore - previousScore;

  if (evolution > 0) {
    return `📈 **${player.name}** evoluiu **+${evolution} pontos** este mês!

📊 Mês anterior: ${previousScore} pontos
🔥 Este mês: ${currentScore} pontos`;
  }

  if (evolution < 0) {
    return `📉 **${player.name}** caiu **${Math.abs(
      evolution
    )} pontos** este mês.

📊 Mês anterior: ${previousScore} pontos
🔥 Este mês: ${currentScore} pontos`;
  }

  return `➡️ **${player.name}** manteve o mesmo desempenho.

📊 Mês anterior: ${previousScore} pontos
🔥 Este mês: ${currentScore} pontos`;
}

/* =========================================================
   CONTEXTO DA PELADA ATUAL
========================================================= */

function isPeladaLive() {
  return getPelada()?.status === "live";
}

function getCurrentMatch() {
  return getPelada()?.rotation?.currentMatch || null;
}

function getCurrentTeams() {
  const pelada = getPelada();

  if (!pelada?.teams) return [];

  return pelada.teams;
}

function getTeamById(teamId) {
  return getCurrentTeams().find(
    (team) => team.id === teamId
  ) || null;
}

function getPlayerById(playerId) {
  return getPlayers().find(
    (player) => player.id === playerId
  ) || null;
}

function getLivePlayerStats(playerId) {
  const stats =
    getPelada()?.stats?.[playerId] || {};

  return {
    goals: Number(stats.goals) || 0,
    assists: Number(stats.assists) || 0,
    guestGoals: Number(stats.guestGoals) || 0,
    guestAssists: Number(stats.guestAssists) || 0
  };
}

function getTeamPlayers(team) {
  if (!team?.playerIds) return [];

  return team.playerIds
    .map((id) => getPlayerById(id))
    .filter(Boolean);
}

function getTeamLiveStats(team) {
  const players = getTeamPlayers(team);

  return players.reduce(
    (total, player) => {
      const stats = getLivePlayerStats(player.id);

      total.goals += stats.goals;
      total.assists += stats.assists;

      return total;
    },
    {
      goals: 0,
      assists: 0
    }
  );
}

/* =========================================================
   ANÁLISE DE DESEMPENHO
========================================================= */

/**
 * Métrica interna do BolaBot.
 *
 * Não substitui o ranking oficial.
 * Serve apenas para comparar desempenho dentro
 * da pelada atual.
 */
function getLivePerformanceScore(player) {
  const stats = getLivePlayerStats(player.id);

  return (
    stats.goals * 3 +
    stats.assists * 2
  );
}

function getLiveContribution(player) {
  const stats = getLivePlayerStats(player.id);

  return stats.goals + stats.assists;
}

function getParticipatingPlayers() {
  const pelada = getPelada();

  if (!pelada?.teams) return [];

  const playerIds = pelada.teams.flatMap(
    (team) => team.playerIds || []
  );

  return [...new Set(playerIds)]
    .map((id) => getPlayerById(id))
    .filter(Boolean)
    .filter((player) => {
      return !pelada.diaristaPlayerIds?.includes(player.id);
    });
}

function getBestLivePlayer() {
  const players = getParticipatingPlayers();

  if (!players.length) return null;

  return [...players].sort(
    (a, b) =>
      getLivePerformanceScore(b) -
      getLivePerformanceScore(a)
  )[0];
}

function getMostDecisivePlayer() {
  const players = getParticipatingPlayers();

  if (!players.length) return null;

  return [...players].sort(
    (a, b) =>
      getLiveContribution(b) -
      getLiveContribution(a)
  )[0];
}

function analyzePlayer(player) {
  if (!player) {
    return "Não encontrei esse jogador na BolaBate+. 🤖";
  }

  const liveStats = getLivePlayerStats(player.id);
  const rankingScore = getRankingScore(player);

  const currentKey = store.currentPeriodKey();

  let monthlyStats = {};

  if (typeof store.getPeriodPlayerStats === "function") {
    monthlyStats =
      store.getPeriodPlayerStats(
        player.id,
        currentKey
      ) || {};
  } else {
    monthlyStats =
      store.monthlyStats?.[currentKey]?.players?.[player.id] || {};
  }

  const monthlyScore =
    getPeriodRankingScore(monthlyStats);

  const contributions =
    liveStats.goals + liveStats.assists;

  let conclusion;

  if (contributions >= 4) {
    conclusion =
      "está sendo um dos grandes destaques da pelada";
  } else if (contributions >= 2) {
    conclusion =
      "está tendo uma participação ofensiva importante";
  } else if (contributions === 1) {
    conclusion =
      "já conseguiu contribuir diretamente para o ataque";
  } else {
    conclusion =
      "ainda não teve participação direta em gols nesta pelada";
  }

  return `🧠 **Análise de ${player.name}**

${player.name} ${conclusion}.

🔥 **Pelada atual**
⚽ ${liveStats.goals} gol${liveStats.goals === 1 ? "" : "s"}
🎯 ${liveStats.assists} assistência${liveStats.assists === 1 ? "" : "s"}
💥 ${contributions} participação${contributions === 1 ? "" : "ões"} em gol

📈 **Momento**
🏆 Ranking geral: ${rankingScore} pontos
📊 Ranking do período: ${monthlyScore} pontos

💡 ${getPlayerInsight(player, liveStats)}`;
}

function getPlayerInsight(player, stats) {
  if (stats.goals >= 2 && stats.assists >= 1) {
    return `${player.name} está combinando finalização e criação. É o perfil mais completo ofensivamente até agora.`;
  }

  if (stats.goals >= 2) {
    return `${player.name} está se destacando principalmente pela capacidade de finalizar.`;
  }

  if (stats.assists >= 2) {
    return `${player.name} está se destacando mais pela criação de jogadas do que pela finalização.`;
  }

  if (stats.goals === 1 && stats.assists === 1) {
    return `${player.name} está contribuindo tanto na finalização quanto na criação.`;
  }

  if (stats.goals === 1) {
    return `${player.name} já deixou sua marca, mas ainda pode aumentar sua influência participando mais das jogadas.`;
  }

  if (stats.assists === 1) {
    return `${player.name} já contribuiu com uma assistência, mostrando participação na construção das jogadas.`;
  }

  return `Ainda é cedo para tirar uma conclusão forte sobre ${player.name}.`;
}

function answerBestLivePlayer() {
  if (!isPeladaLive()) {
    return "Não há uma pelada acontecendo agora para eu analisar. 🤖";
  }

  const player = getBestLivePlayer();

  if (!player) {
    return "Ainda não tenho jogadores suficientes para analisar a pelada.";
  }

  const stats = getLivePlayerStats(player.id);
  const score = getLivePerformanceScore(player);

  if (score === 0) {
    return `🧠 Ainda está muito cedo para apontar quem está jogando melhor.

Ninguém teve participação direta em gols nesta pelada ainda.`;
  }

  return `🧠 **${player.name}** está sendo o destaque até agora.

⚽ ${stats.goals} gol${stats.goals === 1 ? "" : "s"}
🎯 ${stats.assists} assistência${stats.assists === 1 ? "" : "s"}
🔥 Índice de desempenho: **${score}**

Estou considerando gols e assistências para medir o desempenho ofensivo desta pelada.`;
}

function answerMostDecisive() {
  if (!isPeladaLive()) {
    return "Não há uma pelada acontecendo agora para analisar.";
  }

  const player = getMostDecisivePlayer();

  if (!player) {
    return "Ainda não tenho jogadores suficientes para analisar.";
  }

  const stats = getLivePlayerStats(player.id);
  const contribution =
    stats.goals + stats.assists;

  if (contribution === 0) {
    return "Ainda ninguém teve participação direta em gol nesta pelada.";
  }

  return `🔥 **${player.name}** está sendo o mais decisivo até agora.

Participou diretamente de **${contribution} gol${
    contribution === 1 ? "" : "s"
  }**, com ${stats.goals} gol${
    stats.goals === 1 ? "" : "s"
  } e ${stats.assists} assistência${
    stats.assists === 1 ? "" : "s"
  }.`;
}

/* =========================================================
   ANÁLISE DOS TIMES
========================================================= */

function getCurrentMatchTeams() {
  const match = getCurrentMatch();

  if (!match) return null;

  const teamA = getTeamById(match.teamAId);
  const teamB = getTeamById(match.teamBId);

  if (!teamA || !teamB) return null;

  return {
    teamA,
    teamB
  };
}

function calculateTeamPerformance(team) {
  const stats = getTeamLiveStats(team);

  return (
    stats.goals * 3 +
    stats.assists * 2
  );
}

function getTeamStars(team) {
  return getTeamPlayers(team).reduce(
    (total, player) =>
      total + (Number(player.stars) || 0),
    0
  );
}

function answerBestTeam() {
  if (!isPeladaLive()) {
    return "Não há uma pelada acontecendo agora para eu analisar.";
  }

  const teams = getCurrentMatchTeams();

  if (!teams) {
    return "Ainda não existe uma partida em andamento para comparar os times.";
  }

  const {
    teamA,
    teamB
  } = teams;

  const statsA = getTeamLiveStats(teamA);
  const statsB = getTeamLiveStats(teamB);

  const performanceA =
    calculateTeamPerformance(teamA);

  const performanceB =
    calculateTeamPerformance(teamB);

  if (performanceA === performanceB) {
    return `⚔️ Os dois times estão equilibrados até agora.

**${teamA.name}**
⚽ ${statsA.goals} gols
🎯 ${statsA.assists} assistências

**${teamB.name}**
⚽ ${statsB.goals} gols
🎯 ${statsB.assists} assistências`;
  }

  const better =
    performanceA > performanceB
      ? teamA
      : teamB;

  const betterStats =
    performanceA > performanceB
      ? statsA
      : statsB;

  const other =
    performanceA > performanceB
      ? teamB
      : teamA;

  return `⚔️ **${better.name}** está levando vantagem até agora.

🔥 ${better.name}
⚽ ${betterStats.goals} gols
🎯 ${betterStats.assists} assistências

📊 A vantagem vem principalmente da participação ofensiva dos jogadores desse time.

O outro lado é o **${other.name}**.`;
}

function analyzeCurrentMatch() {
  if (!isPeladaLive()) {
    return "Não há uma pelada acontecendo agora. 🤖";
  }

  const match = getCurrentMatch();

  if (!match) {
    return "A pelada está aberta, mas ainda não existe uma partida em andamento.";
  }

  const teams = getCurrentMatchTeams();

  if (!teams) {
    return "Não consegui identificar os times da partida atual.";
  }

  const {
    teamA,
    teamB
  } = teams;

  const statsA = getTeamLiveStats(teamA);
  const statsB = getTeamLiveStats(teamB);

  const scoreA = Number(match.scoreA) || 0;
  const scoreB = Number(match.scoreB) || 0;

  const player = getMostDecisivePlayer();

  let analysis = "";

  if (scoreA === scoreB) {
    analysis =
      "O placar está equilibrado e a partida ainda está aberta.";
  } else if (Math.abs(scoreA - scoreB) === 1) {
    analysis =
      "A diferença é pequena, então qualquer próxima participação pode mudar bastante o jogo.";
  } else {
    const winner =
      scoreA > scoreB ? teamA : teamB;

    analysis =
      `O **${winner.name}** tem a vantagem no placar e está controlando melhor o resultado.`;
  }

  let decisiveText = "";

  if (player) {
    const stats = getLivePlayerStats(player.id);
    const contribution =
      stats.goals + stats.assists;

    if (contribution > 0) {
      decisiveText =
        `\n\n🔥 **${player.name}** é o jogador mais decisivo até agora, com ${stats.goals} gol${
          stats.goals === 1 ? "" : "s"
        } e ${stats.assists} assistência${
          stats.assists === 1 ? "" : "s"
        }.`;
    }
  }

  return `🧠 **Análise da partida**

⚽ **${teamA.name} ${scoreA} x ${scoreB} ${teamB.name}**

${analysis}${decisiveText}

📊 Participação ofensiva:
• ${teamA.name}: ${statsA.goals} gols e ${statsA.assists} assistências
• ${teamB.name}: ${statsB.goals} gols e ${statsB.assists} assistências`;
}

/* =========================================================
   COMPARAÇÃO ENTRE JOGADORES
========================================================= */

function findPlayersInQuestion(text) {
  const players = getPlayers();

  return players
    .filter((player) => {
      const name = normalizeText(player.name);

      return name && text.includes(name);
    })
    .sort(
      (a, b) =>
        normalizeText(b.name).length -
        normalizeText(a.name).length
    );
}

function comparePlayers(playerA, playerB) {
  if (!playerA || !playerB) {
    return "Preciso de dois jogadores para fazer a comparação.";
  }

  if (playerA.id === playerB.id) {
    return "Você precisa indicar dois jogadores diferentes para eu comparar.";
  }

  const statsA = getLivePlayerStats(playerA.id);
  const statsB = getLivePlayerStats(playerB.id);

  const scoreA = getLivePerformanceScore(playerA);
  const scoreB = getLivePerformanceScore(playerB);

  const monthlyKey = store.currentPeriodKey();

  let monthlyA = {};
  let monthlyB = {};

  if (typeof store.getPeriodPlayerStats === "function") {
    monthlyA =
      store.getPeriodPlayerStats(
        playerA.id,
        monthlyKey
      ) || {};

    monthlyB =
      store.getPeriodPlayerStats(
        playerB.id,
        monthlyKey
      ) || {};
  }

  const periodScoreA =
    getPeriodRankingScore(monthlyA);

  const periodScoreB =
    getPeriodRankingScore(monthlyB);

  let winner;
  let reason;

  if (scoreA !== scoreB) {
    winner =
      scoreA > scoreB ? playerA : playerB;

    reason =
      "está contribuindo mais diretamente para os gols na pelada atual";
  } else if (periodScoreA !== periodScoreB) {
    winner =
      periodScoreA > periodScoreB
        ? playerA
        : playerB;

    reason =
      "tem um desempenho melhor considerando o período atual";
  } else {
    winner = null;
    reason = "os dois apresentam números muito próximos";
  }

  if (!winner) {
    return `⚔️ **${playerA.name} x ${playerB.name}**

Os dois estão praticamente empatados no momento.

${playerA.name}: ${statsA.goals} gol${
      statsA.goals === 1 ? "" : "s"
    } e ${statsA.assists} assistência${
      statsA.assists === 1 ? "" : "s"
    }.

${playerB.name}: ${statsB.goals} gol${
      statsB.goals === 1 ? "" : "s"
    } e ${statsB.assists} assistência${
      statsB.assists === 1 ? "" : "s"
    }.`;
  }

  return `⚔️ **${playerA.name} x ${playerB.name}**

🏆 Minha análise atual favorece **${winner.name}**.

🔥 ${winner.name} ${reason}.

**${playerA.name}**
⚽ ${statsA.goals} gols
🎯 ${statsA.assists} assistências
📈 Período: ${periodScoreA} pontos

**${playerB.name}**
⚽ ${statsB.goals} gols
🎯 ${statsB.assists} assistências
📈 Período: ${periodScoreB} pontos`;
}

/* =========================================================
   AJUDA
========================================================= */

function answerHelp() {
  return `🤖 **Fala! Eu sou o BolaBot.**

Posso analisar os dados da BolaBate+ e também interpretar o que está acontecendo na pelada.

🧠 **Análise**
• Quem está jogando melhor?
• Quem está sendo mais decisivo?
• Analisa o Lucas.
• Quem está em melhor fase?

⚔️ **Comparações**
• Lucas ou Djavan?
• Quem está melhor, Lucas ou João?

🔥 **Partida**
• Analisa essa partida.
• Qual time está melhor?
• Quem está fazendo a diferença?

📈 **Evolução**
• Quem mais evoluiu esse mês?
• Como o Lucas evoluiu?

🏆 **Ranking (por ano ou por mês)**
• Quem foi o melhor do ano? / do mês?
• Quem fez mais gols no ano? / no mês?
• Quem deu mais assistências no ano? / no mês?
• Quem foi o pior do ano? / do mês?

Também continuo respondendo perguntas sobre ranking, gols e assistências. 🤖`;
}

/* =========================================================
   BUSCA DE JOGADOR
========================================================= */

function findPlayerInQuestion(text) {
  const players = findPlayersInQuestion(text);

  return players[0] || null;
}

/* =========================================================
   INTERPRETAÇÃO DA PERGUNTA
========================================================= */

function isComparisonQuestion(text) {
  return (
    text.includes(" ou ") ||
    text.includes("compare") ||
    text.includes("comparar") ||
    text.includes("comparacao") ||
    text.includes("quem e melhor entre")
  );
}

function isPlayerAnalysisQuestion(text) {
  return (
    text.includes("jogando melhor") ||
    text.includes("melhor fase") ||
    text.includes("em melhor fase") ||
    text.includes("sendo decisivo") ||
    text.includes("mais decisivo") ||
    text.includes("analisa") ||
    text.includes("analise") ||
    text.includes("desempenho")
  );
}

function isMatchAnalysisQuestion(text) {
  return (
    text.includes("analisa essa partida") ||
    text.includes("analise essa partida") ||
    text.includes("analisa o jogo") ||
    text.includes("analise o jogo") ||
    text.includes("analisa esse jogo") ||
    text.includes("analise esse jogo") ||
    text.includes("como esta o jogo") ||
    text.includes("como ta o jogo")
  );
}

function isTeamAnalysisQuestion(text) {
  return (
    text.includes("qual time esta melhor") ||
    text.includes("qual time ta melhor") ||
    text.includes("qual time esta levando") ||
    text.includes("qual time ta levando") ||
    text.includes("time esta melhor") ||
    text.includes("time ta melhor")
  );
}

/* =========================================================
   BOLA BOT
========================================================= */

export function askBolaBot(question) {
  if (!question || !question.trim()) {
    return "Digite alguma coisa para eu responder. 🤖";
  }

  const text = normalizeText(question);

  /* HELP */

  if (
    text.includes("ajuda") ||
    text.includes("o que voce") ||
    text.includes("o que pode") ||
    text === "menu"
  ) {
    return answerHelp();
  }

  /* SAUDAÇÕES */

  if (
    text === "oi" ||
    text === "ola" ||
    text === "eai" ||
    text === "e ae" ||
    text.includes("bom dia") ||
    text.includes("boa tarde") ||
    text.includes("boa noite")
  ) {
    return "Fala! 🤖⚽ Sou o BolaBot. Pergunta alguma coisa sobre a pelada!";
  }

  /* JOGADORES MENCIONADOS */

  const mentionedPlayers =
    findPlayersInQuestion(text);

  /* COMPARAÇÃO */

  if (
    mentionedPlayers.length >= 2 &&
    isComparisonQuestion(text)
  ) {
    return comparePlayers(
      mentionedPlayers[0],
      mentionedPlayers[1]
    );
  }

  /* ANÁLISE DA PARTIDA */

  if (isMatchAnalysisQuestion(text)) {
    return analyzeCurrentMatch();
  }

  /* ANÁLISE DO TIME */

  if (isTeamAnalysisQuestion(text)) {
    return answerBestTeam();
  }

  /* ANÁLISE DE JOGADOR */

  if (
    mentionedPlayers.length >= 1 &&
    isPlayerAnalysisQuestion(text)
  ) {
    return analyzePlayer(
      mentionedPlayers[0]
    );
  }

  /* MELHOR JOGADOR DO ANO / DO MÊS */

  if (
    text.includes("melhor do ano") ||
    text.includes("melhor no ano") ||
    text.includes("melhor jogador do ano") ||
    text.includes("melhor do anual")
  ) {
    return answerBestOfYear();
  }

  if (
    text.includes("melhor do mes") ||
    text.includes("melhor no mes") ||
    text.includes("melhor jogador do mes")
  ) {
    return answerBestOfMonth();
  }

  /* MELHOR JOGADOR DA PELADA */

  if (
    text.includes("quem esta jogando melhor") ||
    text.includes("quem ta jogando melhor") ||
    text.includes("quem joga melhor agora") ||
    text.includes("destaque da pelada")
  ) {
    return answerBestLivePlayer();
  }

  /* MAIS DECISIVO */

  if (
    text.includes("quem esta sendo mais decisivo") ||
    text.includes("quem ta sendo mais decisivo") ||
    text.includes("mais decisivo") ||
    text.includes("quem esta fazendo a diferenca") ||
    text.includes("quem ta fazendo a diferenca")
  ) {
    return answerMostDecisive();
  }

  /* MELHOR FASE */

  if (
    text.includes("quem esta em melhor fase") ||
    text.includes("quem ta em melhor fase") ||
    text.includes("melhor fase")
  ) {
    return answerEvolution();
  }

  /* MELHOR JOGADOR DO RANKING */

  if (
    text.includes("melhor jogador") ||
    text.includes("quem e o melhor") ||
    text.includes("melhor do ranking")
  ) {
    return answerRanking();
  }

  /* PIOR / GOLS / ASSISTÊNCIAS COM ESCOPO DE ANO OU MÊS */

  const periodScope = detectPeriodScope(text);

  if (periodScope) {
    if (
      text.includes("mais gols") ||
      text.includes("maior artilheiro") ||
      text.includes("artilheiro")
    ) {
      return answerGoals(periodScope);
    }

    if (
      text.includes("mais assistencias") ||
      text.includes("mais assistencia") ||
      text.includes("melhor assistente")
    ) {
      return answerAssists(periodScope);
    }

    if (
      text.includes("pior") ||
      text.includes("ultimo do ranking") ||
      text.includes("ultima do ranking")
    ) {
      return answerWorstPlayer(periodScope);
    }
  }

  /* PIOR JOGADOR */

  if (
    text.includes("pior jogador") ||
    text.includes("quem esta pior") ||
    text.includes("quem ta pior") ||
    text.includes("ultimo do ranking") ||
    text.includes("ultima do ranking")
  ) {
    return answerWorstPlayer();
  }

  /* GOLS */

  if (
    text.includes("mais gols") ||
    text.includes("maior artilheiro") ||
    text.includes("artilheiro")
  ) {
    return answerGoals();
  }

  /* ASSISTÊNCIAS */

  if (
    text.includes("mais assistencias") ||
    text.includes("mais assistencia") ||
    text.includes("melhor assistente")
  ) {
    return answerAssists();
  }

  /* EVOLUÇÃO */

  if (
    text.includes("evoluiu") ||
    text.includes("evolucao") ||
    text.includes("evoluiu mais") ||
    text.includes("mais evoluiu") ||
    text.includes("quem mais evoluiu") ||
    text.includes("quem evoluiu mais") ||
    text.includes("quem mais melhorou") ||
    text.includes("quem melhorou mais")
  ) {
    return answerEvolution();
  }

  /* ESTATÍSTICAS DO JOGADOR */

  if (
    mentionedPlayers.length >= 1 &&
    (
      text.includes("dados") ||
      text.includes("estatistica") ||
      text.includes("estatisticas") ||
      text.includes("como esta") ||
      text.includes("como ele esta") ||
      text.includes("numeros")
    )
  ) {
    return answerStats(
      mentionedPlayers[0].name
    );
  }

  /* FALLBACK */

  return `🤔 Ainda não sei responder isso.

Você pode tentar:

• "Quem está jogando melhor?"
• "Quem está sendo mais decisivo?"
• "Analisa essa partida"
• "Qual time está melhor?"
• "Analisa o Lucas"
• "Lucas ou Djavan?"
• "Quem está em melhor fase?"
• "Quem mais evoluiu esse mês?"
• "Quem foi o melhor do ano? / do mês?"
• "Quem fez mais gols no ano? / no mês?"
• "Quem deu mais assistências no ano? / no mês?"
• "Quem foi o pior do ano? / do mês?"

Também posso responder perguntas sobre ranking, gols e assistências. 🤖`;
}