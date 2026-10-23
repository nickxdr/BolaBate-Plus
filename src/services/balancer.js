/**
 * Team Balancer & Suggestions Service for BolaBate+
 */

const AVG_STAR_TARGET = 4.0; // assumed average player rating, used to derive the target team total

// How many teams a pelada can have. Two is the floor: a pelada needs at least two sides
// to produce a confrontation, but it no longer requires the classic three.
export const MIN_TEAM_COUNT = 2;
export const MAX_TEAM_COUNT = 6;

/**
 * Keeps a team count inside the supported range — the single source of truth for the clamp.
 * The admin's chosen count is preserved even when attendance is short: empty team slots
 * stay in place until they are filled, so the pelada can start with fewer playable teams.
 */
export function clampTeamCount(teamCount) {
  const n = Number(teamCount);
  return Number.isFinite(n)
    ? Math.max(MIN_TEAM_COUNT, Math.min(MAX_TEAM_COUNT, Math.round(n)))
    : MIN_TEAM_COUNT;
}

/**
 * Smallest headcount that can field a pelada at all: one player per team, and the
 * floor is MIN_TEAM_COUNT teams — so two players are enough for a two-team pelada.
 */
export function minPeladaPlayers() {
  return MIN_TEAM_COUNT;
}

/**
 * Splits a list of player ids into `teamCount` groups of nearly equal size — every
 * group gets at least one player as long as there are enough players to go around.
 * Used to redistribute players across existing (possibly underfilled) teams without
 * leaving any team empty.
 */
export function redistributePlayers(playerIds, teamCount) {
  const ids = playerIds || [];
  const k = Math.max(1, Math.round(Number(teamCount) || 1));
  const base = Math.floor(ids.length / k);
  const remainder = ids.length % k;
  let cursor = 0;
  return Array.from({ length: k }, (_, i) => {
    const size = base + (i < remainder ? 1 : 0);
    const group = ids.slice(cursor, cursor + size);
    cursor += size;
    return group;
  });
}

/**
 * Validates that a pelada can go live. Teams may be empty (the admin fills them later,
 * directly from the live screen), but at least MIN_TEAM_COUNT teams must already have a
 * player so the first confrontation can happen.
 *
 * @param {Array} teams - The pelada's teams, each with a `playerIds` array
 * @returns {{ success: boolean, error?: string, emptyTeamNames?: string[] }}
 */
export function validateTeamsForLiveStart(teams) {
  const list = Array.isArray(teams) ? teams : [];
  const emptyTeams = list.filter((t) => !(t.playerIds || []).length);
  const playableCount = list.length - emptyTeams.length;
  if (playableCount < MIN_TEAM_COUNT) {
    return {
      success: false,
      error: `A pelada precisa de pelo menos ${MIN_TEAM_COUNT} times com jogadores para começar.`,
      emptyTeamNames: emptyTeams.map((t) => t.name || 'Time'),
    };
  }
  return {
    success: true,
    emptyTeamNames: emptyTeams.map((t) => t.name || 'Time'),
  };
}

/**
 * Validates that a pelada can be set up: at least MIN_TEAM_COUNT players are needed
 * (one per side). The chosen team count is preserved even when there are fewer players
 * than teams — the extra teams simply start empty.
 *
 * @param {number} teamCount - The admin's chosen team count
 * @param {number} playerCount - How many players are present
 * @returns {{ success: boolean, error?: string, teamCount?: number }}
 */
export function validateSetupForPelada(teamCount, playerCount) {
  if (playerCount < MIN_TEAM_COUNT) {
    return {
      success: false,
      error: `É preciso pelo menos ${MIN_TEAM_COUNT} jogadores para começar a pelada.`,
    };
  }
  return {
    success: true,
    teamCount: clampTeamCount(teamCount),
  };
}

/**
 * Auto-balances players into K teams of `teamSize` players targeting ~(teamSize * 4★) per team.
 * Uses a greedy snake draft followed by pairwise swap optimization.
 */
export function autoBalanceTeams(players, teamCount = 4, teamSize = 5) {
  const k = clampTeamCount(teamCount);
  const totalSlotsNeeded = k * teamSize;

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

  // Teams may be underfilled (as few as one player each), so the star goal follows the
  // headcount each team actually ends up with — not the full `teamSize`. The average
  // is fractional on purpose: with 26 players over 6 teams the sides are 5/4/4/4/4/5,
  // and ~17★ is the fair midpoint for all of them.
  const playersPerTeam = pool.length / k;
  const targetStars = playersPerTeam * AVG_STAR_TARGET;
 
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
  // Keep the admin's chosen number of teams — extra teams may start empty and are
  // filled later from the live screen.
  const k = clampTeamCount(teamCount);
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
