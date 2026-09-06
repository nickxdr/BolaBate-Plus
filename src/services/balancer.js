/**
 * Team Balancer & Suggestions Service for BolaBate+
 */

/**
 * Auto-balances players into K teams of 5 players targeting ~20 stars per team.
 * Uses a greedy snake draft followed by pairwise swap optimization.
 */
export function autoBalanceTeams(players, teamCount = 4) {
  const k = Math.max(3, Math.min(6, teamCount));
  const totalSlotsNeeded = k * 5;

  // Clone and sort players descending by stars
  const pool = [...players].sort((a, b) => b.stars - a.stars).slice(0, totalSlotsNeeded);

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
  // Target: minimize variance from 20.0 stars and minimize max - min star difference
  function evaluateScore(tms) {
    let score = 0;
    const target = 20.0;
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
 * Gives smart player suggestions to fill remaining slots in a team to get as close as possible to 20 stars.
 *
 * @param {Array} currentTeamPlayers - Players currently in the team (1 to 4 players)
 * @param {Array} availablePlayers - Unassigned players who are present
 * @returns {Array} List of suggestions ranked by how close they bring the team to the ~20★ goal
 */
export function getSmartSuggestions(currentTeamPlayers, availablePlayers) {
  const currentCount = currentTeamPlayers.length;
  if (currentCount === 0 || currentCount >= 5 || availablePlayers.length === 0) {
    return [];
  }

  const currentStars = currentTeamPlayers.reduce((acc, p) => acc + Number(p.stars), 0);
  const remainingSlots = 5 - currentCount;
  const targetTotal = 20.0;
  const remainingBudget = targetTotal - currentStars;
  const idealStarPerPlayer = remainingBudget / remainingSlots;

  // Rank available players by proximity to idealStarPerPlayer
  const scored = availablePlayers.map(player => {
    const diff = Math.abs(player.stars - idealStarPerPlayer);
    const projectedTotal = currentStars + player.stars;
    const projectedRemainingSlots = remainingSlots - 1;
    let projectedFinalIfAvg = projectedTotal;
    if (projectedRemainingSlots > 0) {
      projectedFinalIfAvg += projectedRemainingSlots * 4.0; // Assume 4.0 average for remaining
    }

    return {
      player,
      diff,
      projectedFinal: Number(projectedFinalIfAvg.toFixed(1)),
      reason: generateSuggestionReason(player.stars, idealStarPerPlayer, remainingSlots)
    };
  });

  // Sort by smallest difference to the ideal star requirement
  scored.sort((a, b) => a.diff - b.diff);

  return scored.slice(0, 4); // return top 4 best matches
}

function generateSuggestionReason(playerStars, idealStar, remainingSlots) {
  const diff = playerStars - idealStar;
  if (Math.abs(diff) <= 0.3) {
    return 'Encaixe ideal para atingir ~20★';
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
