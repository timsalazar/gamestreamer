import { supabaseAdmin } from '../../../lib/supabase.js';
import { parseFix } from '../../../lib/claude.js';

const ALLOWED_FIELDS = new Set([
  'runners',
  'balls',
  'strikes',
  'outs',
  'inning',
  'half',
  'home_score',
  'away_score',
]);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const instruction = req.body?.instruction?.trim();
  if (!instruction) return res.status(400).json({ error: 'instruction is required' });

  const { data: game, error: gameErr } = await supabaseAdmin
    .from('games')
    .select('*')
    .eq('id', id)
    .single();

  if (gameErr || !game) return res.status(404).json({ error: 'Game not found' });
  if (game.status === 'final') return res.status(400).json({ error: 'Game is already final' });

  let fix;
  try {
    const structured = parseStructuredFix(instruction, game);
    if (structured) {
      fix = structured;
    } else {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Claude API timeout')), 25000)
      );
      fix = await Promise.race([parseFix(instruction, game), timeoutPromise]);
    }
  } catch (err) {
    if (err.code === 'INVALID_FIX') {
      return res.status(422).json({ error: err.message });
    }
    return res.status(503).json({
      error: 'Could not interpret that fix. Try rephrasing.',
      detail: err.message,
    });
  }

  const updates = Object.fromEntries(
    Object.entries(fix ?? {}).filter(([key, value]) =>
      ALLOWED_FIELDS.has(key) && value !== undefined
    )
  );

  if (updates.runners) {
    updates.runners = {
      first: Object.hasOwn(updates.runners, 'first') ? updates.runners.first : game.runners?.first ?? null,
      second: Object.hasOwn(updates.runners, 'second') ? updates.runners.second : game.runners?.second ?? null,
      third: Object.hasOwn(updates.runners, 'third') ? updates.runners.third : game.runners?.third ?? null,
    };
  }

  if (Object.keys(updates).length === 0) {
    return res.status(422).json({ error: 'No valid correction fields were returned' });
  }

  const normalized = normalizeUpdates(updates);
  if (normalized.error) {
    return res.status(422).json({ error: normalized.error });
  }

  const { data: updatedGame, error: updateErr } = await supabaseAdmin
    .from('games')
    .update(normalized.updates)
    .eq('id', id)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  const auditPlay = {
    play_type: 'fix',
    instruction,
    summary: typeof fix?.summary === 'string' ? fix.summary : 'Applied manual correction',
    applied_updates: normalized.updates,
    count_after: {
      balls: updatedGame.balls ?? 0,
      strikes: updatedGame.strikes ?? 0,
    },
    runners_after: updatedGame.runners ?? { first: null, second: null, third: null },
  };

  const { data: insertedPlay, error: playErr } = await supabaseAdmin
    .from('plays')
    .insert({
      game_id: id,
      inning: game.inning,
      half: game.half,
      raw_input: `/fix ${instruction}`,
      structured_play: auditPlay,
      score_after: { home: updatedGame.home_score, away: updatedGame.away_score },
    })
    .select()
    .single();

  if (playErr) return res.status(500).json({ error: playErr.message });

  return res.status(200).json({
    game: updatedGame,
    recent_play: insertedPlay,
    summary: auditPlay.summary,
  });
}

function normalizeUpdates(updates) {
  if (updates.half && !['top', 'bottom'].includes(updates.half)) {
    return { error: 'half must be "top" or "bottom"' };
  }

  const integerFields = ['balls', 'strikes', 'outs', 'inning', 'home_score', 'away_score'];
  for (const field of integerFields) {
    if (updates[field] !== undefined) {
      if (!Number.isInteger(updates[field])) {
        return { error: `${field} must be an integer` };
      }
    }
  }

  if (updates.balls !== undefined && (updates.balls < 0 || updates.balls > 3)) {
    return { error: 'balls must be between 0 and 3' };
  }
  if (updates.strikes !== undefined && (updates.strikes < 0 || updates.strikes > 2)) {
    return { error: 'strikes must be between 0 and 2' };
  }
  if (updates.outs !== undefined && (updates.outs < 0 || updates.outs > 2)) {
    return { error: 'outs must be between 0 and 2' };
  }
  if (updates.inning !== undefined && updates.inning < 1) {
    return { error: 'inning must be at least 1' };
  }
  if (updates.home_score !== undefined && updates.home_score < 0) {
    return { error: 'home_score must be non-negative' };
  }
  if (updates.away_score !== undefined && updates.away_score < 0) {
    return { error: 'away_score must be non-negative' };
  }
  if (updates.runners) {
    for (const [base, value] of Object.entries(updates.runners)) {
      if (!['first', 'second', 'third'].includes(base)) {
        return { error: `invalid runner base: ${base}` };
      }
      if (value !== null && typeof value !== 'string') {
        return { error: `runner at ${base} must be a string or null` };
      }
    }
  }

  return { updates };
}

