import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseScoringCommand } from '../lib/scoring-parser.js';
import { applyCommand } from '../lib/game-logic.js';

function baseState(overrides = {}) {
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
    ...overrides,
  };
}

describe('deterministic scoring parser', () => {
  test('parses pitch calls without model help', () => {
    assert.deepEqual(parseScoringCommand('ball')?.call, 'ball');
    assert.deepEqual(parseScoringCommand('called strike')?.call, 'called_strike');
    assert.deepEqual(parseScoringCommand('foul ball')?.call, 'foul');
  });

  test('parses common scorekeeping out notation', () => {
    const groundout = parseScoringCommand('6-3');
    assert.equal(groundout.event, 'groundout');
    assert.deepEqual(groundout.fielding_sequence, [6, 3]);

    const flyout = parseScoringCommand('F8');
    assert.equal(flyout.event, 'flyout');
    assert.deepEqual(flyout.fielding_sequence, [8]);
  });

  test('parses common at-bat outcomes', () => {
    assert.equal(parseScoringCommand('Johnny hit a single')?.event, 'single');
    assert.equal(parseScoringCommand('Johnny hit a home run')?.event, 'home_run');
    assert.equal(parseScoringCommand('K looking')?.event, 'strikeout');
  });

  test('parses explicit runner movement on hits', () => {
    const command = parseScoringCommand('Johnny doubled, runner from first scored', baseState({
      runners: { first: 'Alex', second: null, third: null },
    }));

    assert.equal(command.event, 'double');
    assert.deepEqual(command.advances, [
      { runner: 'Alex', from: '1', to: 'H', reason: 'on_hit' },
    ]);
  });

  test('requests clarification for ambiguous scoring language', () => {
    const scored = parseScoringCommand('runner scored', baseState({
      runners: { first: 'Alex', second: 'Blake', third: null },
    }));
    assert.equal(scored.needs_clarification, true);
    assert.match(scored.clarification_question, /Which runner scored/);

    const safe = parseScoringCommand('safe at first');
    assert.equal(safe.needs_clarification, true);
    assert.match(safe.clarification_question, /hit, error/);
  });
});

describe('deterministic scoring command application', () => {
  test('foul with two strikes keeps the count at two strikes', () => {
    const command = parseScoringCommand('foul ball');
    const result = applyCommand(baseState({ strikes: 2 }), command);
    assert.equal(result.valid, true);
    assert.equal(result.state.strikes, 2);
    assert.equal(result.play.strikes_delta, 0);
  });

  test('ball four creates a walk and forces runners', () => {
    const command = parseScoringCommand('ball');
    const result = applyCommand(baseState({
      balls: 3,
      runners: { first: 'Alex', second: 'Blake', third: 'Casey' },
    }), command);

    assert.equal(result.valid, true);
    assert.equal(result.play.play_type, 'walk');
    assert.equal(result.state.away_score, 1);
    assert.equal(result.state.runners.first, 'Batter');
    assert.equal(result.state.runners.second, 'Alex');
    assert.equal(result.state.runners.third, 'Blake');
  });

  test('single uses minimal legal movement when first is occupied', () => {
    const command = parseScoringCommand('Johnny hit a single');
    const result = applyCommand(baseState({
      runners: { first: 'Alex', second: null, third: null },
    }), command);

    assert.equal(result.valid, true);
    assert.equal(result.state.runners.first, 'Johnny');
    assert.equal(result.state.runners.second, 'Alex');
  });

  test('home run scores batter and all runners', () => {
    const command = parseScoringCommand('Johnny hit a home run');
    const result = applyCommand(baseState({
      runners: { first: 'Alex', second: 'Blake', third: 'Casey' },
    }), command);

    assert.equal(result.valid, true);
    assert.equal(result.state.away_score, 4);
    assert.deepEqual(result.state.runners, { first: null, second: null, third: null });
  });

  test('6-4-3 double play records two outs and removes runner from first', () => {
    const command = parseScoringCommand('6-4-3');
    const result = applyCommand(baseState({
      runners: { first: 'Alex', second: null, third: null },
    }), command);

    assert.equal(result.valid, true);
    assert.equal(result.state.outs, 2);
    assert.equal(result.state.runners.first, null);
  });

  test('standalone runner move advances the existing runner', () => {
    const command = parseScoringCommand('runner from second to third');
    const result = applyCommand(baseState({
      runners: { first: null, second: 'Blake', third: null },
    }), command);

    assert.equal(result.valid, true);
    assert.equal(result.state.runners.second, null);
    assert.equal(result.state.runners.third, 'Blake');
  });

  test('runner out at second records an out and clears source base', () => {
    const command = parseScoringCommand('runner from first out at second');
    const result = applyCommand(baseState({
      runners: { first: 'Alex', second: null, third: null },
    }), command);

    assert.equal(result.valid, true);
    assert.equal(result.state.outs, 1);
    assert.equal(result.state.runners.first, null);
  });
});
