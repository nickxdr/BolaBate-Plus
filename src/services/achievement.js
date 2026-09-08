import { store } from "../state/store.js";

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
];

export function getPlayerAchievements(playerId) {
  const player = store.getPlayer(playerId);

  if (!player) return [];

  return ACHIEVEMENTS.map((achievement) => {
    const progress = Number(achievement.getProgress(player, playerId)) || 0;

    return {
      ...achievement,
      progress,
      unlocked: progress >= achievement.target,
    };
  });
}
