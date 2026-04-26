const HIT_EVENTS = [
  ['home_run', /\b(home\s*run|homer|homered|hr)\b/],
  ['triple', /\b(triple|tripled)\b/],
  ['double', /\b(double|doubled)\b/],
  ['single', /\b(single|singled)\b/],
];

const BASE_WORDS = {
  first: '1',
  '1st': '1',
  '1': '1',
  second: '2',
  '2nd': '2',
  '2': '2',
  third: '3',
  '3rd': '3',
  '3': '3',
  home: 'H',
};

export function parseScoringCommand(rawInput, gameState = {}) {
  const raw = rawInput?.trim() ?? '';
  if (!raw) return null;

  const normalized = normalize(raw);

  return (
    parseAmbiguousInput(normalized, raw, gameState) ??
    parsePitch(normalized, raw) ??
    parseAtBatResult(normalized, raw, gameState) ??
    parseNotationOut(normalized, raw) ??
    parseBaseRunning(normalized, raw, gameState)
  );
}

function parseAmbiguousInput(normalized, raw, gameState) {
  if (/\bsafe at first\b/.test(normalized) && !/\b(single|walk|hit by pitch|hbp|error|fielder'?s choice|fc)\b/.test(normalized)) {
    return clarification(raw, 'Was the batter safe on a hit, error, walk, hit by pitch, or fielder\'s choice?');
  }

  if (/\brunner (scored|scores|came home)\b/.test(normalized) && occupiedBases(gameState).length > 1) {
    return clarification(raw, 'Which runner scored? Say the starting base, like "runner from second scored."');
  }

  if (/\bout at (second|2nd|2|third|3rd|3|home)\b/.test(normalized) && !/\b(from|runner on|runner from|batter)\b/.test(normalized)) {
    return clarification(raw, 'Which runner was out? Say the starting base, like "runner from first out at second."');
  }

  return null;
}

function parsePitch(normalized, raw) {
  if (/^(ball|ball\s+(one|two|three|four|1|2|3|4)|outside|inside|low|high|in the dirt)$/.test(normalized)) {
    return pitchCommand('ball', raw, normalized === 'ball four' || normalized === 'ball 4' ? 0.9 : 1);
  }

  if (/^(strike|called strike|strike looking|looking strike)$/.test(normalized)) {
    return pitchCommand('called_strike', raw);
  }

  if (/^(swinging strike|strike swinging|swing and miss|whiff)$/.test(normalized)) {
    return pitchCommand('swinging_strike', raw);
  }

  if (/^(foul|foul ball)$/.test(normalized)) {
    return pitchCommand('foul', raw);
  }

  if (/^foul tip$/.test(normalized)) {
    return pitchCommand('foul_tip', raw);
  }

  return null;
}

function parseAtBatResult(normalized, raw, gameState) {
  if (/\b(grand slam)\b/.test(normalized)) {
    return {
      type: 'at_bat_result',
      event: 'home_run',
      batter: extractBatter(raw, normalized, 'grand slam'),
      advances: occupiedBases(gameState).map((base) => ({ runner: null, from: base, to: 'H', reason: 'home_run' })),
      confidence: 0.98,
      raw,
    };
  }

  if (/\b(intentional walk|intentionally walked|ibb)\b/.test(normalized)) {
    return atBatCommand('intentional_walk', raw, normalized);
  }

  if (/\b(walk|walked|base on balls|bb)\b/.test(normalized)) {
    return atBatCommand('walk', raw, normalized);
  }

  if (/\b(hit by pitch|hbp|plunked)\b/.test(normalized)) {
    return atBatCommand('hit_by_pitch', raw, normalized);
  }

  if (/^(k|strikeout|struck out|k looking|k swinging|strikeout looking|strikeout swinging)$/.test(normalized)) {
    const modifiers = [];
    if (normalized.includes('looking')) modifiers.push('looking');
    if (normalized.includes('swinging')) modifiers.push('swinging');
    return atBatCommand('strikeout', raw, normalized, { modifiers });
  }

  for (const [event, pattern] of HIT_EVENTS) {
    if (pattern.test(normalized)) {
      return atBatCommand(event, raw, normalized, {
        advances: parseExplicitAdvances(normalized, gameState),
      });
    }
  }

  if (/\b(groundout|grounded out|grounds out)\b/.test(normalized)) {
    return atBatCommand('groundout', raw, normalized);
  }

  if (/\b(flyout|flied out|flies out|fly out)\b/.test(normalized)) {
    return atBatCommand('flyout', raw, normalized);
  }

  if (/\b(lineout|lined out|line out)\b/.test(normalized)) {
    return atBatCommand('lineout', raw, normalized);
  }

  if (/\b(popup|popped out|pop out)\b/.test(normalized)) {
    return atBatCommand('popup', raw, normalized);
  }

  return null;
}

function parseNotationOut(normalized, raw) {
  const doublePlay = normalized.match(/^([1-9](?:-[1-9]){2,})\s*(dp|double play)?$/);
  if (doublePlay && (doublePlay[2] || doublePlay[1].split('-').length >= 3)) {
    return {
      type: 'at_bat_result',
      event: 'groundout',
      fielding_sequence: doublePlay[1].split('-').map(Number),
      modifiers: ['double_play'],
      outs: [
        { runner: null, from: '1', base: '2', reason: 'force' },
        { runner: 'batter', from: 'home', base: '1', reason: 'putout' },
      ],
      confidence: 0.9,
      raw,
    };
  }

  const groundout = normalized.match(/^([1-9])\s*-\s*([1-9])$/);
  if (groundout) {
    return {
      type: 'at_bat_result',
      event: 'groundout',
      fielding_sequence: [Number(groundout[1]), Number(groundout[2])],
      confidence: 0.95,
      raw,
    };
  }

  const caughtBall = normalized.match(/^([flp])\s*([1-9])$/);
  if (caughtBall) {
    const event = { f: 'flyout', l: 'lineout', p: 'popup' }[caughtBall[1]];
    return {
      type: 'at_bat_result',
      event,
      fielding_sequence: [Number(caughtBall[2])],
      confidence: 0.95,
      raw,
    };
  }

  return null;
}

function parseBaseRunning(normalized, raw) {
  const move = parseRunnerMove(normalized, raw, 'base_running');
  if (move) return move;

  const out = parseRunnerOut(normalized, raw);
  if (out) return out;

  if (/^(bases clear|bases cleared|clears the bases)$/.test(normalized)) {
    return {
      type: 'base_running',
      event: 'wild_pitch',
      advances: ['1', '2', '3'].map((base) => ({ runner: null, from: base, to: 'H', reason: 'bases_cleared' })),
      confidence: 0.75,
      raw,
    };
  }

  if (/^(runners advance|all runners advance|runners move up)$/.test(normalized)) {
    return {
      type: 'base_running',
      event: 'wild_pitch',
      advances: [
        { runner: null, from: '3', to: 'H', reason: 'advance' },
        { runner: null, from: '2', to: '3', reason: 'advance' },
        { runner: null, from: '1', to: '2', reason: 'advance' },
      ],
      confidence: 0.8,
      raw,
    };
  }

  const stolen = normalized.match(/^(sb|steal|stole|stolen base)\s*(home|first|1st|1|second|2nd|2|third|3rd|3)?$/);
  if (stolen) {
    const to = BASE_WORDS[stolen[2]] ?? null;
    return {
      type: 'base_running',
      event: 'stolen_base',
      advances: to ? [{ runner: null, from: previousBase(to), to, reason: 'stolen_base' }] : [],
      confidence: to ? 0.9 : 0.7,
      needs_clarification: !to,
      raw,
    };
  }

  return null;
}

function parseRunnerMove(normalized, raw, commandType = 'base_running') {
  const move = normalized.match(/^(?:runner\s+)?(?:on|from)\s+(first|1st|1|second|2nd|2|third|3rd|3)\s+(?:to|goes to|moves to|advanced to|advances to|scores|scored|came home)\s*(home|first|1st|1|second|2nd|2|third|3rd|3)?$/);
  if (!move) return null;

  const from = BASE_WORDS[move[1]];
  const to = move[2] ? BASE_WORDS[move[2]] : 'H';
  return {
    type: commandType,
    event: commandType === 'base_running' ? 'wild_pitch' : undefined,
    advances: [{ runner: null, from, to, reason: commandType === 'base_running' ? 'advance' : 'on_play' }],
    confidence: 0.9,
    raw,
  };
}

function parseRunnerOut(normalized, raw) {
  const out = normalized.match(/^runner\s+(?:on|from)\s+(first|1st|1|second|2nd|2|third|3rd|3)\s+out at\s+(second|2nd|2|third|3rd|3|home)$/);
  if (!out) return null;

  const from = BASE_WORDS[out[1]];
  const base = BASE_WORDS[out[2]];
  return {
    type: 'base_running',
    event: 'caught_stealing',
    advances: [],
    outs: [{ runner: null, from, base, reason: 'tag_out' }],
    confidence: 0.9,
    raw,
  };
}

function atBatCommand(event, raw, normalized, extras = {}) {
  return {
    type: 'at_bat_result',
    event,
    batter: extractBatter(raw, normalized, event),
    confidence: 0.95,
    raw,
    ...extras,
  };
}

function pitchCommand(call, raw, confidence = 1) {
  return { type: 'pitch', call, result: 'live', confidence, raw };
}

function normalize(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,!]/g, '')
    .replace(/\s+/g, ' ');
}

