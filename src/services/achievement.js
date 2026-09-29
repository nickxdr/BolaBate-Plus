import { store, isGoalkeeper } from "../state/store.js";
import {
  compareGoalkeepers,
  GOALKEEPER_MIN_PELADAS_FOR_BEST,
} from "./periodStats.js";

/** Most saves a goalkeeper made in a single pelada where their stats counted (not as diarista). */
function getBestSinglePeladaSaves(playerId) {
  let best = 0;
  (store.history || []).forEach((entry) => {
    if (!(entry.goalkeeperIds || []).includes(playerId)) return;
    if ((entry.diaristaPlayerIds || []).includes(playerId)) return;
    const saves = Number(entry.stats?.[playerId]?.saves) || 0;
    if (saves > best) best = saves;
  });
  return best;
}

/** Months in which this keeper was the best goalkeeper (min. peladas in goal that month). */
function getGoldenGloveCount(playerId) {
  let count = 0;
  Object.values(store.monthlyStats || {}).forEach((period) => {
    const eligible = Object.entries(period?.players || {})
      .filter(([, stats]) => (Number(stats.gkParticipacao) || 0) >= GOALKEEPER_MIN_PELADAS_FOR_BEST);
    if (!eligible.length) return;
    eligible.sort(([, a], [, b]) => compareGoalkeepers(a, b));
    const best = eligible[0][1];
    const winners = eligible.filter(([, stats]) => compareGoalkeepers(stats, best) === 0);
    if (winners.some(([pid]) => pid === playerId)) count += 1;
  });
  return count;
}

/** Highest number of goals a player has scored in a single pelada. */
function getBestSingleMatchGoals(playerId) {
  let best = 0;
  (store.history || []).forEach((entry) => {
    const goals = Number(entry.stats?.[playerId]?.goals) || 0;
    if (goals > best) best = goals;
  });
  return best;
}