function parseStructuredFix(instruction, game) {
  const raw = instruction.trim();
  const normalized = raw.toLowerCase();

  const countMatch = normalized.match(/^count\s+(\d+)[-\s,\/]+(\d+)$/);
  if (countMatch) {
    const balls = Number.parseInt(countMatch[1], 10);
    const strikes = Number.parseInt(countMatch[2], 10);
    return {
      balls,
      strikes,
      summary: `Updated the count to ${balls}-${strikes}`,
    };
  }

  const outsMatch = normalized.match(/^outs?\s+(\d+)$/);
  if (outsMatch) {
    const outs = Number.parseInt(outsMatch[1], 10);
    return {
      outs,
      summary: `Updated outs to ${outs}`,
    };
  }

  const inningMatch = normalized.match(/^(top|bottom|bot)\s+(\d+)(?:st|nd|rd|th)?$/);
  if (inningMatch) {
    const half = inningMatch[1] === 'bot' ? 'bottom' : inningMatch[1];
    const inning = Number.parseInt(inningMatch[2], 10);
    return {
      half,
      inning,
      summary: `Updated the game to ${half} ${inning}`,
    };
  }

  const inningPrefixMatch = normalized.match(/^inning\s+(top|bottom|bot)\s+(\d+)(?:st|nd|rd|th)?$/);
  if (inningPrefixMatch) {
    const half = inningPrefixMatch[1] === 'bot' ? 'bottom' : inningPrefixMatch[1];
    const inning = Number.parseInt(inningPrefixMatch[2], 10);
    return {
      half,
      inning,
      summary: `Updated the game to ${half} ${inning}`,
    };
  }

  const scoreMatch = normalized.match(/^score\s+(\d+)\s*[-:]\s*(\d+)$/);
  if (scoreMatch) {
    const away = Number.parseInt(scoreMatch[1], 10);
    const home = Number.parseInt(scoreMatch[2], 10);
    return {
      away_score: away,
      home_score: home,
      summary: `Updated the score to away ${away}, home ${home}`,
    };
  }

  const teamScoreMatch = normalized.match(/^(away|home)\s+score\s+(\d+)$/);
  if (teamScoreMatch) {
    const field = `${teamScoreMatch[1]}_score`;
    const score = Number.parseInt(teamScoreMatch[2], 10);
    return {
      [field]: score,
      summary: `Updated the ${teamScoreMatch[1]} score to ${score}`,
    };
  }

  const runnerAssignmentMatch = normalized.match(/^runner\s+([a-z0-9]+)\s*=\s*(.+)$/);
  if (runnerAssignmentMatch) {
    const base = normalizeBase(runnerAssignmentMatch[1]);
    if (!base) throw invalidFix('Unknown runner base in /fix command');
    const runnerValue = parseRunnerValue(runnerAssignmentMatch[2]);
    return {
      runners: { [base]: runnerValue },
      summary: runnerValue === null
        ? `Cleared ${base} base`
        : `Set ${base} base to ${runnerValue}`,
    };
  }

  const runnerMoveMatch = normalized.match(/^runner\s+([a-z0-9]+)\s*->\s*([a-z0-9]+)$/);
  if (runnerMoveMatch) {
    const fromBase = normalizeBase(runnerMoveMatch[1]);
    const toBase = normalizeBase(runnerMoveMatch[2]);
    if (!fromBase || !toBase) throw invalidFix('Unknown runner base in /fix command');
    if (fromBase === toBase) throw invalidFix('Runner source and destination cannot be the same');
    const runnerName = game.runners?.[fromBase];
    if (!runnerName) throw invalidFix(`No runner on ${fromBase} to move`);
    if (game.runners?.[toBase]) throw invalidFix(`${toBase} is already occupied`);
    return {
      runners: {
        [fromBase]: null,
        [toBase]: runnerName,
      },
      summary: `Moved ${runnerName} from ${fromBase} to ${toBase}`,
    };
  }

  return null;
}

function normalizeBase(value) {
  const cleaned = value.trim().toLowerCase();
  return {
    '1': 'first',
    '1b': 'first',
    first: 'first',
    '2': 'second',
    '2b': 'second',
    second: 'second',
    '3': 'third',
    '3b': 'third',
    third: 'third',
  }[cleaned] ?? null;
}

function parseRunnerValue(value) {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (['empty', 'none', 'null', 'clear'].includes(normalized)) {
    return null;
  }
  return trimmed;
}

function invalidFix(message) {
  const err = new Error(message);
  err.code = 'INVALID_FIX';
  return err;
}
