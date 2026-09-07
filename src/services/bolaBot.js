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

function answerHelp() {
  return `🤖 **Fala! Eu sou o BolaBot.**

Posso analisar os dados da BolaBate+ e responder coisas como:

⚽ Quem fez mais gols?
🎯 Quem deu mais assistências?
👑 Quem é o melhor jogador?
📉 Quem está pior no ranking?
📊 Mostre os dados de um jogador.

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
      text.includes("dados") ||
      text.includes("estatistica") ||
      text.includes("estatisticas") ||
      text.includes("como esta") ||
      text.includes("como ele esta") ||
      text.includes("desempenho")
    )
  ) {
    return answerStats(mentionedPlayer.name);
  }

  // Players Joke
  for (const joke of PLAYER_JOKES) {
    if (joke.triggers.some(trigger => text.includes(trigger))) {
      return joke.response;
  }
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

  // Teams
  if (
    text.includes("monta dois times") ||
    text.includes("montar dois times") ||
    text.includes("times equilibrados") ||
    text.includes("dois times equilibrados")
  ) {
    return `⚽ Posso montar os times equilibrados usando as estrelas dos jogadores.

Essa parte vai ser conectada ao seu **balancer.js** no próximo passo.`;
  }

  // Best team
  if (
    text.includes("time ideal") ||
    text.includes("melhor time")
  ) {
    return `🏆 Para montar o time ideal, vou analisar estrelas, desempenho e histórico dos jogadores.

Essa função entra na próxima etapa do BolaBot.`;
  }

  // Evolution
  if (
    text.includes("evoluiu") ||
    text.includes("evolucao") ||
    text.includes("evoluiu mais")
  ) {
    return `📈 Posso analisar a evolução mensal dos jogadores usando o histórico da BolaBate+.

Vou conectar essa função ao **periodStats.js** na próxima etapa.`;
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
• "Mostre os dados do jogador"

Estou aprendendo novas funções ainda. 🤖`;

}

const PLAYER_JOKES = [
  {
    triggers: ["djavan", "djava"],
    response:
      "KKKKKKKK, esse é o maior miserável que temos. 🤣 Ninguém quer jogar junto com esse homem. Djavan, faz um favor pra rapaziada: fica em casa hoje. 🫡⚽"
  },

  {
    triggers: ["aguiar"],
    response:
      "KKKKKKKK, o Aguiar é simplesmente PICUDO. 🗿🍆 O homem não perdoa ninguém. Respeita o homem! 🫡⚽"
  },

  {
    triggers: ["barbeiro"],
    response:
      "KKKKKKKK, o Barbeiro é o famoso cortador de pentelho da galera. ✂️🤣 Habilidoido!. 🫡⚽"
  },

  {
    triggers: ["felipe"],
    response:
      "KKKKKKKK, o Felipe é SUSPEITO demais. 🐔🤣 No ranking ele tá sempre de 4... lá ele! 💀⚽"
  }
];