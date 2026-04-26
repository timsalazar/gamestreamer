import { validateCommand } from './scoring-schema.js';

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

export function applyCommand(gameState, command) {
  const commandValidation = validateCommand(command);
  if (!commandValidation.valid) {
    return { valid: false, reason: commandValidation.reason };
  }

  if (command.type === 'pitch') {
    return applyPitchCommand(gameState, command);
  }

  const play = commandToPlay(gameState, command);
  const playValidation = validatePlay(gameState, play);
  if (!playValidation.valid) {
    return { valid: false, reason: playValidation.reason, play };
  }

  return {
    valid: true,
    state: applyPlay(gameState, play),
    play,
  };
}

export function commandToPlay(gameState, command) {
  if (command.type === 'base_running') {
    return baseRunningCommandToPlay(gameState, command);
  }

  const event = command.event;
  if (event === 'walk' || event === 'intentional_walk') {
    return buildAwardFirstPlay(gameState, command, 'walk');
  }
  if (event === 'hit_by_pitch') {
    return buildAwardFirstPlay(gameState, command, 'hit_by_pitch');
  }
  if (event === 'strikeout') {
    return buildSimpleOutPlay(command, 'strikeout');
  }
  if (['groundout', 'flyout', 'lineout', 'popup'].includes(event)) {
    return buildBattedOutPlay(command);
  }
  if (['single', 'double', 'triple', 'home_run'].includes(event)) {
    return buildHitPlay(gameState, command);
  }

  return {
    play_type: event,
    batter: command.batter ?? null,
    outs_recorded: command.outs?.length ?? 0,
    runs_scored: command.advances?.filter((advance) => advance.to === 'H').length ?? 0,
    runners: command.advances?.map(advanceToRunner) ?? [],
    rbi: command.advances?.filter((advance) => advance.to === 'H').length ?? 0,
    hit: false,
    error: event === 'error',
    balls_delta: 0,
    strikes_delta: 0,
    notes: command.raw ?? '',
    scoring_command: command,
  };
}

function applyPitchCommand(gameState, command) {
  const balls = gameState.balls ?? 0;
  const strikes = gameState.strikes ?? 0;

  if (command.call === 'ball' && balls + 1 >= 4) {
    const play = buildAwardFirstPlay(gameState, { ...command, event: 'walk' }, 'walk');
    const validation = validatePlay(gameState, play);
    if (!validation.valid) return { valid: false, reason: validation.reason, play };
    return { valid: true, state: applyPlay(gameState, play), play };
  }

  if (['called_strike', 'swinging_strike', 'foul_tip'].includes(command.call) && strikes + 1 >= 3) {
    const play = buildSimpleOutPlay(command, 'strikeout');
    const validation = validatePlay(gameState, play);
    if (!validation.valid) return { valid: false, reason: validation.reason, play };
    return { valid: true, state: applyPlay(gameState, play), play };
  }

  const ballsDelta = command.call === 'ball' ? 1 : 0;
  const strikesDelta = command.call === 'foul' && strikes >= 2 ? 0 : command.call === 'ball' ? 0 : 1;
  const newState = structuredClone(gameState);
  newState.balls = Math.min(3, balls + ballsDelta);
  newState.strikes = Math.min(2, strikes + strikesDelta);

  const play = {
    play_type: command.call === 'ball' ? 'ball' : 'strike',
    batter: null,
    outs_recorded: 0,
    runs_scored: 0,
    runners: [],
    rbi: 0,
    hit: false,
    error: false,
    balls_delta: ballsDelta,
    strikes_delta: strikesDelta,
    notes: command.raw ?? command.call,
    scoring_command: command,
  };

  return { valid: true, state: newState, play };
}

function buildAwardFirstPlay(gameState, command, playType) {
  const runners = forcedAwardAdvances(gameState);
  runners.push({ name: command.batter ?? 'Batter', from: 'home', to: '1' });
  const runs = runners.filter((runner) => runner.to === 'H').length;

  return {
    play_type: playType,
    batter: command.batter ?? 'Batter',
    outs_recorded: 0,
    runs_scored: runs,
    runners,
    rbi: runs,
    hit: false,
    error: false,
    balls_delta: 0,
    strikes_delta: 0,
    notes: command.raw ?? '',
    scoring_command: command,
  };
}

function forcedAwardAdvances(gameState) {
  const runners = [];
  const current = gameState.runners ?? {};

  if (current.first) {
    if (current.second) {
      if (current.third) runners.push({ name: current.third, from: '3', to: 'H' });
      runners.push({ name: current.second, from: '2', to: '3' });
    }
    runners.push({ name: current.first, from: '1', to: '2' });
  }

  return runners;
}

function buildSimpleOutPlay(command, playType) {
  return {
    play_type: playType,
    batter: command.batter ?? null,
    outs_recorded: 1,
    runs_scored: 0,
    runners: [],
    rbi: 0,
    hit: false,
    error: false,
    balls_delta: 0,
    strikes_delta: 0,
    notes: command.raw ?? '',
    scoring_command: command,
  };
}

