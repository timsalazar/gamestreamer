import { supabaseAdmin } from '../../../lib/supabase.js';
import { parsePlay } from '../../../lib/claude.js';
import { applyCommand, applyPlay, validatePlay } from '../../../lib/game-logic.js';
import { parseScoringCommand } from '../../../lib/scoring-parser.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  // POST /api/game/[id]/play — submit a play in natural language
  if (req.method === 'POST') {
    const { raw_input } = req.body;
    if (!raw_input?.trim()) {
      return res.status(400).json({ error: 'raw_input is required' });
    }

    // 1. Fetch current game state
    const { data: game, error: gameErr } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('id', id)
      .single();

    if (gameErr || !game) return res.status(404).json({ error: 'Game not found' });
    if (game.status === 'final') return res.status(400).json({ error: 'Game is already final' });

    let structuredPlay;
    let newState;
    const command = parseScoringCommand(raw_input, game);

    if (command?.needs_clarification) {
      return res.status(409).json({
        error: 'Clarification needed',
        question: command.clarification_question ?? 'Please clarify that scoring input.',
        scoring_command: command,
      });
    }

    if (command && !command.needs_clarification) {
      const result = applyCommand(game, command);
      if (!result.valid) {
        return res.status(422).json({
          error: `Play validation failed: ${result.reason}`,
          scoring_command: command,
          structured_play: result.play,
        });
      }
      structuredPlay = result.play;
      newState = result.state;
    }

    // 2. Fall back to Claude when the deterministic parser has low confidence.
    try {
      if (!structuredPlay) {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Claude API timeout')), 25000)
        );
        structuredPlay = await Promise.race([parsePlay(raw_input, game), timeoutPromise]);
      }
    } catch (err) {
      return res.status(503).json({
        error: 'Could not parse that play. Try rephrasing.',
        detail: err.message,
      });
    }

    if (newState) {
      const loggedPlay = {
        ...structuredPlay,
        count_after: { balls: newState.balls, strikes: newState.strikes },
      };

      const { data: insertedPlay, error: playErr } = await supabaseAdmin.from('plays')
        .insert({
          game_id: id,
          inning: game.inning,
          half: game.half,
          raw_input: raw_input.trim(),
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

      return res.status(200).json({
        game: updatedGame,
        play: loggedPlay,
        recent_play: insertedPlay,
      });
    }

    // 3a. If it's a single pitch (ball or strike), log it and update the count
    if (structuredPlay.play_type === 'ball' || structuredPlay.play_type === 'strike') {
      const newBalls   = Math.min(3, (game.balls   ?? 0) + (structuredPlay.balls_delta   ?? 0));
      const newStrikes = Math.min(2, (game.strikes ?? 0) + (structuredPlay.strikes_delta ?? 0));
      const loggedPlay = {
        ...structuredPlay,
        count_after: { balls: newBalls, strikes: newStrikes },
      };

      const { data: insertedPlay, error: playErr } = await supabaseAdmin
        .from('plays')
        .insert({
          game_id: id,
          inning: game.inning,
          half: game.half,
          raw_input: raw_input.trim(),
          structured_play: loggedPlay,
          score_after: { home: game.home_score, away: game.away_score },
        })
        .select()
        .single();

      if (playErr) return res.status(500).json({ error: playErr.message });

      const { data: updatedGame, error: updateErr } = await supabaseAdmin
        .from('games')
        .update({ balls: newBalls, strikes: newStrikes })
        .eq('id', id)
        .select()
        .single();

      if (updateErr) return res.status(500).json({ error: updateErr.message });
      return res.status(200).json({ game: updatedGame, play: loggedPlay, recent_play: insertedPlay });
    }

    // 3. Validate the parsed play
    const validation = validatePlay(game, structuredPlay);
    if (!validation.valid) {
      return res.status(422).json({
        error: `Play validation failed: ${validation.reason}`,
        structured_play: structuredPlay,
      });
    }

    // 4. Apply play to game state
    newState = applyPlay(game, structuredPlay);
    const loggedPlay = {
      ...structuredPlay,
      count_after: { balls: newState.balls, strikes: newState.strikes },
    };

    // 5. Save play log
    const { data: insertedPlay, error: playErr } = await supabaseAdmin.from('plays')
      .insert({
        game_id: id,
        inning: game.inning,
        half: game.half,
        raw_input: raw_input.trim(),
        structured_play: loggedPlay,
        score_after: { home: newState.home_score, away: newState.away_score },
      })
      .select()
      .single();

    if (playErr) return res.status(500).json({ error: playErr.message });

    // 6. Update game state
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

    return res.status(200).json({
      game: updatedGame,
      play: loggedPlay,
      recent_play: insertedPlay,
    });
  }

  // DELETE /api/game/[id]/play — undo last play
  if (req.method === 'DELETE') {
    // Fetch the last play
    const { data: lastPlay, error: playErr } = await supabaseAdmin
      .from('plays')
      .select('*')
      .eq('game_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (playErr || !lastPlay) {
      return res.status(404).json({ error: 'No plays to undo' });
    }

    // Delete it
    await supabaseAdmin.from('plays').delete().eq('id', lastPlay.id);

    // Re-fetch previous play's score_after (or default to 0)
    const { data: prevPlay } = await supabaseAdmin
      .from('plays')
      .select('score_after')
      .eq('game_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // NOTE: For a full undo, you'd replay all plays. For MVP we just
    // decrement and let the scorekeeper know to adjust if needed.
    return res.status(200).json({
      message: 'Last play undone. Refresh game state.',
      previous_score: prevPlay?.score_after ?? { home: 0, away: 0 },
    });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
