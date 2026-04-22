/**
 * API handler tests — Supabase and Claude are fully mocked.
 * We import handlers directly and drive them with fake req/res objects.
 */
import { test, describe, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock Supabase ──────────────────────────────────────────────────────────
// We mock the module before any handler imports it.

const mockGames = new Map();
const mockPlays = [];
const mockLineups = [];
const mockTeams = [];

function makeSupabaseClient() {
  function rowsFor(table) {
    if (table === 'games') return [...mockGames.values()];
    if (table === 'plays') return mockPlays;
    if (table === 'game_lineups') return mockLineups;
    if (table === 'teams') return mockTeams;
    return [];
  }

  function buildSelect(table, filters = []) {
    const applyFilters = () => rowsFor(table).filter((row) =>
      filters.every(({ col, val }) => row?.[col] === val)
    );

    return {
      eq: (col, val) => buildSelect(table, [...filters, { col, val }]),
      single: () => {
        const rows = applyFilters();
        const data = rows[0] ?? null;
        const error = data ? null : { message: 'not found', code: 'PGRST116' };
        return { data, error };
      },
      order: () => ({
        limit: () => ({ data: applyFilters(), error: null }),
      }),
      limit: () => ({ data: applyFilters(), error: null }),
      then: undefined,
      data: applyFilters(),
    };
  }

  function buildUpdate(table, updates, filters = []) {
    const applyUpdate = () => {
      if (table === 'games') {
        const idFilter = filters.find(({ col }) => col === 'id');
        if (!idFilter || !mockGames.has(idFilter.val)) {
          return { data: null, error: { message: 'not found' } };
        }
        const updated = { ...mockGames.get(idFilter.val), ...updates };
        mockGames.set(idFilter.val, updated);
        return { data: updated, error: null };
      }

      if (table === 'game_lineups') {
        const index = mockLineups.findIndex((row) =>
          filters.every(({ col, val }) => row?.[col] === val)
        );
        if (index === -1) {
          return { data: null, error: { message: 'not found' } };
        }
        mockLineups[index] = { ...mockLineups[index], ...updates };
        return { data: mockLineups[index], error: null };
      }

      return { data: null, error: { message: 'not found' } };
    };

    return {
      eq: (col, val) => buildUpdate(table, updates, [...filters, { col, val }]),
      select: () => ({
        single: () => applyUpdate(),
      }),
      single: () => applyUpdate(),
    };
  }

  return {
    from: (table) => ({
      select: () => buildSelect(table),
      insert: (row) => ({
        select: () => ({
          single: () => {
            const newRow = { ...row, id: row.id ?? 'test-' + Date.now(), created_at: new Date().toISOString() };
            if (table === 'games') mockGames.set(newRow.id, newRow);
            else if (table === 'game_lineups') mockLineups.push(newRow);
            else mockPlays.push(newRow);
            return { data: newRow, error: null };
          },
        }),
      }),
      upsert: (row) => ({
        select: () => ({
          single: () => {
            if (table !== 'game_lineups') {
              return { data: null, error: { message: 'unsupported upsert' } };
            }

            const index = mockLineups.findIndex((existing) =>
              existing.game_id === row.game_id && existing.side === row.side
            );
            const nextRow = { ...row, id: row.id ?? mockLineups[index]?.id ?? 'test-' + Date.now() };
            if (index >= 0) mockLineups[index] = nextRow;
            else mockLineups.push(nextRow);
            return { data: nextRow, error: null };
          },
        }),
      }),
      update: (updates) => buildUpdate(table, updates),
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
    isMissingTableError: (error) => error?.code === '42P01',
  },
});

// ── Mock Claude ────────────────────────────────────────────────────────────
mock.module('../lib/claude.js', {
  namedExports: {
    parsePlay: async (rawInput) => {
      if (rawInput.includes('ball')) {
        return {
          play_type: 'ball',
          batter: null,
          outs_recorded: 0,
          runs_scored: 0,
          runners: [],
          rbi: 0,
          hit: false,
          error: false,
          balls_delta: 1,
          strikes_delta: 0,
        };
      }
      if (rawInput.includes('called strike') || rawInput === 'strike') {
        return {
          play_type: 'strike',
          batter: null,
          outs_recorded: 0,
          runs_scored: 0,
          runners: [],
          rbi: 0,
          hit: false,
          error: false,
          balls_delta: 0,
          strikes_delta: 1,
        };
      }
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
    parseFix: async (instruction) => {
      if (instruction.includes('3b should be at 2b')) {
        return {
          runners: { second: 'Batter', third: null },
          summary: 'Moved the batter from third base to second base',
        };
      }
      if (instruction.includes('count should be 2 and 1')) {
        return {
          balls: 2,
          strikes: 1,
          summary: 'Updated the count to 2-1',
        };
      }
      return {
        outs: 1,
        summary: 'Updated the game state',
      };
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

let gamesHandler, stateHandler, playHandler, countHandler, fixHandler, lineupHandler;

before(async () => {
  ({ default: gamesHandler } = await import('../api/games.js'));
  ({ default: stateHandler } = await import('../api/game/[id]/state.js'));
  ({ default: playHandler  } = await import('../api/game/[id]/play.js'));
  ({ default: countHandler } = await import('../api/game/[id]/count.js'));
  ({ default: fixHandler } = await import('../api/game/[id]/fix.js'));
  ({ default: lineupHandler } = await import('../api/game/[id]/lineup.js'));
});

function resetData() {
  mockGames.clear();
  mockPlays.length = 0;
  mockLineups.length = 0;
  mockTeams.length = 0;
}

beforeEach(() => {
  resetData();
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
    resetData();
    const req = makeReq('POST', {}, { home_team: 'Tigers', away_team: 'Lions' });
    const res = makeRes();
    await gamesHandler(req, res);
    assert.equal(res._status, 201);
    assert.equal(res._body.home_team, 'Tigers');
    assert.ok(res._body.id, 'should have an id');
  });

  test('returns 400 when team names missing', async () => {
    resetData();
    const req = makeReq('POST', {}, { home_team: 'Tigers' });
    const res = makeRes();
    await gamesHandler(req, res);
    assert.equal(res._status, 400);
  });

});

// ── Tests: GET /api/game/:id/state ─────────────────────────────────────────

describe('GET /api/game/:id/state', () => {

  test('returns game state for known game', async () => {
    resetData();
    seedGame('g-state-1');
    mockPlays.push(
      {
        id: 'play-1',
        game_id: 'g-state-1',
        inning: 1,
        half: 'top',
        raw_input: 'single to left',
        structured_play: { hit: true, error: false },
        score_after: { away: 0, home: 0 },
      },
      {
        id: 'play-2',
        game_id: 'g-state-1',
        inning: 1,
        half: 'bottom',
        raw_input: 'reached on error',
        structured_play: { hit: false, error: true },
        score_after: { away: 0, home: 0 },
      }
    );
    const req = makeReq('GET', { id: 'g-state-1' });
    const res = makeRes();
    await stateHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.id, 'g-state-1');
    assert.equal(res._body.away_hits, 1);
    assert.equal(res._body.home_hits, 0);
    assert.equal(res._body.away_errors, 1);
    assert.equal(res._body.home_errors, 0);
  });

  test('returns 404 for unknown game', async () => {
    resetData();
    const req = makeReq('GET', { id: 'does-not-exist' });
    const res = makeRes();
    await stateHandler(req, res);
    assert.equal(res._status, 404);
  });

  test('derives hits from hit play types even when hit flag is missing', async () => {
    resetData();
    seedGame('g-state-2');
    mockPlays.push({
      id: 'play-3',
      game_id: 'g-state-2',
      inning: 1,
      half: 'top',
      raw_input: 'double to the gap',
      structured_play: { play_type: 'double', error: false },
      score_after: { away: 0, home: 0 },
    });
    const req = makeReq('GET', { id: 'g-state-2' });
    const res = makeRes();
    await stateHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.away_hits, 1);
    assert.equal(res._body.home_hits, 0);
  });

});

// ── Tests: PATCH /api/game/:id/state ──────────────────────────────────────

describe('PATCH /api/game/:id/state', () => {

  test('updates stream_url', async () => {
    resetData();
    seedGame('g-patch-1');
    const req = makeReq('PATCH', { id: 'g-patch-1' }, { stream_url: 'https://youtube.com/watch?v=abc' });
    const res = makeRes();
    await stateHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.stream_url, 'https://youtube.com/watch?v=abc');
  });

  test('ignores disallowed fields', async () => {
    resetData();
    seedGame('g-patch-2');
    const req = makeReq('PATCH', { id: 'g-patch-2' }, { home_score: 99, stream_url: 'http://test' });
    const res = makeRes();
    await stateHandler(req, res);
    // home_score should not change since it's not in allowed list
    assert.equal(mockGames.get('g-patch-2').home_score, 0);
  });

  test('updates status to final', async () => {
    resetData();
    seedGame('g-patch-3');
    const req = makeReq('PATCH', { id: 'g-patch-3' }, { status: 'final' });
    const res = makeRes();
    await stateHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.status, 'final');
  });

});

describe('PATCH /api/game/:id/lineup', () => {

  test('updates current_batter_index on the game_lineups row', async () => {
    seedGame('g-lineup-1');
    mockLineups.push({
      id: 'lineup-1',
      game_id: 'g-lineup-1',
      side: 'away',
      team_id: 'team-1',
      players: [
        { name: 'Alice', batting_order: 1 },
        { name: 'Bea', batting_order: 2 },
      ],
      current_batter_index: 0,
    });

    const req = makeReq('PATCH', { id: 'g-lineup-1' }, { side: 'away', current_batter_index: 1 });
    const res = makeRes();
    await lineupHandler(req, res);

    assert.equal(res._status, 200);
    assert.equal(mockLineups[0].current_batter_index, 1);
    assert.equal(res._body.current_batter?.name, 'Bea');
    assert.equal(res._body.on_deck?.name, 'Alice');
  });

});

describe('POST /api/game/:id/lineup', () => {

  test('backfills players from selected team when client sends an empty lineup', async () => {
    seedGame('g-lineup-2');
    mockTeams.push({
      id: 'team-2',
      players: [
        { name: 'Nia', batting_order: 1, position: 'SS' },
        { name: 'Ola', batting_order: 2, position: 'P' },
      ],
    });

    const req = makeReq('POST', { id: 'g-lineup-2' }, { side: 'away', team_id: 'team-2', players: [] });
    const res = makeRes();
    await lineupHandler(req, res);

    assert.equal(res._status, 200);
    assert.equal(mockLineups[0].players.length, 2);
    assert.equal(mockLineups[0].players[0].name, 'Nia');
    assert.equal(res._body.current_batter?.name, 'Nia');
    assert.equal(res._body.on_deck?.name, 'Ola');
  });

});

// ── Tests: POST /api/game/:id/play ────────────────────────────────────────

describe('POST /api/game/:id/play', () => {

  test('strikeout increments outs', async () => {
    resetData();
    seedGame('g-play-1');
    const req = makeReq('POST', { id: 'g-play-1' }, { raw_input: 'K strikeout swinging' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.outs, 1);
    assert.equal(res._body.recent_play.raw_input, 'K strikeout swinging');
  });

  test('single puts runner on first', async () => {
    resetData();
    seedGame('g-play-2');
    const req = makeReq('POST', { id: 'g-play-2' }, { raw_input: 'Johnny hit a single' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.runners.first, 'Johnny');
  });

  test('home run scores a run', async () => {
    resetData();
    seedGame('g-play-3');
    const req = makeReq('POST', { id: 'g-play-3' }, { raw_input: 'Johnny hit a home run' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.away_score, 1);
  });

  test('three strikeouts flips half-inning', async () => {
    resetData();
    seedGame('g-play-4', { outs: 2 });
    const req = makeReq('POST', { id: 'g-play-4' }, { raw_input: 'K strikeout swinging' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._body.game.outs, 0);
    assert.equal(res._body.game.half, 'bottom');
  });

  test('returns 400 for missing raw_input', async () => {
    resetData();
    seedGame('g-play-5');
    const req = makeReq('POST', { id: 'g-play-5' }, {});
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._status, 400);
  });

  test('returns 404 for unknown game', async () => {
    resetData();
    const req = makeReq('POST', { id: 'no-such-game' }, { raw_input: 'strikeout' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._status, 404);
  });

  test('count resets to 0-0 after play', async () => {
    resetData();
    seedGame('g-play-6', { balls: 3, strikes: 2 });
    const req = makeReq('POST', { id: 'g-play-6' }, { raw_input: 'Johnny hit a single' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._body.game.balls,   0);
    assert.equal(res._body.game.strikes, 0);
  });

  test('ball input is persisted in the play log', async () => {
    resetData();
    seedGame('g-play-7');
    const req = makeReq('POST', { id: 'g-play-7' }, { raw_input: 'ball outside' });
    const res = makeRes();
    await playHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.balls, 1);
    assert.equal(res._body.recent_play.raw_input, 'ball outside');
    assert.equal(res._body.recent_play.structured_play.play_type, 'ball');
    assert.deepEqual(res._body.recent_play.structured_play.count_after, { balls: 1, strikes: 0 });
    assert.equal(mockPlays.at(-1).game_id, 'g-play-7');
  });

});

// ── Tests: PATCH /api/game/:id/count ──────────────────────────────────────

describe('PATCH /api/game/:id/count', () => {

  test('sets balls count', async () => {
    resetData();
    seedGame('g-count-1');
    const req = makeReq('PATCH', { id: 'g-count-1' }, { balls: 2 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.balls, 2);
  });

  test('sets strikes count', async () => {
    resetData();
    seedGame('g-count-2');
    const req = makeReq('PATCH', { id: 'g-count-2' }, { strikes: 1 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._body.game.strikes, 1);
  });

  test('clamps balls to max 3', async () => {
    resetData();
    seedGame('g-count-3');
    const req = makeReq('PATCH', { id: 'g-count-3' }, { balls: 99 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._body.game.balls, 0);
    assert.equal(res._body.recent_play.structured_play.play_type, 'walk');
  });

  test('clamps strikes to max 2', async () => {
    resetData();
    seedGame('g-count-4');
    const req = makeReq('PATCH', { id: 'g-count-4' }, { strikes: 99 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._body.game.strikes, 0);
    assert.equal(res._body.game.outs, 1);
    assert.equal(res._body.recent_play.structured_play.play_type, 'strikeout');
  });

  test('clamps to minimum 0', async () => {
    resetData();
    seedGame('g-count-5');
    const req = makeReq('PATCH', { id: 'g-count-5' }, { balls: -5 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._body.game.balls, 0);
  });

  test('manual ball increments create a recent play entry', async () => {
    resetData();
    seedGame('g-count-6');
    const req = makeReq('PATCH', { id: 'g-count-6' }, { balls: 1 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.recent_play.raw_input, 'Manual ball');
    assert.equal(res._body.recent_play.structured_play.play_type, 'ball');
    assert.deepEqual(res._body.recent_play.structured_play.count_after, { balls: 1, strikes: 0 });
    assert.equal(mockPlays.at(-1).game_id, 'g-count-6');
  });

  test('manual strike increments create a recent play entry', async () => {
    resetData();
    seedGame('g-count-7');
    const req = makeReq('PATCH', { id: 'g-count-7' }, { strikes: 1 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.recent_play.raw_input, 'Manual strike');
    assert.equal(res._body.recent_play.structured_play.play_type, 'strike');
    assert.equal(mockPlays.at(-1).game_id, 'g-count-7');
  });

  test('fourth manual ball triggers a walk and resets the count', async () => {
    resetData();
    seedGame('g-count-8', {
      balls: 3,
      runners: { first: 'Alex', second: null, third: null },
    });
    const req = makeReq('PATCH', { id: 'g-count-8' }, { balls: 4 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.balls, 0);
    assert.equal(res._body.game.strikes, 0);
    assert.equal(res._body.game.runners.first, 'Batter');
    assert.equal(res._body.game.runners.second, 'Alex');
    assert.equal(res._body.recent_play.raw_input, 'Manual walk');
  });

  test('third manual strike triggers a strikeout and records an out', async () => {
    resetData();
    seedGame('g-count-9', { strikes: 2, outs: 1 });
    const req = makeReq('PATCH', { id: 'g-count-9' }, { strikes: 3 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.balls, 0);
    assert.equal(res._body.game.strikes, 0);
    assert.equal(res._body.game.outs, 2);
    assert.equal(res._body.recent_play.raw_input, 'Manual strikeout');
  });

  test('rejects count changes for final games', async () => {
    resetData();
    seedGame('g-count-10', { status: 'final' });
    const req = makeReq('PATCH', { id: 'g-count-10' }, { balls: 1 });
    const res = makeRes();
    await countHandler(req, res);
    assert.equal(res._status, 400);
    assert.equal(res._body.error, 'Game is already final');
  });

});

// ── Tests: POST /api/game/:id/fix ────────────────────────────────────────

describe('POST /api/game/:id/fix', () => {

  test('moves a runner and logs the correction', async () => {
    resetData();
    seedGame('g-fix-1', {
      runners: { first: null, second: null, third: 'Batter' },
    });
    const req = makeReq('POST', { id: 'g-fix-1' }, { instruction: 'the batter on 3b should be at 2b' });
    const res = makeRes();
    await fixHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.runners.second, 'Batter');
    assert.equal(res._body.game.runners.third, null);
    assert.equal(res._body.recent_play.structured_play.play_type, 'fix');
    assert.equal(res._body.recent_play.raw_input, '/fix the batter on 3b should be at 2b');
  });

  test('updates the count from a fix command', async () => {
    resetData();
    seedGame('g-fix-2', { balls: 0, strikes: 0 });
    const req = makeReq('POST', { id: 'g-fix-2' }, { instruction: 'count should be 2 and 1' });
    const res = makeRes();
    await fixHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.balls, 2);
    assert.equal(res._body.game.strikes, 1);
  });

  test('rejects missing instruction', async () => {
    resetData();
    seedGame('g-fix-3');
    const req = makeReq('POST', { id: 'g-fix-3' }, {});
    const res = makeRes();
    await fixHandler(req, res);
    assert.equal(res._status, 400);
  });

  test('structured count fix bypasses model and updates safely', async () => {
    resetData();
    seedGame('g-fix-4', { balls: 0, strikes: 0 });
    const req = makeReq('POST', { id: 'g-fix-4' }, { instruction: 'count 3-2' });
    const res = makeRes();
    await fixHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.balls, 3);
    assert.equal(res._body.game.strikes, 2);
    assert.equal(res._body.summary, 'Updated the count to 3-2');
  });

  test('structured runner move moves the existing runner', async () => {
    resetData();
    seedGame('g-fix-5', {
      runners: { first: null, second: null, third: 'Alex' },
    });
    const req = makeReq('POST', { id: 'g-fix-5' }, { instruction: 'runner 3b->2b' });
    const res = makeRes();
    await fixHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.runners.second, 'Alex');
    assert.equal(res._body.game.runners.third, null);
  });

  test('structured runner assignment can clear a base', async () => {
    resetData();
    seedGame('g-fix-6', {
      runners: { first: 'Alex', second: null, third: null },
    });
    const req = makeReq('POST', { id: 'g-fix-6' }, { instruction: 'runner 1b=empty' });
    const res = makeRes();
    await fixHandler(req, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.game.runners.first, null);
  });

  test('rejects invalid structured count values', async () => {
    resetData();
    seedGame('g-fix-7');
    const req = makeReq('POST', { id: 'g-fix-7' }, { instruction: 'count 4-2' });
    const res = makeRes();
    await fixHandler(req, res);
    assert.equal(res._status, 422);
    assert.equal(res._body.error, 'balls must be between 0 and 3');
  });

  test('rejects runner move when source base is empty', async () => {
    resetData();
    seedGame('g-fix-8', {
      runners: { first: null, second: null, third: null },
    });
    const req = makeReq('POST', { id: 'g-fix-8' }, { instruction: 'runner 3b->2b' });
    const res = makeRes();
    await fixHandler(req, res);
    assert.equal(res._status, 422);
    assert.equal(res._body.error, 'No runner on third to move');
  });

  test('rejects runner move into an occupied base', async () => {
    resetData();
    seedGame('g-fix-9', {
      runners: { first: null, second: 'Jamie', third: 'Alex' },
    });
    const req = makeReq('POST', { id: 'g-fix-9' }, { instruction: 'runner 3b->2b' });
    const res = makeRes();
    await fixHandler(req, res);
    assert.equal(res._status, 422);
    assert.equal(res._body.error, 'second is already occupied');
  });

});
