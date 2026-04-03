/**
 * Apply a structured scoring event to the current game state.
 * Returns the updated game state (does not mutate the original).
 */
export function applyPlay(gameState, play) {
  const state = structuredClone(gameState);

  // Ensure inning_scores structure exists
  if (!state.inning_scores) state.inning_scores = { top: [], bottom: [] };

  // --- Move runners ---
  for (const runner of play.runners) {
    if (runner.from === 'home') {
      if (runner.to !== 'out' && runner.to !== 'H') {
        state.runners[baseKey(runner.to)] = runner.name ?? play.batter ?? 'Runner';
      }
    } else {
      state.runners[baseKey(runner.from)] = null;
      if (runner.to !== 'out' && runner.to !== 'H') {
        state.runners[baseKey(runner.to)] = runner.name ?? 'Runner';
      }
    }
  }

  // --- Runs + inning scores ---
  if (play.runs_scored > 0) {
    const half = state.half;
    const idx  = state.inning - 1;
    const scores = state.inning_scores[half];
    // Pad array up to current inning if needed
    while (scores.length <= idx) scores.push(0);
    scores[idx] = (scores[idx] ?? 0) + play.runs_scored;

    if (half === 'top') {
      state.away_score += play.runs_scored;
    } else {
      state.home_score += play.runs_scored;
    }
  }

  // --- Outs ---
  state.outs += play.outs_recorded;

  // --- Reset count after every play ---
  state.balls   = 0;
  state.strikes = 0;

  // --- End of half-inning ---
  if (state.outs >= 3) {
    state.outs    = 0;
    state.runners = { first: null, second: null, third: null };

    if (state.half === 'top') {
      state.half = 'bottom';
    } else {
      state.half   = 'top';
      state.inning += 1;
    }
  }

  return state;
}

/**
 * Validate that a structured play makes sense.
 * Returns { valid: true } or { valid: false, reason: string }
 */
export function validatePlay(gameState, play) {
  if (play.outs_recorded < 0 || play.outs_recorded > 3) {
    return { valid: false, reason: `Invalid outs_recorded: ${play.outs_recorded}` };
  }
  if (play.runs_scored < 0 || play.runs_scored > 4) {
    return { valid: false, reason: `Invalid runs_scored: ${play.runs_scored}` };
  }
  const runnersToH = play.runners.filter(r => r.to === 'H').length;
  if (runnersToH !== play.runs_scored) {
    return {
      valid: false,
      reason: `runs_scored (${play.runs_scored}) doesn't match runners moving to H (${runnersToH})`,
    };
  }
  return { valid: true };
}

function baseKey(base) {
  return { '1': 'first', '2': 'second', '3': 'third' }[base];
}

export function ordinalInning(inning, half) {
  const suffix = [, 'st', 'nd', 'rd'][inning] ?? 'th';
  return `${half === 'top' ? 'Top' : 'Bot'} ${inning}${suffix}`;
}

/**
 * Build a box score table from game state.
 * Returns { innings, away: number[], home: number[], maxInning: number }
 */
export function buildBoxScore(game) {
  const maxInning = Math.max(
    game.inning,
    game.inning_scores?.top?.length    ?? 0,
    game.inning_scores?.bottom?.length ?? 0,
    9
  );
  const away = [];
  const home = [];
  for (let i = 0; i < maxInning; i++) {
    away.push(game.inning_scores?.top?.[i]    ?? null);
    home.push(game.inning_scores?.bottom?.[i] ?? null);
  }
  return { maxInning, away, home };
}