export const ACHIEVEMENTS = [
  {
    id: "first-goal",
    name: "Primeiro Gol",
    icon: "⚽",
    description: "Marque seu primeiro gol",
    target: 1,
    getProgress: (player) => player.goals,
  },

  {
    id: "top-scorer",
    name: "Artilheiro",
    icon: "⚽",
    description: "Marque 10 gols",
    target: 10,
    getProgress: (player) => player.goals,
  },

  {
    id: "goal-machine",
    name: "Máquina de Gols",
    icon: "🔥",
    description: "Marque 25 gols",
    target: 25,
    getProgress: (player) => player.goals,
  },

  {
    id: "first-assist",
    name: "Primeira Assistência",
    icon: "🎯",
    description: "Dê sua primeira assistência",
    target: 1,
    getProgress: (player) => player.assists,
  },

  {
    id: "playmaker",
    name: "Garçom",
    icon: "🎯",
    description: "Dê 10 assistências",
    target: 10,
    getProgress: (player) => player.assists,
  },

  {
    id: "veteran",
    name: "Veterano",
    icon: "🏟️",
    description: "Participe de 25 peladas",
    target: 25,
    getProgress: (player) => player.participacao,
  },

  {
    id: "legend",
    name: "Lenda",
    icon: "👑",
    description: "Participe de 50 peladas",
    target: 50,
    getProgress: (player) => player.participacao,
  },

  {
    id: "craque",
    name: "Craque da Pelada",
    icon: "👑",
    description: "Seja eleito Craque 5 vezes",
    target: 5,
    getProgress: (player) => player.craque,
  },

  {
    id: "puskas",
    name: "Golaço!",
    icon: "💎",
    description: "Ganhe 3 prêmios Puskás",
    target: 3,
    getProgress: (player) => player.puskas,
  },

  {
    id: "selecao",
    name: "Seleção",
    icon: "🇧🇷",
    description: "Entre na Seleção 5 vezes",
    target: 5,
    getProgress: (player) => player.selecao,
  },

  {
    id: "puskas-que-pariu",
    name: "Puskas que pariu",
    icon: "💎",
    description: "Ganhe 10 prêmios Puskás",
    target: 10,
    getProgress: (player) => player.puskas,
  },

  {
    id: "modo-kdb",
    name: "Modo De Bruyne",
    icon: "🎯",
    description: "Dê 25 assistências",
    target: 25,
    getProgress: (player) => player.assists,
  },

  {
    id: "hat-trick",
    name: "Hat-Trick",
    icon: "🎩",
    description: "Marque 3 ou mais gols em uma mesma pelada",
    target: 3,
    getProgress: (player, playerId) => getBestSingleMatchGoals(playerId),
  },

  {
    id: "pele-maradona",
    name: "Só Pelé.",
    icon: "🐐",
    description: "Marque 1000 gols",
    target: 1000,
    getProgress: (player) => player.goals,
  },

  // --- Goalkeepers (scope: "gk" — shown only to players registered as "Goleiro") ---
  {
    id: "gk-first-save",
    scope: "gk",
    name: "Primeira Defesa",
    icon: "🧤",
    description: "Faça sua primeira defesa",
    target: 1,
    getProgress: (player) => player.saves,
  },

  {
    id: "gk-paredao",
    scope: "gk",
    name: "Paredão",
    icon: "🧱",
    description: "Faça 10 defesas em uma mesma pelada",
    target: 10,
    getProgress: (player, playerId) => getBestSinglePeladaSaves(playerId),
  },

  {
    id: "gk-muralha",
    scope: "gk",
    name: "Muralha",
    icon: "🏰",
    description: "Faça 100 defesas",
    target: 100,
    getProgress: (player) => player.saves,
  },

  {
    id: "gk-first-clean-sheet",
    scope: "gk",
    name: "Fechou o Gol",
    icon: "🔒",
    description: "Termine uma partida sem sofrer gol",
    target: 1,
    getProgress: (player) => player.cleanSheets,
  },

  {
    id: "gk-invicto",
    scope: "gk",
    name: "Invicto",
    icon: "🛡️",
    description: "Termine 10 partidas sem sofrer gol",
    target: 10,
    getProgress: (player) => player.cleanSheets,
  },

  {
    id: "gk-winner",
    scope: "gk",
    name: "Goleiro Vencedor",
    icon: "🏆",
    description: "Vença 25 partidas no gol",
    target: 25,
    getProgress: (player) => player.gkWins,
  },

  {
    id: "gk-experienced",
    scope: "gk",
    name: "Luvas Experientes",
    icon: "🥅",
    description: "Jogue 10 peladas no gol",
    target: 10,
    getProgress: (player) => player.gkParticipacao,
  },

  {
    id: "gk-legend",
    scope: "gk",
    name: "Lenda do Gol",
    icon: "👑",
    description: "Jogue 50 peladas no gol",
    target: 50,
    getProgress: (player) => player.gkParticipacao,
  },

  {
    id: "gk-golden-glove",
    scope: "gk",
    name: "Luva de Ouro",
    icon: "🥇",
    description: `Seja o melhor goleiro de um mês (mínimo de ${GOALKEEPER_MIN_PELADAS_FOR_BEST} peladas no gol)`,
    target: 1,
    getProgress: (player, playerId) => getGoldenGloveCount(playerId),
  },
];

export function getPlayerAchievements(playerId) {
  const player = store.getPlayer(playerId);

  if (!player) return [];

  // Goalkeepers see only goalkeeper achievements; everyone else only the outfield ones.
  const scope = isGoalkeeper(player) ? "gk" : "outfield";

  return ACHIEVEMENTS.filter((achievement) => (achievement.scope || "outfield") === scope).map((achievement) => {
    const progress = Number(achievement.getProgress(player, playerId)) || 0;

    return {
      ...achievement,
      progress,
      unlocked: progress >= achievement.target,
    };
  });
}