function extractBatter(raw, normalized, event) {
  if (['strikeout', 'groundout', 'flyout', 'lineout', 'popup'].includes(event)) return null;

  const eventWords = {
    home_run: ['home run', 'homer', 'hr', 'grand slam'],
    intentional_walk: ['intentional walk', 'intentionally walked', 'ibb'],
    hit_by_pitch: ['hit by pitch', 'hbp', 'plunked'],
    walk: ['walked', 'walk', 'base on balls', 'bb'],
    single: ['singled', 'single'],
    double: ['doubled', 'double'],
    triple: ['tripled', 'triple'],
  }[event] ?? [event];

  const firstEventWord = eventWords.find((word) => normalized.includes(word));
  if (!firstEventWord) return null;

  const before = raw.slice(0, normalized.indexOf(firstEventWord)).trim();
  const match = before.match(/^([A-Z][A-Za-z'-]*)\b/);
  return match?.[1] ?? null;
}

function parseExplicitAdvances(normalized, gameState = {}) {
  const advances = [];

  const movePatterns = [
    /runner(?:\s+(?:on|from))?\s+(first|1st|1|second|2nd|2|third|3rd|3)\s+(?:scored|scores|came home)/g,
    /runner(?:\s+(?:on|from))?\s+(first|1st|1|second|2nd|2|third|3rd|3)\s+(?:to|goes to|moves to|advanced to|advances to)\s+(home|first|1st|1|second|2nd|2|third|3rd|3)/g,
  ];

  for (const pattern of movePatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const from = BASE_WORDS[match[1]];
      const to = match[2] ? BASE_WORDS[match[2]] : 'H';
      if (!advances.some((advance) => advance.from === from)) {
        advances.push({ runner: runnerNameForBase(gameState, from), from, to, reason: 'on_hit' });
      }
    }
  }

  return advances;
}

function occupiedBases(gameState) {
  const runners = gameState.runners ?? {};
  return [
    runners.first ? '1' : null,
    runners.second ? '2' : null,
    runners.third ? '3' : null,
  ].filter(Boolean);
}

function previousBase(base) {
  return { '2': '1', '3': '2', H: '3' }[base] ?? null;
}

function runnerNameForBase(gameState, base) {
  const key = { '1': 'first', '2': 'second', '3': 'third' }[base];
  return key ? gameState.runners?.[key] ?? null : null;
}

function clarification(raw, question) {
  return {
    type: 'clarification',
    needs_clarification: true,
    clarification_question: question,
    confidence: 0,
    raw,
  };
}
