/**
 * Team Balancer & Suggestions Service for BolaBate+
 */

const AVG_STAR_TARGET = 4.0; // assumed average player rating, used to derive the target team total

/**
 * Auto-balances players into K teams of `teamSize` players targeting ~(teamSize * 4★) per team.
 * Uses a greedy snake draft followed by pairwise swap optimization.
 */
export function autoBalanceTeams(players, teamCount = 4, teamSize = 5) {
  const k = Math.max(3, Math.min(6, teamCount));
  const totalSlotsNeeded = k * teamSize;
  const targetStars = teamSize * AVG_STAR_TARGET;

    // Clone and shuffle players before sorting by stars.
  // This randomizes the order of players with equal star ratings.
  const pool = [...players];

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Sort players descending by stars.
  // Players with equal stars keep their randomized order.
  pool.sort((a, b) => b.stars - a.stars);

  // Only keep enough players to fill all available team slots.
  pool.splice(totalSlotsNeeded);
 
  // Initialize K teams
  const teams = Array.from({ length: k }, (_, i) => ({
    teamIndex: i,
    players: [],
    totalStars: 0
  }));

  // Step 1: Snake Draft distribution
  // Round 1: 0, 1, 2... k-1
  // Round 2: k-1, ... 1, 0
  // Round 3: 0, 1, ...
  let currentDir = 1;
  let teamIdx = 0;

  for (let i = 0; i < pool.length; i++) {
    const player = pool[i];
    teams[teamIdx].players.push(player);
    teams[teamIdx].totalStars += player.stars;

    if (currentDir === 1) {
      if (teamIdx === k - 1) {
        currentDir = -1;
      } else {
        teamIdx++;
      }
    } else {
      if (teamIdx === 0) {
        currentDir = 1;
      } else {
        teamIdx--;
      }
    }
  }

  // Step 2: Optimization via local swaps (Hill Climbing)
  // Target: minimize variance from targetStars and minimize max - min star difference
  function evaluateScore(tms) {
    let score = 0;
    const target = targetStars;
    for (const t of tms) {
      score += Math.pow(t.totalStars - target, 2);
    }
    return score;
  }

  let improved = true;
  let iterations = 0;
  const maxIterations = 300;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    let bestScore = evaluateScore(teams);

    // Try swapping one player between any two teams
    for (let tA = 0; tA < k; tA++) {
      for (let tB = tA + 1; tB < k; tB++) {
        for (let pA = 0; pA < teams[tA].players.length; pA++) {
          for (let pB = 0; pB < teams[tB].players.length; pB++) {
            const playerA = teams[tA].players[pA];
            const playerB = teams[tB].players[pB];

            if (playerA.stars === playerB.stars) continue;

            // Tentative swap
            teams[tA].totalStars = teams[tA].totalStars - playerA.stars + playerB.stars;
            teams[tB].totalStars = teams[tB].totalStars - playerB.stars + playerA.stars;

            const newScore = evaluateScore(teams);

            if (newScore < bestScore - 0.001) {
              // Apply swap
              teams[tA].players[pA] = playerB;
              teams[tB].players[pB] = playerA;
              bestScore = newScore;
              improved = true;
              break;
            } else {
              // Revert
              teams[tA].totalStars = teams[tA].totalStars - playerB.stars + playerA.stars;
              teams[tB].totalStars = teams[tB].totalStars - playerA.stars + playerB.stars;
            }
          }
          if (improved) break;
        }
        if (improved) break;
      }
      if (improved) break;
    }
  }

  return teams.map(t => ({
    playerIds: t.players.map(p => p.id),
    totalStars: Number(t.totalStars.toFixed(1))
  }));
}

/**
 * Distributes players into K teams of `teamSize` purely at random (no star balancing).
 * Used for the initial team assembly; users can still rebalance manually or
 * with the "Equilibrar Automaticamente" button.
 */
