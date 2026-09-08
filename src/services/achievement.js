import { store } from '../state/store.js';

export const ACHIEVEMENTS = [
  {
    id: 'first-goal',
    name: 'Primeiro Gol',
    icon: '⚽',
    description: 'Marque seu primeiro gol',
    target: 1,
    getProgress: player => player.goals
  },

  {
    id: 'top-scorer',
    name: 'Artilheiro',
    icon: '⚽',
    description: 'Marque 10 gols',
    target: 10,
    getProgress: player => player.goals
  },

  {
    id: 'goal-machine',
    name: 'Máquina de Gols',
    icon: '🔥',
    description: 'Marque 25 gols',
    target: 25,
    getProgress: player => player.goals
  },

  {
    id: 'first-assist',
    name: 'Primeira Assistência',
    icon: '🎯',
    description: 'Dê sua primeira assistência',
    target: 1,
    getProgress: player => player.assists
  },

  {
    id: 'playmaker',
    name: 'Garçom',
    icon: '🎯',
    description: 'Dê 10 assistências',
    target: 10,
    getProgress: player => player.assists
  },

  {
    id: 'veteran',
    name: 'Veterano',
    icon: '🏟️',
    description: 'Participe de 25 peladas',
    target: 25,
    getProgress: player => player.participacao
  },

  {
    id: 'legend',
    name: 'Lenda',
    icon: '👑',
    description: 'Participe de 50 peladas',
    target: 50,
    getProgress: player => player.participacao
  },

  {
    id: 'craque',
    name: 'Craque da Pelada',
    icon: '👑',
    description: 'Seja eleito Craque 5 vezes',
    target: 5,
    getProgress: player => player.craque
  },

  {
    id: 'puskas',
    name: 'Momento Puskás',
    icon: '💎',
    description: 'Ganhe 3 prêmios Puskás',
    target: 3,
    getProgress: player => player.puskas
  },

  {
    id: 'selecao',
    name: 'Seleção',
    icon: '🇧🇷',
    description: 'Entre na Seleção 5 vezes',
    target: 5,
    getProgress: player => player.selecao
  }
];

export function getPlayerAchievements(playerId) {
  const player = store.getPlayer(playerId);

  if (!player) return [];

  return ACHIEVEMENTS.map(achievement => {
    const progress = Number(achievement.getProgress(player)) || 0;

    return {
      ...achievement,
      progress,
      unlocked: progress >= achievement.target
    };
  });
}