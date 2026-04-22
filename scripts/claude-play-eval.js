import assert from 'node:assert/strict';
import { parsePlay } from '../lib/claude.js';
import { applyPlay, validatePlay } from '../lib/game-logic.js';

function baseState() {
  return {
    inning: 1,
    half: 'top',
    outs: 0,
    home_score: 0,
    away_score: 0,
    balls: 0,
    strikes: 0,
    runners: { first: null, second: null, third: null },
    inning_scores: { top: [], bottom: [] },
  };
}

const samplePlays = [
  {
    label: 'Top 1st, Rock Creek',
    input: 'Leadoff batter grounds out to shortstop, 6-3.',
    expect: { play_type: 'groundout', outs_recorded: 1, runs_scored: 0, hit: false },
    state: { inning: 1, half: 'top', outs: 1, away_score: 0, home_score: 0, runners: {} },
  },
  {
    label: 'Top 1st',
    input: 'Batter lines a single to left field.',
    expect: { play_type: 'single', outs_recorded: 0, runs_scored: 0, hit: true, runners: [{ from: 'home', to: '1' }] },
    state: { inning: 1, half: 'top', outs: 1, runners: { first: 'present' } },
  },
  {
    label: 'Top 1st',
    input: 'Runner steals second base on the next pitch.',
    expect: { play_type: 'stolen_base', outs_recorded: 0, runs_scored: 0, hit: false, runners: [{ from: '1', to: '2' }] },
    state: { inning: 1, half: 'top', outs: 1, runners: { first: null, second: 'present' } },
  },
  {
    label: 'Top 1st',
    input: 'Batter strikes out swinging.',
    expect: { play_type: 'strikeout', outs_recorded: 1, runs_scored: 0, hit: false },
    state: { inning: 1, half: 'top', outs: 2, runners: { second: 'present' } },
  },
  {
    label: 'Top 1st',
    input: 'Batter walks on a full count, runners on first and second.',
    expect: { play_type: 'walk', outs_recorded: 0, runs_scored: 0, hit: false, runners: [{ from: 'home', to: '1' }] },
    state: { inning: 1, half: 'top', outs: 2, runners: { first: 'present', second: 'present' } },
  },
  {
    label: 'Top 1st',
    input: 'Batter flies out to center field to end the inning.',
    expect: { play_type: 'flyout', outs_recorded: 1, runs_scored: 0, hit: false },
    state: { inning: 1, half: 'bottom', outs: 0, runners: { first: null, second: null, third: null } },
  },
  {
    label: 'Bottom 1st, Driveline',
    input: 'Leadoff batter draws a walk.',
    expect: { play_type: 'walk', outs_recorded: 0, runs_scored: 0, hit: false, runners: [{ from: 'home', to: '1' }] },
    state: { inning: 1, half: 'bottom', outs: 0, runners: { first: 'present' } },
  },
  {
    label: 'Bottom 1st',
    input: 'Batter bunts, sacrifice to first base, runner advances to second.',
    expect: { play_type: 'bunt', outs_recorded: 1, runs_scored: 0, hit: false, runners: [{ from: '1', to: '2' }] },
    state: { inning: 1, half: 'bottom', outs: 1, runners: { first: null, second: 'present' } },
  },
  {
    label: 'Bottom 1st',
    input: 'Batter singles to center, runner scores from second.',
    expect: { play_type: 'single', outs_recorded: 0, runs_scored: 1, rbi: 1, hit: true, runners: [{ from: 'home', to: '1' }, { from: '2', to: 'H' }] },
    state: { inning: 1, half: 'bottom', outs: 1, home_score: 1, runners: { first: 'present', second: null } },
  },
  {
    label: 'Bottom 1st',
    input: 'Batter pops out to third base.',
    expect: { play_type: 'flyout', outs_recorded: 1, runs_scored: 0, hit: false },
    state: { inning: 1, half: 'bottom', outs: 2, home_score: 1, runners: { first: 'present' } },
  },
  {
    label: 'Bottom 1st',
    input: 'Batter strikes out looking to end the inning.',
    expect: { play_type: 'strikeout', outs_recorded: 1, runs_scored: 0, hit: false },
    state: { inning: 2, half: 'top', outs: 0, home_score: 1, runners: { first: null, second: null, third: null } },
  },
  {
    label: 'Top 2nd, Rock Creek',
    input: 'Leadoff batter hits a double down the left field line.',
    expect: { play_type: 'double', outs_recorded: 0, runs_scored: 0, hit: true, runners: [{ from: 'home', to: '2' }] },
    state: { inning: 2, half: 'top', outs: 0, runners: { second: 'present' } },
  },
  {
    label: 'Top 2nd',
    input: 'Batter grounds out to second, runner advances to third.',
    expect: { play_type: 'groundout', outs_recorded: 1, runs_scored: 0, hit: false, runners: [{ from: '2', to: '3' }] },
    state: { inning: 2, half: 'top', outs: 1, runners: { second: null, third: 'present' } },
  },
  {
    label: 'Top 2nd',
    input: 'Batter hits a sacrifice fly to right, runner tags and scores.',
    expect: { play_type: 'sacrifice_fly', outs_recorded: 1, runs_scored: 1, rbi: 1, hit: false, runners: [{ from: '3', to: 'H' }] },
    state: { inning: 2, half: 'top', outs: 2, away_score: 1, runners: { third: null } },
  },
  {
    label: 'Top 2nd',
    input: 'Batter reaches on an error by shortstop.',
    expect: { play_type: 'error', outs_recorded: 0, runs_scored: 0, hit: false, error: true, runners: [{ from: 'home', to: '1' }] },
    state: { inning: 2, half: 'top', outs: 2, runners: { first: 'present' } },
  },
  {
    label: 'Top 2nd',
    input: 'Batter grounds out to third base to end the inning.',
    expect: { play_type: 'groundout', outs_recorded: 1, runs_scored: 0, hit: false },
    state: { inning: 2, half: 'bottom', outs: 0, runners: { first: null, second: null, third: null } },
  },
  {
    label: 'Bottom 2nd, Driveline',
    input: 'Leadoff batter grounds out to pitcher.',
    expect: { play_type: 'groundout', outs_recorded: 1, runs_scored: 0, hit: false },
    state: { inning: 2, half: 'bottom', outs: 1 },
  },
  {
    label: 'Bottom 2nd',
    input: 'Batter hits an infield single to shortstop.',
    expect: { play_type: 'single', outs_recorded: 0, runs_scored: 0, hit: true, runners: [{ from: 'home', to: '1' }] },
    state: { inning: 2, half: 'bottom', outs: 1, runners: { first: 'present' } },
  },
  {
    label: 'Bottom 2nd',
    input: 'Batter lines out to first, runner returns to first.',
    expect: { play_type: 'flyout', outs_recorded: 1, runs_scored: 0, hit: false },
    state: { inning: 2, half: 'bottom', outs: 2, runners: { first: 'present' } },
  },
  {
    label: 'Bottom 2nd',
    input: 'Batter hits a double to right-center, runner advances to third.',
    expect: { play_type: 'double', outs_recorded: 0, runs_scored: 0, hit: true, runners: [{ from: 'home', to: '2' }, { from: '1', to: '3' }] },
    state: { inning: 2, half: 'bottom', outs: 2, runners: { second: 'present', third: 'present' } },
  },
  {
    label: 'Bottom 2nd',
    input: 'Batter grounds out to second to end the inning.',
    expect: { play_type: 'groundout', outs_recorded: 1, runs_scored: 0, hit: false },
    state: { inning: 3, half: 'top', outs: 0, runners: { first: null, second: null, third: null } },
  },
  {
    label: 'Top 3rd, Rock Creek',
    input: 'Leadoff batter strikes out swinging.',
    expect: { play_type: 'strikeout', outs_recorded: 1, runs_scored: 0, hit: false },
    state: { inning: 3, half: 'top', outs: 1 },
  },
  {
    label: 'Top 3rd',
    input: 'Batter walks on four pitches.',
    expect: { play_type: 'walk', outs_recorded: 0, runs_scored: 0, hit: false, runners: [{ from: 'home', to: '1' }] },
    state: { inning: 3, half: 'top', outs: 1, runners: { first: 'present' } },
  },
  {
    label: 'Top 3rd',
    input: 'Batter hits a hard ground ball for a 6-4-3 double play to end the inning.',
    expect: { play_type: 'groundout', outs_recorded: 2, runs_scored: 0, hit: false, runners: [{ from: '1', to: 'out' }] },
    state: { inning: 3, half: 'bottom', outs: 0, runners: { first: null, second: null, third: null } },
  },
  {
    label: 'Bottom 3rd, Driveline',
    input: 'Leadoff batter reaches on a fielding error by third baseman.',
    expect: { play_type: 'error', outs_recorded: 0, runs_scored: 0, hit: false, error: true, runners: [{ from: 'home', to: '1' }] },
    state: { inning: 3, half: 'bottom', outs: 0, runners: { first: 'present' } },
  },
  {
    label: 'Bottom 3rd',
    input: 'Batter flies out to left field, runner holds at first.',
    expect: { play_type: 'flyout', outs_recorded: 1, runs_scored: 0, hit: false },
    state: { inning: 3, half: 'bottom', outs: 1, runners: { first: 'present' } },
  },
  {
    label: 'Bottom 3rd',
    input: 'Batter triples to the right field corner, runner scores from first.',
    expect: { play_type: 'triple', outs_recorded: 0, runs_scored: 1, rbi: 1, hit: true, runners: [{ from: 'home', to: '3' }, { from: '1', to: 'H' }] },
    state: { inning: 3, half: 'bottom', outs: 1, home_score: 2, runners: { first: null, third: 'present' } },
  },
  {
    label: 'Bottom 3rd',
    input: 'Batter hits a sacrifice fly to center, runner tags and scores from third.',
    expect: { play_type: 'sacrifice_fly', outs_recorded: 1, runs_scored: 1, rbi: 1, hit: false, runners: [{ from: '3', to: 'H' }] },
    state: { inning: 3, half: 'bottom', outs: 2, home_score: 3, runners: { third: null } },
  },
  {
    label: 'Bottom 3rd',
    input: 'Batter grounds out to shortstop to end the inning.',
    expect: { play_type: 'groundout', outs_recorded: 1, runs_scored: 0, hit: false },
    state: { inning: 4, half: 'top', outs: 0, away_score: 1, home_score: 3, runners: { first: null, second: null, third: null } },
  },
];