export function randomizeTeams(players, teamCount = 4, teamSize = 5) {
  const k = Math.max(3, Math.min(6, teamCount));
  const totalSlotsNeeded = k * teamSize;

  // Clone the pool and shuffle with Fisher–Yates
  const pool = [...players].slice(0, totalSlotsNeeded);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Round-robin deal so every team gets a fair share of players
  const teams = Array.from({ length: k }, (_, i) => ({
    teamIndex: i,
    players: [],
    totalStars: 0
  }));

  pool.forEach((player, i) => {
    const team = teams[i % k];
    team.players.push(player);
    team.totalStars += player.stars;
  });

  return teams.map(t => ({
    playerIds: t.players.map(p => p.id),
    totalStars: Number(t.totalStars.toFixed(1))
  }));
}

/**
 * Gives smart player suggestions to fill remaining slots in a team to get as close as possible
 * to the target star total (teamSize * 4★).
 *
 * @param {Array} currentTeamPlayers - Players currently in the team (1 to teamSize-1 players)
 * @param {Array} availablePlayers - Unassigned players who are present
 * @param {number} teamSize - Players per team (5 or 6)
 * @returns {Array} List of suggestions ranked by how close they bring the team to the star goal
 */
export function getSmartSuggestions(currentTeamPlayers, availablePlayers, teamSize = 5) {
  const currentCount = currentTeamPlayers.length;
  if (currentCount === 0 || currentCount >= teamSize || availablePlayers.length === 0) {
    return [];
  }

  const currentStars = currentTeamPlayers.reduce((acc, p) => acc + Number(p.stars), 0);
  const remainingSlots = teamSize - currentCount;
  const targetTotal = teamSize * AVG_STAR_TARGET;
  const remainingBudget = targetTotal - currentStars;
  const idealStarPerPlayer = remainingBudget / remainingSlots;

  // Rank available players by proximity to idealStarPerPlayer
  const scored = availablePlayers.map(player => {
    const diff = Math.abs(player.stars - idealStarPerPlayer);
    const projectedTotal = currentStars + player.stars;
    const projectedRemainingSlots = remainingSlots - 1;
    let projectedFinalIfAvg = projectedTotal;
    if (projectedRemainingSlots > 0) {
      projectedFinalIfAvg += projectedRemainingSlots * AVG_STAR_TARGET;
    }

    return {
      player,
      diff,
      projectedFinal: Number(projectedFinalIfAvg.toFixed(1)),
      reason: generateSuggestionReason(player.stars, idealStarPerPlayer, targetTotal)
    };
  });

  // Sort by smallest difference to the ideal star requirement
  scored.sort((a, b) => a.diff - b.diff);

  return scored.slice(0, 4); // return top 4 best matches
}

function generateSuggestionReason(playerStars, idealStar, targetTotal) {
  const diff = playerStars - idealStar;
  if (Math.abs(diff) <= 0.3) {
    return `Encaixe ideal para atingir ~${targetTotal}★`;
  } else if (diff > 0.3) {
    return 'Eleva o nível do time (+força)';
  } else {
    return 'Equilibra o teto de estrelas';
  }
}

/**
 * Suggests a player from other teams to complete a team when someone leaves early.
 * Tries to find another player whose rating closely matches the departing player.
 *
 * @param {Object} departingPlayer - The player leaving
 * @param {Array} candidatePlayers - Players from other teams who can act as guest
 * @returns {Array} Ranked list of candidate replacements
 */
export function getSubstituteSuggestions(departingPlayer, candidatePlayers) {
  if (!departingPlayer || !candidatePlayers || candidatePlayers.length === 0) return [];

  const targetStars = departingPlayer.stars;

  const candidates = candidatePlayers.map(p => ({
    player: p,
    diff: Math.abs(p.stars - targetStars),
    note: p.stars === targetStars
      ? 'Equilíbrio idêntico (' + p.stars + '★)'
      : (p.stars > targetStars ? 'Pouco mais forte (+0.5★)' : 'Pouco mais leve (-0.5★)')
  }));

  candidates.sort((a, b) => a.diff - b.diff);
  return candidates.slice(0, 5);
}
