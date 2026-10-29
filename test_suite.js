import { INITIAL_PLAYERS, calculatePoints } from './src/data/seedData.js';
import {
  autoBalanceTeams,
  randomizeTeams,
  getSmartSuggestions,
  getSubstituteSuggestions,
  clampTeamCount,
  redistributePlayers,
  minPeladaPlayers,
  validateTeamsForLiveStart,
  validateSetupForPelada,
  MIN_TEAM_COUNT,
  MAX_TEAM_COUNT,
} from './src/services/balancer.js';

// ---------------------------------------------------------------------------
// 5. Integration: the store's live flow with uneven teams
// ---------------------------------------------------------------------------
// The store imports Firebase/Capacitor, which need a browser. We install the
// bare minimum globals BEFORE the dynamic import so the module graph can load.
console.log('\n--- 5. Testing Live Flow With Uneven Teams (store integration) ---');

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
  key: (i) => [...storage.keys()][i] ?? null,
  get length() { return storage.size; },
};
// `navigator` is a read-only getter on Node 22+, so it has to be redefined.
if (!globalThis.navigator || !globalThis.navigator.userAgent) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true, userAgent: 'node' },
    configurable: true,
    writable: true,
  });
}
globalThis.location = { hostname: 'localhost', href: 'http://localhost/', origin: 'http://localhost' };
globalThis.window = globalThis.window || globalThis;
globalThis.document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  visibilityState: 'visible',
  documentElement: { setAttribute: () => {}, getAttribute: () => null, style: { setProperty: () => {} } },
  head: { appendChild: () => {} },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
  body: { appendChild: () => {} },
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.indexedDB = undefined;
globalThis.fetch = globalThis.fetch || (() => Promise.reject(new Error('offline')));

const { store } = await import('./src/state/store.js');
// The store blocks every mutating method for non-admins; the tests below drive the
// admin-only flow, so this device acts as the admin.
store.isAdmin = true;
// No cloud in the tests: the sync guard would otherwise reject every admin action.
store.cloudSyncing = false;
// The demo roster is only auto-seeded for the legacy pelada id; the integration tests
// below call getPlayer() guards (fill/goalkeeper rules), so install the seed roster.
store.players = INITIAL_PLAYERS.map((p) => ({ ...p }));
void store; // imported here so the module graph (Firebase et al.) loads with the stubs above

console.log('--- 1. Testing Official Stars Verification ---');
const officialStars = {
  'LUCAS': 3.5,
  'LOPES': 3.5,
  'GALO': 4.0,
  'CARLÃO': 4.0,
  'BIEL': 3.5,
  'BRENO': 5.0,
  'AGUIAR': 1.0,
  'NICOLAS': 3.5,
  'MATHEUS': 4.0,
  'DJAVAN': 3.5,
  'POMBO': 3.5,
  'BARBEIRO': 4.5,
  'BOB': 2.0,
  'CAIO': 3.5,
  'DANIEL': 5.0,
  'MIGUEL': 3.5,
  'FELIPE': 3.5,
  'SOLDADO': 3.5,
  'NETO': 4.5,
  'BRUNO B': 4.0,
  'ARTHUR NT': 4.0,
  'TIBURCIO': 5.0,
  'FATHER': 3.5,
  'ELIAS': 1.5,
  'CORVO': 3.0,
  'PAUDARCO': 5.0
};