function runnersInclude(actual, expected) {
  for (const wanted of expected ?? []) {
    const found = actual.some((runner) => {
      return Object.entries(wanted).every(([key, value]) => runner[key] === value);
    });
    assert.equal(found, true, `missing runner movement ${JSON.stringify(wanted)} in ${JSON.stringify(actual)}`);
  }
}

function assertExpectedPlay(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'runners') continue;
    assert.equal(actual[key], value, `${key} expected ${value}, got ${actual[key]}`);
  }

  const runnersToH = actual.runners.filter((runner) => runner.to === 'H').length;
  assert.equal(actual.runs_scored, runnersToH, 'runs_scored must match runners moving to H');
  runnersInclude(actual.runners, expected.runners);
}

function assertExpectedState(actual, expected) {
  for (const key of ['inning', 'half', 'outs', 'away_score', 'home_score']) {
    if (expected[key] !== undefined) {
      assert.equal(actual[key], expected[key], `state.${key} expected ${expected[key]}, got ${actual[key]}`);
    }
  }

  for (const [base, value] of Object.entries(expected.runners ?? {})) {
    if (value === 'present') {
      assert.ok(actual.runners[base], `expected runner on ${base}`);
    } else {
      assert.equal(actual.runners[base], value, `state.runners.${base} expected ${value}, got ${actual.runners[base]}`);
    }
  }
}

let state = baseState();
let failures = 0;

for (const [index, sample] of samplePlays.entries()) {
  let parsed;
  try {
    parsed = await parsePlay(sample.input, state);
    assertExpectedPlay(parsed, sample.expect);

    const validation = validatePlay(state, parsed);
    assert.equal(validation.valid, true, validation.reason);

    state = applyPlay(state, parsed);
    assertExpectedState(state, sample.state);

    console.log(`ok ${index + 1} - ${sample.label}: ${sample.input}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok ${index + 1} - ${sample.label}: ${sample.input}`);
    if (typeof parsed !== 'undefined') {
      console.error(`  parsed: ${JSON.stringify(parsed)}`);
    }
    console.error(`  state: ${JSON.stringify(state)}`);
    console.error(`  ${error.stack ?? error.message}`);
  }
}

console.log('\nFinal state:', JSON.stringify(state, null, 2));

if (failures > 0) {
  console.error(`\n${failures} Claude play eval failure(s).`);
  process.exit(1);
}

console.log('\nAll Claude play evals passed.');
