/**
 * API handler tests — Supabase and Claude are fully mocked.
 * We import handlers directly and drive them with fake req/res objects.
 */
import { test, describe, before, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock Supabase ──────────────────────────────────────────────────────────
// We mock the module before any handler imports it.

const mockGames = new Map();
const mockPlays = [];

function makeSupabaseClient() {
  const chain = (data, error = null) => ({
    data, error,
    single:  () => ({ data: Array.isArray(data) ? data[0] ?? null : data, error }),
    select:  () => chain(data, error),
    insert:  () => chain(data, error),
    update:  () => chain(data, error),
    delete:  () => chain(data, error),
    eq:      () => chain(data, error),
    order:   () => chain(data, error),
    limit:   () => chain(data, error),
  });

  return {
    from: (table) => ({
      select: (cols) => ({
        eq: (col, val) => ({
          single: () => {
            if (table === 'games') {
              const g = mockGames.get(val);
              return { data: g ?? null, error: g ? null : { message: 'not found', code: 'PGRST116' } };
            }
            return { data: null, error: { message: 'not found' } };
          },
          order: () => ({ limit: () => ({ data: mockPlays.filter(p => p.game_id === val), error: null }) }),
        }),
        order: () => ({ limit: () => ({ data: [...mockGames.values()], error: null }) }),
      }),
      insert: (row) => ({
        select: () => ({
          single: () => {
            const newRow = { ...row, id: row.id ?? 'test-' + Date.now(), created_at: new Date().toISOString() };
            if (table === 'games') mockGames.set(newRow.id, newRow);
            else mockPlays.push(newRow);
            return { data: newRow, error: null };
          },
        }),
      }),
      update: (updates) => ({
        eq: (col, val) => ({
          select: () => ({
            single: () => {
              if (table === 'games' && mockGames.has(val)) {
                const updated = { ...mockGames.get(val), ...updates };
                mockGames.set(val, updated);
                return { data: updated, error: null };
              }
              return { data: null, error: { message: 'not found' } };
            },
          }),
        }),
      }),
      delete: () => ({
        eq: (col, val) => ({ data: null, error: null }),
      }),
    }),
  };
}

// Inject mock before handlers load
mock.module('../lib/supabase.js', {
  namedExports: {
    supabaseAdmin: makeSupabaseClient(),
    supabaseConfig: { url: 'http://test', anonKey: 'test' },
  },
});

// ── Mock Claude ────────────────────────────────────────────────────────────
mock.module('../lib/claude.js', {
  namedExports: {
    parsePlay: async (rawInput) => {
      if (rawInput.includes('strikeout') || rawInput.includes(' K ') || rawInput === 'K') {
        return { play_type: 'strikeout', batter: null, outs_recorded: 1, runs_scored: 0, runners: [], rbi: 0, hit: false, error: false };
      }
      if (rawInput.includes('single')) {
        return { play_type: 'single', batter: 'Johnny', outs_recorded: 0, runs_scored: 0, runners: [{ name: 'Johnny', from: 'home', to: '1' }], rbi: 0, hit: true, error: false };
      }
      if (rawInput.includes('home run')) {
        return { play_type: 'home_run', batter: 'Johnny', outs_recorded: 0, runs_scored: 1, runners: [{ name: 'Johnny', from: 'home', to: 'H' }], rbi: 1, hit: true, error: false };
      }
      // Default: groundout
      return { play_type: 'groundout', batter: null, outs_recorded: 1, runs_scored: 0, runners: [], rbi: 0, hit: false, error: false };
    },
  },
});

// ── Fake req/res ───────────────────────────────────────────────────────────

function makeReq(method, params = {}, body = {}, query = {}) {
  return { method, params, body, query: { ...params, ...query } };
}

function makeRes() {
  const res = {
    _status: 200, _body: null,
    status(code) { this._status = code; return this; },
    json(body)   { this._body = body;   return this; },
    end()        { return this; },
    setHeader()  { return this; },
  };
  return res;
}

// ── Lazy-load handlers after mocks are set up ──────────────────────────────

let gamesHandler, stateHandler, playHandler, countHandler;

before(async () => {
  ({ default: gamesHandler } = await import('../api/games.js'));
  ({ default: stateHandler } = await import('../api/game/[id]/state.js'));
  ({ default: playHandler  } = await import('../api/game/[id]/play.js'));
  ({ default: countHandler } = await import('../api/game/[id]/count.js'));
});

// ── Seed helper ────────────────────────────────────────────────────────────

function seedGame(id = 'game-1', overrides = {}) {
  const g = {
    id, home_team: 'Tigers', away_team: 'Lions',
    inning: 1, half: 'top', outs: 0,
    home_score: 0, away_score: 0, balls: 0, strikes: 0,
    runners: { first: null, second: null, third: null },
    inning_scores: { top: [], bottom: [] },
    status: 'live',
    ...overrides,
  };
  mockGames.set(id, g);
  return g;
}

// ── Tests: POST /api/games ─────────────────────────────────────────────────

describe('POST /api/games', () => {

  test('creates a game and returns it', async () => {
    const req = makeReq('POST', {}, { home_team: 'Tigers', away_team: 'Lions' });
    const res = makeRes();
    await gamesHandler(req, res);
    assert.equal(res._status, 201);
    assert.equal(res._body.home_team, 'Tigers');
    assert.ok(res._body.id, 'should have an id');
  });

  test('returns 400 when team names missing', async () => {
    const req = makeReq('POST', {}, { home_team: 'Tigers' });
    const res = makeRes();
    await gamesHandler(req, res);
    assert.equal(res._status, 400);
  });

});

// ── Tests: GET /api/game/:id/state ─────────────────────────────────────────

describe('GET /api/game/:id/state', () => {

  test('returns game state for known game', async () => {
    seedGame('g-state-1');
    const req = makeReq('GET', { id: 'g-state-1' });
    const res = makeRes();
    await stateHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.id, 'g-state-1');
  });

  test('returns 404 for unknown game', async () => {
    const req = makeReq('GET', { id: 'does-not-exist' });
    const res = makeRes();
    await stateHandler(req, res);
    assert.equal(res._status, 404);
  });

});