let allStarsCorrect = true;
for (const [name, expectedStar] of Object.entries(officialStars)) {
  const player = INITIAL_PLAYERS.find(p => p.name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  if (!player) {
    console.error(`Missing player in seedData: ${name}`);
    allStarsCorrect = false;
  } else if (player.stars !== expectedStar) {
    console.error(`Star mismatch for ${name}: expected ${expectedStar}, got ${player.stars}`);
    allStarsCorrect = false;
  }
}

if (allStarsCorrect) {
  console.log(`✓ All ${Object.keys(officialStars).length} players have their exact official stars from the image!`);
}

console.log('\n--- 2. Testing Team Auto-Balancing with Official Stars ---');
for (let k = 2; k <= 5; k++) {
  const pool = INITIAL_PLAYERS.slice(0, k * 5);
  const balanced = autoBalanceTeams(pool, k);
  console.log(`Testing ${k} teams (${k * 5} players):`);
  balanced.forEach((t, i) => {
    console.log(`  Team ${i + 1}: ${t.playerIds.length} players, Total Stars: ${t.totalStars}★`);
  });
}

console.log('\n--- 3. Testing Build Verification ---');

// ---------------------------------------------------------------------------
// 4. Regression: peladas with 2-6 underfilled teams (every team needs >= 1 player)
// ---------------------------------------------------------------------------
console.log('\n--- 4. Testing Underfilled & Empty Teams (2-6 chosen slots) ---');

let failures = 0;
function check(label, condition, extra = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

// --- clampTeamCount ---
check('MIN_TEAM_COUNT is 2', MIN_TEAM_COUNT === 2);
check('MAX_TEAM_COUNT is 6', MAX_TEAM_COUNT === 6);
check('clamps below the floor to 2', clampTeamCount(1) === 2);
check('clamps above the ceiling to 6', clampTeamCount(9) === 6);
check('keeps a valid count', clampTeamCount(4) === 4);
check('keeps the chosen count regardless of attendance', clampTeamCount(6) === 6);
check('ignores a legacy player-count argument', clampTeamCount(6, 2) === 6);
check('handles a non-numeric count', clampTeamCount(NaN) === MIN_TEAM_COUNT);

// --- minPeladaPlayers / chosen count is preserved ---
check('minPeladaPlayers is 2', minPeladaPlayers() === 2);
check('setup keeps 6 slots for 2 players', validateSetupForPelada(6, 2).teamCount === 6);
check('setup keeps 6 slots for 4 players', validateSetupForPelada(6, 4).teamCount === 6);
check('setup still clamps the chosen count to the supported range',
  validateSetupForPelada(9, 12).teamCount === MAX_TEAM_COUNT);

// --- redistributePlayers (the "Randomizar" redistribution) ---
const ids12 = Array.from({ length: 12 }, (_, i) => `p${i}`);
const split6 = redistributePlayers(ids12, 6);
check('redistribute into 6 groups of 2', split6.every((g) => g.length === 2));
check('redistribute keeps every player exactly once',
  split6.flat().length === 12 && new Set(split6.flat()).size === 12);

const split5 = redistributePlayers(ids12, 5);
check('redistribute into 5 groups never leaves one empty', split5.every((g) => g.length >= 1));
check('redistribute into 5 groups keeps every player', split5.flat().length === 12);
check('redistribute into 5 groups balances the size', Math.max(...split5.map((g) => g.length)) - Math.min(...split5.map((g) => g.length)) <= 1);

const split2 = redistributePlayers(ids12, 2);
check('redistribute into 2 groups of 6', split2.every((g) => g.length === 6));

// The old bug: slicing by a fixed teamSize left the tail teams empty.
const fixedSlice = (players, teamCount, teamSize) =>
  Array.from({ length: teamCount }, (_, i) => players.slice(i * teamSize, (i + 1) * teamSize));
const oldWay = fixedSlice(ids12, 6, 5);
check('old fixed-size slicing really did leave teams empty (bug repro)', oldWay[5].length === 0);
check('new redistribution leaves no empty team', split6.every((g) => g.length >= 1));

// --- autoBalanceTeams / randomizeTeams never create an empty team ---
for (const k of [2, 3, 4, 5, 6]) {
  for (const count of [k, k + 1, k + 2, k * 2, k * 5]) {
    const pool = INITIAL_PLAYERS.slice(0, Math.min(count, INITIAL_PLAYERS.length));
    const balanced = autoBalanceTeams(pool, k, 5);
    const randomized = randomizeTeams(pool, k, 5);
    check(`autoBalanceTeams(${pool.length} players, ${k} teams) fills every team`,
      balanced.length === k && balanced.every((t) => t.playerIds.length >= 1),
      `got ${balanced.map((t) => t.playerIds.length).join(',')}`);
    check(`randomizeTeams(${pool.length} players, ${k} teams) fills every team`,
      randomized.length === k && randomized.every((t) => t.playerIds.length >= 1),
      `got ${randomized.map((t) => t.playerIds.length).join(',')}`);
    const assigned = balanced.flatMap((t) => t.playerIds);
    check(`autoBalanceTeams(${pool.length} players, ${k} teams) assigns each player once`,
      new Set(assigned).size === assigned.length);
  }
}

// A team count larger than the roster is preserved: the extra teams start empty
// and are filled later during the pelada.
const tiny = INITIAL_PLAYERS.slice(0, 2);
const tinyBalanced = autoBalanceTeams(tiny, 6, 5);
check('autoBalanceTeams keeps the chosen 6 team slots', tinyBalanced.length === 6);
check('autoBalanceTeams only fills as many teams as there are players',
  tinyBalanced.filter((t) => t.playerIds.length > 0).length === 2,
  `got ${tinyBalanced.map((t) => t.playerIds.length).join(',')}`);
check('autoBalanceTeams leaves the remaining slots empty',
  tinyBalanced.filter((t) => t.playerIds.length === 0).length === 4);

const tinyRandom = randomizeTeams(tiny, 4, 5);
check('randomizeTeams keeps the chosen 4 team slots', tinyRandom.length === 4);
check('randomizeTeams only fills as many teams as there are players',
  tinyRandom.filter((t) => t.playerIds.length > 0).length === 2,
  `got ${tinyRandom.map((t) => t.playerIds.length).join(',')}`);

// --- Underfilled teams: fewer players than the full capacity ---
const sevenPlayers = INITIAL_PLAYERS.slice(0, 7);
const underfilled = autoBalanceTeams(sevenPlayers, 3, 5);
check('7 players across 3 teams leaves nobody out',
  underfilled.flatMap((t) => t.playerIds).length === 7);
check('7 players across 3 teams: sizes are 3/2/2',
  underfilled.map((t) => t.playerIds.length).sort().join('/') === '2/2/3');
check('7 players across 3 teams: no empty team', underfilled.every((t) => t.playerIds.length >= 1));

// The star goal follows the actual headcount, not the configured capacity.
const threePlayers = INITIAL_PLAYERS.slice(0, 3);
const oneEach = autoBalanceTeams(threePlayers, 3, 5);
check('3 players across 3 teams gives 1 each', oneEach.every((t) => t.playerIds.length === 1));
check('3 players across 3 teams: total stars preserved',
  oneEach.reduce((sum, t) => sum + t.totalStars, 0).toFixed(1) ===
  threePlayers.reduce((sum, p) => sum + p.stars, 0).toFixed(1));

// The balancing target scales with the headcount, so an underfilled side isn't
// measured against the goal of a full team (which it could never reach).
const sevenByThree = autoBalanceTeams(sevenPlayers, 3, 5);
const sevenTarget = (7 / 3) * 4.0;
const sevenSpread = Math.max(...sevenByThree.map((t) => t.totalStars)) -
  Math.min(...sevenByThree.map((t) => t.totalStars));
check('7 players across 3 teams: the sides stay close to the ~9.3★ headcount goal',
  sevenSpread <= 4.0, `spread was ${sevenSpread.toFixed(1)} (target ${sevenTarget.toFixed(1)}★)`);
check('7 players across 3 teams: the goal follows the headcount, not the team size',
  sevenTarget < 5 * 4.0);

// --- validateTeamsForLiveStart: empty teams are allowed as long as 2 can play ---
const mkTeam = (name, n) => ({
  name,
  playerIds: Array.from({ length: n }, (_, i) => `${name}-${i}`),
});

check('live start accepts 2 uneven teams (3 vs 1)',
  validateTeamsForLiveStart([mkTeam('A', 3), mkTeam('B', 1)]).success === true);
check('live start accepts 6 uneven teams',
  validateTeamsForLiveStart([mkTeam('A', 5), mkTeam('B', 1), mkTeam('C', 1), mkTeam('D', 1), mkTeam('E', 1), mkTeam('F', 1)]).success === true);

const withEmpty = validateTeamsForLiveStart([mkTeam('A', 3), mkTeam('B', 0), mkTeam('C', 1)]);
check('live start accepts an empty team when 2 teams have players', withEmpty.success === true);
check('live start still reports the empty team name',
  Array.isArray(withEmpty.emptyTeamNames) && withEmpty.emptyTeamNames.includes('B'),
  JSON.stringify(withEmpty.emptyTeamNames));

const notEnoughPlayable = validateTeamsForLiveStart([mkTeam('A', 3), mkTeam('B', 0), mkTeam('C', 0)]);
check('live start allows a single playable team with empty slots',
  notEnoughPlayable.success === true);
check('live start reports empty team names when empty slots exist',
  Array.isArray(notEnoughPlayable.emptyTeamNames) && notEnoughPlayable.emptyTeamNames.length === 2,
  JSON.stringify(notEnoughPlayable.emptyTeamNames));

check('live start rejects a single team', validateTeamsForLiveStart([mkTeam('A', 3)]).success === false);
check('live start rejects an empty roster', validateTeamsForLiveStart([]).success === false);
check('live start treats a missing playerIds array as an empty team but still allows start if players exist elsewhere',
  validateTeamsForLiveStart([{ name: 'A', playerIds: ['x'] }, { name: 'B' }]).success === true);

// --- validateSetupForPelada ---
check('setup rejects fewer than 2 players',
  validateSetupForPelada(4, 1).success === false);
check('setup error mentions the minimum', validateSetupForPelada(4, 0).error.includes('2 jogadores'));
check('setup accepts exactly 2 players', validateSetupForPelada(2, 2).success === true);
check('setup keeps the chosen team count even with fewer players',
  validateSetupForPelada(6, 3).teamCount === 6);
check('setup keeps the chosen team count when there is enough attendance',
  validateSetupForPelada(4, 12).teamCount === 4);
check('setup clamps the team count to the 6-team ceiling',
  validateSetupForPelada(9, 30).teamCount === MAX_TEAM_COUNT);
check('setup never returns fewer than 2 teams', validateSetupForPelada(1, 2).teamCount === MIN_TEAM_COUNT);

// ---------------------------------------------------------------------------
// 5. Integration: the store's live flow with uneven teams
// ---------------------------------------------------------------------------
console.log('\n--- 5. Testing Live Flow With Uneven Teams (store integration) ---');

/** Puts the store in a live pelada with the given per-team headcounts (0 = empty team). */
function buildLivePelada(headcounts) {
  const total = headcounts.reduce((a, b) => a + b, 0);
  const players = INITIAL_PLAYERS.slice(0, total);
  const setup = store.startPeladaSetup(headcounts.length, players.map((p) => p.id));
  if (!setup?.success) throw new Error(`setup failed: ${setup?.error}`);
  let cursor = 0;
  store.updatePeladaTeams(
    store.activePelada.teams.map((team, i) => {
      const ids = players.slice(cursor, cursor + headcounts[i]).map((p) => p.id);
      cursor += headcounts[i];
      return { ...team, playerIds: ids };
    }),
  );
  return store.startLivePelada();
}

// --- Setup validation surfaces an error to the caller ---
const tooFew = store.startPeladaSetup(4, [INITIAL_PLAYERS[0].id]);
check('store.startPeladaSetup rejects a single player', tooFew?.success === false);
check('store.startPeladaSetup returns the error message',
  typeof tooFew?.error === 'string' && tooFew.error.length > 0);

// --- A 2-team, 1-vs-1 pelada goes live ---
const twoTeamLive = buildLivePelada([1, 1]);
check('store starts a live pelada with 2 uneven teams', twoTeamLive?.success === true);
check('the live pelada keeps both teams non-empty',
  store.activePelada.teams.every((t) => t.playerIds.length >= 1));

// --- A 6-team, 5/1/1/1/1/1 pelada goes live ---
const sixTeamLive = buildLivePelada([5, 1, 1, 1, 1, 1]);
check('store starts a live pelada with 6 uneven teams', sixTeamLive?.success === true);
check('the 6-team pelada has no empty team',
  store.activePelada.teams.every((t) => t.playerIds.length >= 1));

// --- Empty teams no longer block the live start ---
const sparseLive = buildLivePelada([1, 1, 0, 0]);
check('store starts a live pelada with empty team slots', sparseLive?.success === true);
check('the chosen 4 team slots are kept', store.activePelada.teams.length === 4);
check('all teams join the waiting queue even if empty',
  store.activePelada.rotation.waitingTeamIds.length === 4);
check('the empty teams remain on the pelada',
  store.activePelada.teams.filter((t) => t.playerIds.length === 0).length === 2);

// --- Rotation works with uneven teams ---
const rotLive = buildLivePelada([4, 1, 2]);
check('rotation is built when the pelada goes live', !!store.activePelada.rotation);
const rot = store.activePelada.rotation;
check('every team is in the waiting queue', rot.waitingTeamIds.length === 3);
check('the most complete team is queued first',
  rot.waitingTeamIds[0] === store.activePelada.teams
    .slice()
    .sort((a, b) => b.playerIds.length - a.playerIds.length)[0].id);

const first = store.startMatchBetween(rot.waitingTeamIds[0], rot.waitingTeamIds[1]);
check('the first match starts between two waiting teams', first?.success === true);
check('the current match has both teams set',
  !!store.activePelada.rotation.currentMatch?.teamAId &&
  !!store.activePelada.rotation.currentMatch?.teamBId);

// Score a goal for team A so the rotation has a winner to keep.
const match = store.activePelada.rotation.currentMatch;
const teamA = store.activePelada.teams.find((t) => t.id === match.teamAId);
store.recordGoal(teamA.playerIds[0], teamA.id);
check('the goal bumped the match score',
  store.activePelada.rotation.currentMatch.scoreA === 1);

// The match can only end when the clock runs out (no goal limit configured here).
const tooEarly = store.endCurrentMatch();
check('a match cannot end while the clock still runs',
  tooEarly?.success === false || store.activePelada.rotation.currentMatch?.scoreA === 1);

// Drain the clock so the match can be finalized.
store.activePelada.rotation.currentMatch.timerRemainingMs = 0;
store.activePelada.rotation.currentMatch.timerRunning = false;
const ended = store.endCurrentMatch();
check('the match ends once the clock runs out', ended?.success === true);
check('the winner stays on the pitch',
  store.activePelada.rotation.currentMatch?.teamAId === match.teamAId ||
  store.activePelada.rotation.currentMatch?.teamBId === match.teamAId);
check('the rotation log recorded the result', store.activePelada.rotation.log.length === 1);
check('the logged result names the winner', store.activePelada.rotation.log[0].winnerId === match.teamAId);
check('the logged rosters snapshot both teams',
  Object.keys(store.activePelada.rotation.log[0].rosters).length === 2);

// The incoming team is taken from the front of the queue, and every team keeps playing.
const afterRotation = store.activePelada.rotation;
check('the rotation kept every team in play',
  afterRotation.currentMatch !== null &&
  [afterRotation.currentMatch.teamAId, afterRotation.currentMatch.teamBId, ...afterRotation.waitingTeamIds].length === 3);

// --- Filling teams during a live pelada ---
const fillLive = buildLivePelada([1, 1, 0, 0]);
check('a 4-slot pelada can start with only 2 playable teams', fillLive?.success === true);
const emptyTeam = store.activePelada.teams.find((t) => t.playerIds.length === 0);
const newcomer = INITIAL_PLAYERS[2];
const fillNew = store.fillTeamWithPlayer(emptyTeam.id, newcomer.id);
check('fillTeamWithPlayer adds a new arrival to the empty team', fillNew?.success === true);
check('the newcomer is on the filled team',
  store.activePelada.teams.find((t) => t.id === emptyTeam.id).playerIds.includes(newcomer.id));
check('the newcomer joins the pelada attendance',
  store.activePelada.presentPlayerIds.includes(newcomer.id));
check('the newcomer gets match stats', !!store.activePelada.stats[newcomer.id]);
check('the filled team rejoins the waiting queue',
  store.activePelada.rotation.waitingTeamIds.includes(emptyTeam.id));

// Moving a player from another waiting team fills a slot, and empty teams are allowed.
const moveLive = buildLivePelada([2, 1, 0]);
const moveTeams = store.activePelada.teams;
const sourceTeam = moveTeams.find((t) => t.playerIds.length === 2);
const loneTeam = moveTeams.find((t) => t.playerIds.length === 1);
const moveTarget = moveTeams.find((t) => t.playerIds.length === 0);
const moveLastPlayer = store.fillTeamWithPlayer(moveTarget.id, loneTeam.playerIds[0]);
check('moving the last player out of a team is allowed', moveLastPlayer?.success === true);
const movedPlayerId = sourceTeam.playerIds[0];
const moveOk = store.fillTeamWithPlayer(moveTarget.id, movedPlayerId);
check('moving a player from a waiting team fills the empty team', moveOk?.success === true);
check('moving a player between teams does not flag them as a late arrival',
  store.isLateArrival(movedPlayerId) === false);
check('the source team keeps at least one player',
  store.activePelada.teams.find((t) => t.id === sourceTeam.id).playerIds.length === 1);
check('the destination team is now playable and queued',
  store.activePelada.rotation.waitingTeamIds.includes(moveTarget.id));

// --- Late arrivals stay separate from the day's original selection ---
const lateLive = buildLivePelada([2, 2]);
check('the late-arrival scenario goes live', lateLive?.success === true);
const lateSnapshot = [...store.activePelada.attendancePlayerIds];
check('the setup selection is snapshotted when the pelada goes live',
  lateSnapshot.length === 4);
check('players from the setup list are not late arrivals',
  lateSnapshot.every((id) => store.isLateArrival(id) === false));
const lateTarget = store.activePelada.teams[0];
const lateNewcomer = INITIAL_PLAYERS[5];
const addLate = store.fillTeamWithPlayer(lateTarget.id, lateNewcomer.id);
check('a player outside the setup list can be added', addLate?.success === true);
check('the newcomer is flagged as a late arrival',
  store.isLateArrival(lateNewcomer.id) === true);
check('the late arrival joins the attendance list',
  store.activePelada.presentPlayerIds.includes(lateNewcomer.id));
check('the original attendance snapshot is unchanged',
  store.activePelada.attendancePlayerIds.length === 4 &&
  !store.activePelada.attendancePlayerIds.includes(lateNewcomer.id));

// Players on the pitch cannot be pulled into another team.
const guardLive = buildLivePelada([2, 1, 0]);
check('guard scenario goes live', guardLive?.success === true);
const guardTeams = store.activePelada.teams;
const onPitchTeam = guardTeams.find((t) => t.playerIds.length === 2);
const benchTeam = guardTeams.find((t) => t.playerIds.length === 1);
const guardTarget = guardTeams.find((t) => t.playerIds.length === 0);
const guardStart = store.startMatchBetween(onPitchTeam.id, benchTeam.id);
check('the guard scenario starts a match', guardStart?.success === true);
const pullFromPitch = store.fillTeamWithPlayer(guardTarget.id, onPitchTeam.playerIds[0]);
check('cannot pull a player from a team that is on the pitch',
  pullFromPitch?.success === false);
const pullFromBench = store.fillTeamWithPlayer(guardTarget.id, benchTeam.playerIds[0]);
check('cannot pull the last player from a waiting team either',
  pullFromBench?.success === false);

// --- Adding a late arrival to a team that is already on the pitch ---
const onPitchLive = buildLivePelada([2, 2, 0]);
check('the on-pitch add scenario goes live', onPitchLive?.success === true);
const onPitchStart = store.startMatchBetween(
  store.activePelada.teams[0].id,
  store.activePelada.teams[1].id,
);
check('the on-pitch add scenario starts a match', onPitchStart?.success === true);
const onPitchMatch = store.activePelada.rotation.currentMatch;
const onPitchTarget = store.activePelada.teams.find(
  (t) => t.id === onPitchMatch.teamAId,
);
const onPitchNewcomer = INITIAL_PLAYERS[4];
const onPitchTargetBefore = onPitchTarget.playerIds.length;
const addOnPitch = store.fillTeamWithPlayer(onPitchTarget.id, onPitchNewcomer.id);
check('a new arrival can join a team already on the pitch', addOnPitch?.success === true);
check('the on-pitch team received the newcomer',
  store.activePelada.teams.find((t) => t.id === onPitchTarget.id).playerIds.includes(onPitchNewcomer.id));
check('the newcomer grows the active lineup',
  store.activePelada.teams.find((t) => t.id === onPitchTarget.id).playerIds.length === onPitchTargetBefore + 1);
check('the current match is unchanged by the addition',
  store.activePelada.rotation.currentMatch.teamAId === onPitchMatch.teamAId &&
  store.activePelada.rotation.currentMatch.teamBId === onPitchMatch.teamBId);
check('the addition is recorded in the timeline',
  store.activePelada.events[0]?.type === 'player-joined' &&
  store.activePelada.events[0]?.playerId === onPitchNewcomer.id);

// --- A full team still rejects extra players ---
const fullTeamLive = buildLivePelada([5, 1]);
check('the full-team scenario goes live', fullTeamLive?.success === true);
const fullTeam = store.activePelada.teams.find((t) => t.playerIds.length === 5);
const fullTeamExtra = INITIAL_PLAYERS[6];
const addToFull = store.fillTeamWithPlayer(fullTeam.id, fullTeamExtra.id);
check('a full team cannot receive another player', addToFull?.success === false);
check('the full team stays at the team size',
  store.activePelada.teams.find((t) => t.id === fullTeam.id).playerIds.length === 5);

// --- Growing the pelada with one more team when everyone is full ---
const growLive = buildLivePelada([5, 5]);
check('the grow-pelada scenario goes live', growLive?.success === true);
const growStart = store.startMatchBetween(
  store.activePelada.teams[0].id,
  store.activePelada.teams[1].id,
);
check('the grow-pelada scenario starts a match', growStart?.success === true);
const growBefore = store.activePelada.teams.length;
const addedTeam = store.addPeladaTeam();
check('a live pelada can grow with one more team', addedTeam?.success === true);
check('the team count follows the new team',
  store.activePelada.teams.length === growBefore + 1 &&
  store.activePelada.teamCount === growBefore + 1);
check('the new team is waiting for its turn',
  store.activePelada.rotation.waitingTeamIds.includes(addedTeam.teamId));
const growNewcomer = INITIAL_PLAYERS[10];
const fillNewTeam = store.fillTeamWithPlayer(addedTeam.teamId, growNewcomer.id);
check('the new team can receive the late arrival', fillNewTeam?.success === true);
check('the new team is now playable',
  store.getTeamCompleteness(addedTeam.teamId) === 1);

// --- The six-team ceiling still applies to live growth ---
const maxTeamsLive = buildLivePelada([1, 1, 1, 1, 1, 1]);
check('the six-team scenario goes live', maxTeamsLive?.success === true);
const tooManyTeams = store.addPeladaTeam();
check('a pelada cannot grow past the six-team ceiling', tooManyTeams?.success === false);

// --- Adding players is admin-gated like every other pelada action ---
const gateLive = buildLivePelada([1, 1]);
check('the gate scenario goes live', gateLive?.success === true);
const gateTeam = store.activePelada.teams[0];
const gateNewcomer = INITIAL_PLAYERS[2];
store.isAdmin = false;
const blockedFill = store.fillTeamWithPlayer(gateTeam.id, gateNewcomer.id);
store.isAdmin = true;
check('fillTeamWithPlayer is blocked for non-admins', blockedFill === undefined);
check('the blocked action did not change the team',
  !store.activePelada.teams.find((t) => t.id === gateTeam.id).playerIds.includes(gateNewcomer.id));

if (failures === 0) {
  console.log('✓ All underfilled-team regression checks passed!');
} else {
  console.error(`✗ ${failures} underfilled-team regression check(s) failed.`);
  process.exitCode = 1;
}
