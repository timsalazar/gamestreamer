/**
 * teams-api.test.js
 *
 * Documentation-as-tests for the /api/teams endpoints.
 * No test framework required — uses plain Node.js with fetch (Node 18+).
 * Run with: node tests/teams-api.test.js
 *
 * These tests document expected API behaviour and can be run against a local
 * dev server. Set BASE_URL to point at your running instance.
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

async function run() {
  console.log(`\nRunning teams API smoke tests against ${BASE_URL}\n`);

  // ---------------------------------------------------------------
  // Unauthenticated GET /api/teams → 401
  // ---------------------------------------------------------------
  console.log('1. GET /api/teams (no auth) → 401');
  {
    const res = await fetch(`${BASE_URL}/api/teams`);
    assert(res.status === 401, `status is 401 (got ${res.status})`);
    const body = await res.json();
    assert(typeof body.error === 'string', 'response body has an error string');
  }

  // ---------------------------------------------------------------
  // Unauthenticated POST /api/teams → 401
  // ---------------------------------------------------------------
  console.log('\n2. POST /api/teams (no auth) → 401');
  {
    const res = await fetch(`${BASE_URL}/api/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Team', players: [] }),
    });
    assert(res.status === 401, `status is 401 (got ${res.status})`);
    const body = await res.json();
    assert(typeof body.error === 'string', 'response body has an error string');
  }

  // ---------------------------------------------------------------
  // Unauthenticated GET /api/teams/:id → 401
  // ---------------------------------------------------------------
  console.log('\n3. GET /api/teams/:id (no auth) → 401');
  {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE_URL}/api/teams/${fakeId}`);
    assert(res.status === 401, `status is 401 (got ${res.status})`);
    const body = await res.json();
    assert(typeof body.error === 'string', 'response body has an error string');
  }

  // ---------------------------------------------------------------
  // Successful GET /api/teams response shape (documented)
  // ---------------------------------------------------------------
  console.log('\n4. GET /api/teams response shape (documentation)');
  console.log('   A successful authenticated response must be an array where');
  console.log('   each element matches the following shape:');
  console.log('');
  console.log('   {');
  console.log('     id:         string  — UUID of the team');
  console.log('     name:       string  — display name of the team');
  console.log('     owner_id:   string  — UUID of the owning user');
  console.log('     players:    array   — ordered roster; each player:');
  console.log('                            { batting_order, name, position, number? }');
  console.log('     role:       string  — "owner" | "viewer" (relative to caller)');
  console.log('     created_at: string  — ISO 8601 timestamp');
  console.log('     updated_at: string  — ISO 8601 timestamp');
  console.log('   }');
  console.log('');

  // Validate shape helper (call this against real data in integration tests)
  function validateTeamShape(team) {
    const errors = [];
    if (typeof team.id !== 'string') errors.push('id must be a string');
    if (typeof team.name !== 'string') errors.push('name must be a string');
    if (typeof team.owner_id !== 'string') errors.push('owner_id must be a string');
    if (!Array.isArray(team.players)) errors.push('players must be an array');
    if (team.role !== 'owner' && team.role !== 'viewer') errors.push('role must be "owner" or "viewer"');
    if (typeof team.created_at !== 'string') errors.push('created_at must be a string');
    if (typeof team.updated_at !== 'string') errors.push('updated_at must be a string');
    return errors;
  }

  // Self-test the shape validator with a mock object
  const mockTeam = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Home Runs',
    owner_id: 'aaaa0000-0000-0000-0000-000000000000',
    players: [{ batting_order: 1, name: 'Jane Smith', position: 'SS' }],
    role: 'owner',
    created_at: '2026-04-18T00:00:00.000Z',
    updated_at: '2026-04-18T00:00:00.000Z',
  };
  const shapeErrors = validateTeamShape(mockTeam);
  assert(shapeErrors.length === 0, `mock team object passes shape validation (errors: ${shapeErrors.join(', ') || 'none'})`);

  // ---------------------------------------------------------------
  // Successful GET /api/teams/:id response shape (documented)
  // ---------------------------------------------------------------
  console.log('\n5. GET /api/teams/:id response shape (documentation)');
  console.log('   A successful authenticated response includes all team fields');
  console.log('   plus a computed player_count:');
  console.log('');
  console.log('   {');
  console.log('     ...team fields (see above),');
  console.log('     player_count: number  — length of the players array');
  console.log('   }');
  console.log('');

  function validateTeamByIdShape(team) {
    const errors = validateTeamShape(team);
    if (typeof team.player_count !== 'number') errors.push('player_count must be a number');
    if (team.player_count !== team.players.length) errors.push('player_count must equal players.length');
    return errors;
  }

  const mockTeamById = { ...mockTeam, player_count: mockTeam.players.length };
  const byIdErrors = validateTeamByIdShape(mockTeamById);
  assert(byIdErrors.length === 0, `mock GET /:id object passes shape validation (errors: ${byIdErrors.join(', ') || 'none'})`);

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
