import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyPlay, validatePlay, buildBoxScore, ordinalInning } from '../lib/game-logic.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function baseState(overrides = {}) {
  return {
    inning: 1, half: 'top', outs: 0,
    home_score: 0, away_score: 0,
    balls: 0, strikes: 0,
    runners: { first: null, second: null, third: null },
    inning_scores: { top: [], bottom: [] },
    ...overrides,
  };
}

function play(overrides = {}) {
  return {
    play_type: 'single', batter: null,
    outs_recorded: 0, runs_scored: 0,
    runners: [], rbi: 0, hit: true, error: false,
    ...overrides,
  };
}

// ── applyPlay ──────────────────────────────────────────────────────────────

describe('applyPlay — runner movement', () => {

  test('single: batter reaches first', () => {
    const state = applyPlay(baseState(), play({
      play_type: 'single', batter: 'Johnny',
      runners: [{ name: 'Johnny', from: 'home', to: '1' }],
    }));
    assert.equal(state.runners.first, 'Johnny');
    assert.equal(state.runners.second, null);
  });

  test('double: batter to second, runner on first scores', () => {
    const state = applyPlay(
      baseState({ runners: { first: 'Alex', second: null, third: null } }),
      play({
        play_type: 'double', batter: 'Johnny', runs_scored: 1,
        runners: [
          { name: 'Alex',   from: '1',    to: 'H' },
          { name: 'Johnny', from: 'home', to: '2' },
        ],
      })
    );
    assert.equal(state.runners.first,  null);
    assert.equal(state.runners.second, 'Johnny');
    assert.equal(state.away_score, 1);
  });

  test('home run: batter and all runners score', () => {
    const state = applyPlay(
      baseState({ runners: { first: 'A', second: 'B', third: 'C' } }),
      play({
        play_type: 'home_run', batter: 'Johnny', runs_scored: 4,
        runners: [
          { name: 'C',      from: '3',    to: 'H' },
          { name: 'B',      from: '2',    to: 'H' },
          { name: 'A',      from: '1',    to: 'H' },
          { name: 'Johnny', from: 'home', to: 'H' },
        ],
      })
    );
    assert.equal(state.away_score, 4);
    assert.equal(state.runners.first,  null);
    assert.equal(state.runners.second, null);
    assert.equal(state.runners.third,  null);
  });

  test('stolen base: runner advances from first to second', () => {
    const state = applyPlay(
      baseState({ runners: { first: 'Alex', second: null, third: null } }),
      play({
        play_type: 'stolen_base',
        runners: [{ name: 'Alex', from: '1', to: '2' }],
      })
    );
    assert.equal(state.runners.first,  null);
    assert.equal(state.runners.second, 'Alex');
  });

  test('walk: batter to first, runners advance', () => {
    const state = applyPlay(
      baseState({ runners: { first: 'Alex', second: null, third: null } }),
      play({
        play_type: 'walk', batter: 'Johnny',
        runners: [
          { name: 'Alex',   from: '1',    to: '2' },
          { name: 'Johnny', from: 'home', to: '1' },
        ],
      })
    );
    assert.equal(state.runners.first,  'Johnny');
    assert.equal(state.runners.second, 'Alex');
  });

});

describe('applyPlay — outs', () => {

  test('strikeout records one out', () => {
    const state = applyPlay(baseState(), play({ play_type: 'strikeout', outs_recorded: 1, hit: false }));
    assert.equal(state.outs, 1);
  });

  test('double play records two outs and clears runner', () => {
    const state = applyPlay(
      baseState({ runners: { first: 'Alex', second: null, third: null } }),
      play({
        play_type: 'groundout', outs_recorded: 2,
        runners: [{ name: 'Alex', from: '1', to: 'out' }],
        hit: false,
      })
    );
    assert.equal(state.outs, 2);
    assert.equal(state.runners.first, null);
  });

  test('third out flips to bottom of inning', () => {
    const state = applyPlay(
      baseState({ outs: 2, runners: { first: 'Alex', second: null, third: null } }),
      play({ play_type: 'strikeout', outs_recorded: 1, hit: false })
    );
    assert.equal(state.outs,   0);
    assert.equal(state.half,   'bottom');
    assert.equal(state.inning, 1);
    assert.equal(state.runners.first, null, 'runners cleared after 3 outs');
  });

  test('third out in bottom flips to top of next inning', () => {
    const state = applyPlay(
      baseState({ outs: 2, half: 'bottom', inning: 3 }),
      play({ play_type: 'flyout', outs_recorded: 1, hit: false })
    );
    assert.equal(state.half,   'top');
    assert.equal(state.inning, 4);
    assert.equal(state.outs,   0);
  });

});

