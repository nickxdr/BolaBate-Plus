import { INITIAL_PLAYERS, calculatePoints } from './src/data/seedData.js';
import { autoBalanceTeams, getSmartSuggestions, getSubstituteSuggestions } from './src/services/balancer.js';

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
  'ARTHUR N': 4.0,
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
