export const COMMAND_TYPES = new Set(['pitch', 'at_bat_result', 'base_running', 'clarification']);

export const AT_BAT_EVENTS = new Set([
  'single',
  'double',
  'triple',
  'home_run',
  'walk',
  'intentional_walk',
  'hit_by_pitch',
  'strikeout',
  'groundout',
  'flyout',
  'lineout',
  'popup',
  'fielders_choice',
  'error',
  'sacrifice_bunt',
  'sacrifice_fly',
  'other',
]);

export const PITCH_CALLS = new Set([
  'ball',
  'called_strike',
  'swinging_strike',
  'foul',
  'foul_tip',
]);

export const BASE_RUNNING_EVENTS = new Set([
  'stolen_base',
  'caught_stealing',
  'pickoff',
  'wild_pitch',
  'passed_ball',
  'balk',
  'defensive_indifference',
]);

export const BASES = new Set(['home', '1', '2', '3', 'H', 'out']);

export function validateCommand(command) {
  if (!command || typeof command !== 'object') {
    return { valid: false, reason: 'Command must be an object' };
  }

  if (!COMMAND_TYPES.has(command.type)) {
    return { valid: false, reason: `Invalid command type: ${command.type}` };
  }

  if (command.type === 'clarification') {
    return command.needs_clarification
      ? { valid: true }
      : { valid: false, reason: 'Clarification command must request clarification' };
  }

  if (command.type === 'pitch' && !PITCH_CALLS.has(command.call)) {
    return { valid: false, reason: `Invalid pitch call: ${command.call}` };
  }

  if (command.type === 'at_bat_result' && !AT_BAT_EVENTS.has(command.event)) {
    return { valid: false, reason: `Invalid at-bat event: ${command.event}` };
  }

  if (command.type === 'base_running' && !BASE_RUNNING_EVENTS.has(command.event)) {
    return { valid: false, reason: `Invalid base-running event: ${command.event}` };
  }

  for (const advance of command.advances ?? []) {
    if (!BASES.has(advance.from) || !BASES.has(advance.to)) {
      return { valid: false, reason: `Invalid advance: ${advance.from} to ${advance.to}` };
    }
  }

  for (const out of command.outs ?? []) {
    if (out.base && !BASES.has(out.base)) {
      return { valid: false, reason: `Invalid out base: ${out.base}` };
    }
  }

  return { valid: true };
}

export function commandConfidence(command) {
  return typeof command?.confidence === 'number' ? command.confidence : 1;
}
