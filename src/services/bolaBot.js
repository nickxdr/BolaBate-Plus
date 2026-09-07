import { store } from "../state/store.js";

/**
 * BolaBot
 * BolaBate local intelligence+
 *
 * Answer questions using real data from store.
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


function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getRankingScore(player) {
  return (
    (player.goals || 0) * RANKING_WEIGHTS.goals +
    (player.assists || 0) * RANKING_WEIGHTS.assists +
    (player.selecao || 0) * RANKING_WEIGHTS.selecao +
    (player.puskas || 0) * RANKING_WEIGHTS.puskas +
    (player.craque || 0) * RANKING_WEIGHTS.craque -
    (player.bagre || 0) * 3 +
    (player.participacao || 0)
  );
}

function getPlayers() {
  return Array.isArray(store.players) ? store.players : [];
}

function getBestPlayer() {
  const players = getPlayers();

  if (!players.length) return null;

  return [...players].sort(
    (a, b) => getRankingScore(b) - getRankingScore(a)
  )[0];
}

function getWorstPlayer() {
  const players = getPlayers();

  if (!players.length) return null;

  return [...players].sort(
    (a, b) => getRankingScore(a) - getRankingScore(b)
  )[0];
}

function getTopScorer() {
  const players = getPlayers();

  if (!players.length) return null;

  return [...players].sort(
    (a, b) => (b.goals || 0) - (a.goals || 0)
  )[0];
}

function getTopAssist() {
  const players = getPlayers();

  if (!players.length) return null;

  return [...players].sort(
    (a, b) => (b.assists || 0) - (a.assists || 0)
  )[0];
}

function formatPlayerName(player) {
  return player?.name || "Ninguém";
}

function answerRanking() {
  const player = getBestPlayer();

  if (!player) {
    return "Ainda não tenho jogadores suficientes para analisar o ranking.";
  }

  const score = getRankingScore(player);

  return `👑 O melhor jogador atualmente é **${formatPlayerName(
    player
  )}**, com ${score} pontos no ranking.`;
}

function answerWorstPlayer() {
  const player = getWorstPlayer();

  if (!player) {
    return "Ainda não tenho jogadores suficientes para analisar o ranking.";
  }

  const score = getRankingScore(player);

  return `📉 Atualmente, **${formatPlayerName(
    player
  )}** está na última posição do ranking, com ${score} pontos.`;
}

function answerGoals() {
  const player = getTopScorer();

  if (!player) {
    return "Ainda não tenho dados de gols.";
  }

  return `⚽ Quem mais fez gols é **${formatPlayerName(player)}**, com ${
    player.goals || 0
  } gol${player.goals === 1 ? "" : "s"}.`;
}

function answerAssists() {
  const player = getTopAssist();

  if (!player) {
    return "Ainda não tenho dados de assistências.";
  }

  return `🎯 Quem mais deu assistências é **${formatPlayerName(
    player
  )}**, com ${player.assists || 0} assistência${
    player.assists === 1 ? "" : "s"
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


/**
 * Get previous month from YYYY-MM.
 */
function getPreviousPeriodKey(key) {
  const [year, month] = String(key).split("-").map(Number);

  if (!year || !month) return null;

  if (month === 1) {
    return `${year - 1}-12`;
  }

  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

/**
 * Calculate ranking score using period statistics.
 */
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

/**
 * Get evolution of all players between two periods.
 */
function getPlayersEvolution(currentKey, previousKey) {
  const currentPeriod = store.monthlyStats?.[currentKey];
  const previousPeriod = store.monthlyStats?.[previousKey];

  if (!currentPeriod) return [];

  const players = getPlayers();

  return players.map((player) => {
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
      currentScore,
      previousScore,
      evolution: currentScore - previousScore
    };
  });
}

/**
 * Find the player who evolved the most.
 */
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

/**
 * Answer who evolved the most this month.
 */
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

/**
 * Answer evolution of a specific player.
 */
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

function answerHelp() {
  return `🤖 **Fala! Eu sou o BolaBot.**

Posso analisar os dados da BolaBate+ e responder coisas como:

⚽ Quem fez mais gols?
🎯 Quem deu mais assistências?
👑 Quem é o melhor jogador?
📉 Quem está pior no ranking?
📊 Mostre os dados de um jogador.
📈 Quem mais evoluiu esse mês?
🔥 Como o jogador X evoluiu?

Em breve também vou conseguir montar times e analisar evolução dos jogadores.`;
}

/**
 * Try to find a player in question.
 */
function findPlayerInQuestion(text) {
  const players = getPlayers();

  return players.find((player) =>
    text.includes(normalizeText(player.name))
  );
}

/**
 * BolaBot Main Function.
 */
export function askBolaBot(question) {
  if (!question || !question.trim()) {
    return "Digite alguma coisa para eu responder. 🤖";
  }

  const text = normalizeText(question);


  // Help
  if (
    text.includes("ajuda") ||
    text.includes("o que voce") ||
    text.includes("o que pode") ||
    text === "menu"
  ) {
    return answerHelp();
  }

  // Ask about specific player
  const mentionedPlayer = findPlayerInQuestion(text);

  if (
    mentionedPlayer &&
    (
      text.includes("evoluiu") ||
      text.includes("evolucao") ||
      text.includes("melhorou") ||
      text.includes("desempenho esse mes") ||
      text.includes("desempenho neste mes")
    )
  ) {
    return answerPlayerEvolution(mentionedPlayer);
  }

  if (
    mentionedPlayer &&
    (
      text.includes("dados") ||
      text.includes("estatistica") ||
      text.includes("estatisticas") ||
      text.includes("como esta") ||
      text.includes("como ele esta") ||
      text.includes("desempenho") ||
      text.includes("numeros")
    )
  ) {
    return answerStats(mentionedPlayer.name);
  }

  // Best player 
  if (
    text.includes("melhor jogador") ||
    text.includes("quem e o melhor") ||
    text.includes("melhor do ranking")
  ) {
    return answerRanking();
  }

  // Worst player 
  if (
    text.includes("pior jogador") ||
    text.includes("quem esta pior") ||
    text.includes("quem ta pior") ||
    text.includes("ultimo do ranking") ||
    text.includes("ultima do ranking")
  ) {
    return answerWorstPlayer();
  }

  // Goals
  if (
    text.includes("mais gols") ||
    text.includes("maior artilheiro") ||
    text.includes("artilheiro")
  ) {
    return answerGoals();
  }

  // Assists
  if (
    text.includes("mais assistencias") ||
    text.includes("mais assistencia") ||
    text.includes("melhor assistente")
  ) {
    return answerAssists();
  }

  // Evolution
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

  // Greetings 
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

  return `🤔 Ainda não sei responder isso.

Tenta perguntar:

• "Quem é o melhor jogador?"
• "Quem fez mais gols?"
• "Quem deu mais assistências?"
• "Quem está pior no ranking?"
• "Quem mais evoluiu esse mês?"
• "Como o Djavan evoluiu?"
• "Mostre os dados do jogador"

Estou aprendendo novas funções ainda. 🤖`;

}
