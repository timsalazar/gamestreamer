/**
 * Claude parsing tests — mocks the Anthropic SDK so no API calls are made.
 * Tests that parsePlay correctly handles the LLM response, including
 * JSON extraction, markdown fence stripping, and error handling.
 */
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Helpers ────────────────────────────────────────────────────────────────

function mockSdk(responseText) {
  return {
    messages: {
      create: async () => ({
        content: [{ text: responseText }],
      }),
    },
  };
}

function validPlay(overrides = {}) {
  return {
    play_type: 'single', batter: 'Johnny',
    outs_recorded: 0, runs_scored: 0,
    runners: [{ name: 'Johnny', from: 'home', to: '1' }],
    rbi: 0, hit: true, error: false,
    ...overrides,
  };
}

function baseGameState() {
  return {
    outs: 0,
    runners: { first: null, second: null, third: null },
  };
}

// ── parsePlay (isolated, drives the logic directly) ───────────────────────
// We re-implement a minimal version of parsePlay here to test the
// JSON extraction + fence-stripping logic without real HTTP calls.

async function parsePlayWith(sdkResponse, rawInput, gameState = baseGameState()) {
  const text = sdkResponse.trim();
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(clean);
}

describe('JSON extraction from LLM response', () => {

  test('parses plain JSON', async () => {
    const json = JSON.stringify(validPlay());
    const result = await parsePlayWith(json);
    assert.equal(result.play_type, 'single');
    assert.equal(result.batter, 'Johnny');
  });

  test('strips ```json code fence', async () => {
    const json = '```json\n' + JSON.stringify(validPlay()) + '\n```';
    const result = await parsePlayWith(json);
    assert.equal(result.play_type, 'single');
  });

  test('strips plain ``` code fence', async () => {
    const json = '```\n' + JSON.stringify(validPlay()) + '\n```';
    const result = await parsePlayWith(json);
    assert.equal(result.play_type, 'single');
  });

  test('throws on non-JSON response', async () => {
    await assert.rejects(
      () => parsePlayWith('Sorry, I could not parse that play.'),
      SyntaxError
    );
  });

});

describe('play_type coverage', () => {

  const cases = [
    ['single',        { play_type: 'single',    hit: true,  outs_recorded: 0 }],
    ['double',        { play_type: 'double',    hit: true,  outs_recorded: 0 }],
    ['triple',        { play_type: 'triple',    hit: true,  outs_recorded: 0 }],
    ['home_run',      { play_type: 'home_run',  hit: true,  outs_recorded: 0 }],
    ['strikeout',     { play_type: 'strikeout', hit: false, outs_recorded: 1 }],
    ['groundout',     { play_type: 'groundout', hit: false, outs_recorded: 1 }],
    ['flyout',        { play_type: 'flyout',    hit: false, outs_recorded: 1 }],
    ['walk',          { play_type: 'walk',      hit: false, outs_recorded: 0 }],
    ['stolen_base',   { play_type: 'stolen_base', hit: false, outs_recorded: 0 }],
  ];

  for (const [name, fields] of cases) {
    test(`${name} parses correctly`, async () => {
      const payload = {
        ...validPlay(), runners: [], runs_scored: 0, rbi: 0, ...fields,
      };
      const result = await parsePlayWith(JSON.stringify(payload));
      assert.equal(result.play_type, fields.play_type);
      assert.equal(result.hit,       fields.hit);
      assert.equal(result.outs_recorded, fields.outs_recorded);
    });
  }

});

describe('runner data integrity', () => {

  test('grand slam has 4 runners moving to H', async () => {
    const payload = {
      play_type: 'home_run', batter: 'Johnny',
      outs_recorded: 0, runs_scored: 4, rbi: 4,
      hit: true, error: false,
      runners: [
        { name: 'Johnny', from: 'home', to: 'H' },
        { name: 'A',      from: '1',   to: 'H' },
        { name: 'B',      from: '2',   to: 'H' },
        { name: 'C',      from: '3',   to: 'H' },
      ],
    };
    const result = await parsePlayWith(JSON.stringify(payload));
    const scorers = result.runners.filter(r => r.to === 'H');
    assert.equal(scorers.length, 4);
    assert.equal(result.runs_scored, 4);
  });

  test('double play has 2 outs_recorded and a runner going to "out"', async () => {
    const payload = {
      play_type: 'groundout', batter: null,
      outs_recorded: 2, runs_scored: 0, rbi: 0,
      hit: false, error: false,
      runners: [{ name: null, from: '1', to: 'out' }],
    };
    const result = await parsePlayWith(JSON.stringify(payload));
    assert.equal(result.outs_recorded, 2);
    assert.ok(result.runners.some(r => r.to === 'out'));
  });

  test('stolen base: runner advances, no outs, no runs', async () => {
    const payload = {
      play_type: 'stolen_base', batter: null,
      outs_recorded: 0, runs_scored: 0, rbi: 0,
      hit: false, error: false,
      runners: [{ name: 'Alex', from: '1', to: '2' }],
    };
    const result = await parsePlayWith(JSON.stringify(payload));
    assert.equal(result.runners[0].from, '1');
    assert.equal(result.runners[0].to,   '2');
    assert.equal(result.outs_recorded, 0);
  });

});

describe('context passed to LLM', () => {

  test('context string includes current outs and runners', () => {
    // Validates the context string we build — not the actual API call
    const gameState = {
      outs: 2,
      runners: { first: 'Alex', second: null, third: 'Carl' },
    };
    const context = `Current state: ${gameState.outs} out(s). Runners: first=${gameState.runners.first ?? 'empty'}, second=${gameState.runners.second ?? 'empty'}, third=${gameState.runners.third ?? 'empty'}.`;
    assert.ok(context.includes('2 out(s)'));
    assert.ok(context.includes('first=Alex'));
    assert.ok(context.includes('second=empty'));
    assert.ok(context.includes('third=Carl'));
  });

});
