import { supabaseAdmin } from '../../../lib/supabase.js';
import { applyPlay, validatePlay } from '../../../lib/game-logic.js';

// PATCH /api/game/:id/count
// Body: { balls?: number, strikes?: number }
// Increments or sets the count directly. Handles auto-walk/strikeout resets.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const { balls, strikes } = req.body ?? {};

  // Fetch current state
  const { data: game, error } = await supabaseAdmin
    .from('games')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !game) return res.status(404).json({ error: 'Game not found' });
  if (game.status === 'final') return res.status(400).json({ error: 'Game is already final' });

  const requestedBalls = balls !== undefined ? Math.max(0, balls) : game.balls;
  const requestedStrikes = strikes !== undefined ? Math.max(0, strikes) : game.strikes;
  const newBalls   = Math.min(3, requestedBalls);
  const newStrikes = Math.min(2, requestedStrikes);
  const ballsDelta = newBalls - (game.balls ?? 0);
  const strikesDelta = newStrikes - (game.strikes ?? 0);

  let structuredPlay = null;
  let rawInput = null;

  if (requestedBalls >= 4 && requestedStrikes === (game.strikes ?? 0)) {
    rawInput = 'Manual walk';
    structuredPlay = buildManualWalk(game);
  } else if (requestedStrikes >= 3 && requestedBalls === (game.balls ?? 0)) {
    rawInput = 'Manual strikeout';
    structuredPlay = {
      play_type: 'strikeout',
      batter: 'Batter',
      outs_recorded: 1,
      runs_scored: 0,
      runners: [],
      rbi: 0,
      hit: false,
      error: false,
      balls_delta: 0,
      strikes_delta: 0,
      source: 'count_button',
      manual: true,
    };
  }

  if (structuredPlay) {
    const validation = validatePlay(game, structuredPlay);
    if (!validation.valid) {
      return res.status(422).json({ error: validation.reason });
    }

    const newState = applyPlay(game, structuredPlay);
    const loggedPlay = {
      ...structuredPlay,
      count_after: { balls: newState.balls, strikes: newState.strikes },
    };
    const { data: insertedPlay, error: playErr } = await supabaseAdmin
      .from('plays')
      .insert({
        game_id: id,
        inning: game.inning,
        half: game.half,
        raw_input: rawInput,
        structured_play: loggedPlay,
        score_after: { home: newState.home_score, away: newState.away_score },
      })
      .select()
      .single();

    if (playErr) return res.status(500).json({ error: playErr.message });

    const { data: updatedGame, error: updateErr } = await supabaseAdmin
      .from('games')
      .update({
        inning: newState.inning,
        half: newState.half,
        outs: newState.outs,
        home_score: newState.home_score,
        away_score: newState.away_score,
        balls: newState.balls,
        strikes: newState.strikes,
        runners: newState.runners,
        inning_scores: newState.inning_scores,
        status: 'live',
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) return res.status(500).json({ error: updateErr.message });
    return res.status(200).json({ game: updatedGame, recent_play: insertedPlay });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('games')
    .update({
      balls: newBalls,
      strikes: newStrikes,
      status: 'live',
    })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  let recentPlay = null;
  if (ballsDelta > 0 && strikesDelta === 0) {
    recentPlay = {
      inning: game.inning,
      half: game.half,
      raw_input: 'Manual ball',
      structured_play: {
        play_type: 'ball',
        balls_delta: ballsDelta,
        strikes_delta: 0,
        count_after: { balls: newBalls, strikes: newStrikes },
        source: 'count_button',
        manual: true,
      },
      score_after: { home: game.home_score, away: game.away_score },
    };
  } else if (strikesDelta > 0 && ballsDelta === 0) {
    recentPlay = {
      inning: game.inning,
      half: game.half,
      raw_input: 'Manual strike',
      structured_play: {
        play_type: 'strike',
        balls_delta: 0,
        strikes_delta: strikesDelta,
        count_after: { balls: newBalls, strikes: newStrikes },
        source: 'count_button',
        manual: true,
      },
      score_after: { home: game.home_score, away: game.away_score },
    };
  }

  if (recentPlay) {
    const { data: insertedPlay, error: playErr } = await supabaseAdmin
      .from('plays')
      .insert({ game_id: id, ...recentPlay })
      .select()
      .single();

    if (playErr) return res.status(500).json({ error: playErr.message });
    recentPlay = insertedPlay;
  }

  return res.status(200).json({ game: updated, recent_play: recentPlay });
}

function buildManualWalk(game) {
  const runners = [];
  const { first, second, third } = game.runners ?? {};

  if (first) {
    if (second) {
      if (third) runners.push({ name: third, from: '3', to: 'H' });
      runners.push({ name: second, from: '2', to: '3' });
    }
    runners.push({ name: first, from: '1', to: '2' });
  }

  runners.push({ name: 'Batter', from: 'home', to: '1' });

  return {
    play_type: 'walk',
    batter: 'Batter',
    outs_recorded: 0,
    runs_scored: first && second && third ? 1 : 0,
    runners,
    rbi: first && second && third ? 1 : 0,
    hit: false,
    error: false,
    balls_delta: 0,
    strikes_delta: 0,
    source: 'count_button',
    manual: true,
  };
}