// ── Tests: PATCH /api/game/:id/state ──────────────────────────────────────

describe('PATCH /api/game/:id/state', () => {

  test('updates stream_url', async () => {
    seedGame('g-patch-1');
    const req = makeReq('PATCH', { id: 'g-patch-1' }, { stream_url: 'https://youtube.com/watch?v=abc' });
    const res = makeRes();
    await stateHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.stream_url, 'https://youtube.com/watch?v=abc');
  });

  test('ignores disallowed fields', async () => {
    seedGame('g-patch-2');
    const req = makeReq('PATCH', { id: 'g-patch-2' }, { home_score: 99, stream_url: 'http://test' });
    const res = makeRes();
    await stateHandler(req, res);
    // home_score should not change since it's not in allowed list
    assert.equal(mockGames.get('g-patch-2').home_score, 0);
  });

});

// ── Tests: POST /api/game/:id/play ────────────────────────────────────────

describe('POST /api/game/:id/play', () => {

  test('strikeout increments outs', async () => {
    seedGame('g-play-1');
    const req = makeReq('POST', { id: 'g-play-1' }, { raw_input: 'K strikeout swinging' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.outs, 1);
  });

  test('single puts runner on first', async () => {
    seedGame('g-play-2');
    const req = makeReq('POST', { id: 'g-play-2' }, { raw_input: 'Johnny hit a single' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.runners.first, 'Johnny');
  });

  test('home run scores a run', async () => {
    seedGame('g-play-3');
    const req = makeReq('POST', { id: 'g-play-3' }, { raw_input: 'Johnny hit a home run' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.away_score, 1);
  });

  test('three strikeouts flips half-inning', async () => {
    seedGame('g-play-4', { outs: 2 });
    const req = makeReq('POST', { id: 'g-play-4' }, { raw_input: 'K strikeout swinging' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._body.game.outs, 0);
    assert.equal(res._body.game.half, 'bottom');
  });

  test('returns 400 for missing raw_input', async () => {
    seedGame('g-play-5');
    const req = makeReq('POST', { id: 'g-play-5' }, {});
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._status, 400);
  });

  test('returns 404 for unknown game', async () => {
    const req = makeReq('POST', { id: 'no-such-game' }, { raw_input: 'strikeout' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._status, 404);
  });

  test('count resets to 0-0 after play', async () => {
    seedGame('g-play-6', { balls: 3, strikes: 2 });
    const req = makeReq('POST', { id: 'g-play-6' }, { raw_input: 'Johnny hit a single' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._body.game.balls,   0);
    assert.equal(res._body.game.strikes, 0);
  });

});

// ── Tests: PATCH /api/game/:id/count ──────────────────────────────────────

describe('PATCH /api/game/:id/count', () => {

  test('sets balls count', async () => {
    seedGame('g-count-1');
    const req = makeReq('PATCH', { id: 'g-count-1' }, { balls: 2 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.balls, 2);
  });

  test('sets strikes count', async () => {
    seedGame('g-count-2');
    const req = makeReq('PATCH', { id: 'g-count-2' }, { strikes: 1 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._body.strikes, 1);
  });

  test('clamps balls to max 3', async () => {
    seedGame('g-count-3');
    const req = makeReq('PATCH', { id: 'g-count-3' }, { balls: 99 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._body.balls, 3);
  });

  test('clamps strikes to max 2', async () => {
    seedGame('g-count-4');
    const req = makeReq('PATCH', { id: 'g-count-4' }, { strikes: 99 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._body.strikes, 2);
  });

  test('clamps to minimum 0', async () => {
    seedGame('g-count-5');
    const req = makeReq('PATCH', { id: 'g-count-5' }, { balls: -5 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._body.balls, 0);
  });

});