describe('applyPlay — score tracking', () => {

  test('run in top of inning adds to away score', () => {
    const state = applyPlay(
      baseState({ half: 'top', inning: 3 }),
      play({ runs_scored: 1, runners: [{ name: null, from: '3', to: 'H' }] })
    );
    assert.equal(state.away_score, 1);
    assert.equal(state.home_score, 0);
  });

  test('run in bottom of inning adds to home score', () => {
    const state = applyPlay(
      baseState({ half: 'bottom', inning: 3 }),
      play({ runs_scored: 1, runners: [{ name: null, from: '3', to: 'H' }] })
    );
    assert.equal(state.home_score, 1);
    assert.equal(state.away_score, 0);
  });

  test('inning_scores tracked per half-inning', () => {
    let state = baseState({ half: 'top', inning: 2 });
    state = applyPlay(state, play({ runs_scored: 3, runners: [
      { from: '1', to: 'H' }, { from: '2', to: 'H' }, { from: '3', to: 'H' },
    ]}));
    assert.equal(state.inning_scores.top[1], 3); // inning 2 = index 1
  });

  test('inning_scores accumulate across multiple plays same inning', () => {
    let state = baseState({ half: 'bottom', inning: 1 });
    state = applyPlay(state, play({ runs_scored: 1, runners: [{ from: '3', to: 'H' }] }));
    state = applyPlay(state, play({ runs_scored: 2, runners: [
      { from: '2', to: 'H' }, { from: '3', to: 'H' },
    ]}));
    assert.equal(state.inning_scores.bottom[0], 3);
  });

});

describe('applyPlay — count reset', () => {

  test('count resets to 0-0 after every play', () => {
    const state = applyPlay(
      baseState({ balls: 3, strikes: 2 }),
      play({ play_type: 'single', runners: [{ name: null, from: 'home', to: '1' }] })
    );
    assert.equal(state.balls,   0);
    assert.equal(state.strikes, 0);
  });

});

// ── validatePlay ───────────────────────────────────────────────────────────

describe('validatePlay', () => {

  test('valid play passes', () => {
    const result = validatePlay(baseState(), play({
      runs_scored: 1,
      runners: [{ from: '3', to: 'H' }],
    }));
    assert.equal(result.valid, true);
  });

  test('runs_scored mismatch fails', () => {
    const result = validatePlay(baseState(), play({
      runs_scored: 2,
      runners: [{ from: '3', to: 'H' }], // only 1 runner scores
    }));
    assert.equal(result.valid, false);
    assert.match(result.reason, /doesn't match/);
  });

  test('negative outs_recorded fails', () => {
    const result = validatePlay(baseState(), play({ outs_recorded: -1 }));
    assert.equal(result.valid, false);
  });

  test('outs_recorded > 3 fails', () => {
    const result = validatePlay(baseState(), play({ outs_recorded: 4 }));
    assert.equal(result.valid, false);
  });

  test('runs_scored > 4 fails', () => {
    const result = validatePlay(baseState(), play({ runs_scored: 5, runners: [] }));
    assert.equal(result.valid, false);
  });

  test('zero runs with no runners to H is valid', () => {
    const result = validatePlay(baseState(), play({ runs_scored: 0, runners: [] }));
    assert.equal(result.valid, true);
  });

});

// ── buildBoxScore ──────────────────────────────────────────────────────────

describe('buildBoxScore', () => {

  test('pads to at least 9 innings', () => {
    const { maxInning } = buildBoxScore(baseState());
    assert.ok(maxInning >= 9);
  });

  test('reflects scored runs per inning', () => {
    const game = baseState({
      inning_scores: { top: [2, 0, 1], bottom: [0, 3, 0] },
      away_score: 3, home_score: 3, inning: 4,
    });
    const { away, home } = buildBoxScore(game);
    assert.equal(away[0], 2);
    assert.equal(away[2], 1);
    assert.equal(home[1], 3);
  });

  test('unplayed innings return null', () => {
    const game = baseState({ inning_scores: { top: [1], bottom: [] }, inning: 1 });
    const { away } = buildBoxScore(game);
    assert.equal(away[1], null); // inning 2 not played
  });

});

// ── ordinalInning ──────────────────────────────────────────────────────────

describe('ordinalInning', () => {
  const cases = [
    [1, 'top',    'Top 1st'],
    [2, 'bottom', 'Bot 2nd'],
    [3, 'top',    'Top 3rd'],
    [4, 'bottom', 'Bot 4th'],
    [11, 'top',   'Top 11th'],
  ];
  for (const [inning, half, expected] of cases) {
    test(`${expected}`, () => {
      assert.equal(ordinalInning(inning, half), expected);
    });
  }
});