function buildBattedOutPlay(command) {
  const outs = command.outs?.length ? command.outs.length : 1;
  const outMovements = (command.outs ?? [])
    .filter((out) => out.runner !== 'batter' && out.from)
    .map((out) => ({ name: out.runner ?? null, from: out.from, to: 'out' }));
  const advances = command.advances?.map(advanceToRunner) ?? [];

  return {
    play_type: command.event === 'lineout' || command.event === 'popup' ? 'flyout' : command.event,
    batter: command.batter ?? null,
    outs_recorded: outs,
    runs_scored: command.advances?.filter((advance) => advance.to === 'H').length ?? 0,
    runners: [...advances, ...outMovements],
    rbi: command.advances?.filter((advance) => advance.to === 'H').length ?? 0,
    hit: false,
    error: false,
    balls_delta: 0,
    strikes_delta: 0,
    notes: command.raw ?? '',
    scoring_command: command,
  };
}

function buildHitPlay(gameState, command) {
  const destination = { single: '1', double: '2', triple: '3', home_run: 'H' }[command.event];
  const advances = [...(command.advances ?? [])];
  const runners = gameState.runners ?? {};

  if (command.event === 'home_run') {
    for (const [baseName, base] of [['third', '3'], ['second', '2'], ['first', '1']]) {
      if (runners[baseName] && !advances.some((advance) => advance.from === base)) {
        advances.push({ runner: runners[baseName], from: base, to: 'H', reason: 'home_run' });
      }
    }
  } else {
    addDefaultHitAdvances(command.event, advances, runners);
  }

  advances.push({
    runner: command.batter ?? 'Batter',
    from: 'home',
    to: destination,
    reason: command.event,
  });

  const runs = advances.filter((advance) => advance.to === 'H').length;
  return {
    play_type: command.event,
    batter: command.batter ?? null,
    outs_recorded: 0,
    runs_scored: runs,
    runners: advances.map(advanceToRunner),
    rbi: runs,
    hit: true,
    error: false,
    balls_delta: 0,
    strikes_delta: 0,
    notes: command.raw ?? '',
    scoring_command: command,
  };
}

function addDefaultHitAdvances(event, advances, runners) {
  const alreadyMoved = (base) => advances.some((advance) => advance.from === base);

  if (event === 'single') {
    if (runners.third && runners.second && runners.first && !alreadyMoved('3')) {
      advances.push({ runner: runners.third, from: '3', to: 'H', reason: 'forced_by_batter' });
    }
    if (runners.second && runners.first && !alreadyMoved('2')) {
      advances.push({ runner: runners.second, from: '2', to: '3', reason: 'forced_by_batter' });
    }
    if (runners.first && !alreadyMoved('1')) {
      advances.push({ runner: runners.first, from: '1', to: '2', reason: 'forced_by_batter' });
    }
    return;
  }

  if (event === 'double') {
    if (runners.third && !alreadyMoved('3')) {
      advances.push({ runner: runners.third, from: '3', to: 'H', reason: 'on_hit' });
    }
    if (runners.second && !alreadyMoved('2')) {
      advances.push({ runner: runners.second, from: '2', to: 'H', reason: 'on_hit' });
    }
    if (runners.first && !alreadyMoved('1')) {
      advances.push({ runner: runners.first, from: '1', to: '3', reason: 'on_hit' });
    }
    return;
  }

  if (event === 'triple') {
    for (const [baseName, base] of [['third', '3'], ['second', '2'], ['first', '1']]) {
      if (runners[baseName] && !alreadyMoved(base)) {
        advances.push({ runner: runners[baseName], from: base, to: 'H', reason: 'on_hit' });
      }
    }
  }
}

function baseRunningCommandToPlay(gameState, command) {
  const advances = command.advances ?? [];
  const outMovements = (command.outs ?? [])
    .filter((out) => out.from)
    .map((out) => ({
      name: out.runner ?? runnerNameForBase(gameState, out.from),
      from: out.from,
      to: 'out',
    }));
  return {
    play_type: command.event,
    batter: null,
    outs_recorded: command.outs?.length ?? 0,
    runs_scored: advances.filter((advance) => advance.to === 'H').length,
    runners: [
      ...advances.map((advance) => ({
        name: advance.runner ?? runnerNameForBase(gameState, advance.from),
        from: advance.from,
        to: advance.to,
      })),
      ...outMovements,
    ],
    rbi: 0,
    hit: false,
    error: false,
    balls_delta: 0,
    strikes_delta: 0,
    notes: command.raw ?? '',
    scoring_command: command,
  };
}

function advanceToRunner(advance) {
  return {
    name: advance.runner === 'batter' ? null : advance.runner ?? null,
    from: advance.from,
    to: advance.to,
  };
}

function runnerNameForBase(gameState, base) {
  const key = baseKey(base);
  return key ? gameState.runners?.[key] ?? null : null;
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
