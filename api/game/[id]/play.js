import { supabaseAdmin } from '../../../lib/supabase.js';
import { parsePlay } from '../../../lib/claude.js';
import { applyPlay, validatePlay } from '../../../lib/game-logic.js';

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
      console.error('[play] Missing raw_input in request body');
      return res.status(400).json({ error: 'raw_input is required' });
    }

    // 1. Fetch current game state
    const { data: game, error: gameErr } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('id', id)
      .single();

    if (gameErr || !game) {
      console.error(`[play] Game ${id} not found:`, gameErr?.message);
      return res.status(404).json({ error: 'Game not found' });
    }
    if (game.status === 'final') {
      console.error(`[play] Game ${id} is already final`);
      return res.status(400).json({ error: 'Game is already final' });
    }

    // 2. Call Claude to parse the play
    let structuredPlay;
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Claude API timeout')), 25000)
      );
      structuredPlay = await Promise.race([parsePlay(raw_input, game), timeoutPromise]);
    } catch (err) {
      console.error(`[play] Claude parse error for game ${id}:`, err.message);
      return res.status(503).json({
        error: 'Could not parse that play. Try rephrasing.',
        detail: err.message,
      });
    }

    // Auto-correct: if runs_scored > 0 but no runners moving to H, zero it out
    const runnersToH = structuredPlay.runners.filter(r => r.to === 'H').length;
    if (structuredPlay.runs_scored > 0 && runnersToH === 0) {
      console.warn(`[play] Auto-correcting: runs_scored was ${structuredPlay.runs_scored} but no runners moved to H, setting to 0`);
      structuredPlay.runs_scored = 0;
      structuredPlay.rbi = 0;
    }

    // 2b. If batter is null, fill in from current lineup
    if (!structuredPlay.batter) {
      const side = game.half === 'top' ? 'away' : 'home';
      console.log(`[play] Attempting to populate batter for game ${id}, side=${side}`);

      const { data: lineup, error: lineupErr } = await supabaseAdmin
        .from('game_lineups')
        .select('players, current_batter_index, team_id')
        .eq('game_id', id)
        .eq('side', side)
        .single();

      if (lineupErr) {
        console.warn(`[play] Error querying game_lineups: ${lineupErr.message}`);
      }

      if (!lineup) {
        console.log(`[play] No lineup found in game_lineups table for game ${id}, side=${side}`);
      } else {
        console.log(`[play] Found lineup:`, {
          playersCount: lineup.players?.length ?? 0,
          currentBatterIndex: lineup.current_batter_index,
          teamId: lineup.team_id
        });

        const playerList = Array.isArray(lineup.players) && lineup.players.length > 0 ? lineup.players : [];
        console.log(`[play] Player list length: ${playerList.length}`);

        // If no explicit players, fetch from team
        if (playerList.length === 0 && lineup.team_id) {
          console.log(`[play] No players in lineup, fetching from teams table for team_id=${lineup.team_id}`);
          const { data: team, error: teamErr } = await supabaseAdmin
            .from('teams')
            .select('players')
            .eq('id', lineup.team_id)
            .single();

          if (teamErr) {
            console.warn(`[play] Error querying teams table: ${teamErr.message}`);
          }

          if (!team) {
            console.log(`[play] No team found with id=${lineup.team_id}`);
          } else if (!team.players) {
            console.log(`[play] Team found but has no players field`);
          } else if (!Array.isArray(team.players)) {
            console.log(`[play] Team.players exists but is not an array: ${typeof team.players}`);
          } else {
            console.log(`[play] Adding ${team.players.length} players from team roster`);
            playerList.push(...team.players);
          }
        }

        if (playerList.length > 0) {
          const currentIndex = (lineup.current_batter_index ?? 0) % playerList.length;
          const currentBatter = playerList[currentIndex];
          console.log(`[play] Using index ${currentIndex} for batter from ${playerList.length} players`);
          console.log(`[play] Current batter object:`, currentBatter);

          if (currentBatter?.name) {
            structuredPlay.batter = currentBatter.name;
            console.log(`[play] Successfully set batter to "${currentBatter.name}"`);
          } else {
            console.log(`[play] Selected player has no name property`);
          }
        } else {
          console.log(`[play] No players available after all lookups`);
        }
      }
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

      if (playErr) {
        console.error(`[play] Error inserting play for game ${id}:`, playErr.message);
        return res.status(500).json({ error: playErr.message });
      }

      const { data: updatedGame, error: updateErr } = await supabaseAdmin
        .from('games')
        .update({ balls: newBalls, strikes: newStrikes })
        .eq('id', id)
        .select()
        .single();

      if (updateErr) {
        console.error(`[play] Error updating game ${id} (pitch):`, updateErr.message);
        return res.status(500).json({ error: updateErr.message });
      }
      return res.status(200).json({ game: updatedGame, play: loggedPlay, recent_play: insertedPlay });
    }

    // 3. Validate the parsed play
    const validation = validatePlay(game, structuredPlay);
    if (!validation.valid) {
      console.error(`[play] Validation failed for game ${id}:`, validation.reason);
      console.error('[play] Structured play:', JSON.stringify(structuredPlay));
      return res.status(422).json({
        error: `Play validation failed: ${validation.reason}`,
        structured_play: structuredPlay,
      });
    }

    // 4. Apply play to game state
    const newState = applyPlay(game, structuredPlay);
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

    if (playErr) {
      console.error(`[play] Error inserting play for game ${id}:`, playErr.message);
      return res.status(500).json({ error: playErr.message });
    }

    // 5.5. Advance batter if at-bat is over
    const ATBAT_ENDERS = ['single', 'double', 'triple', 'home_run', 'strikeout', 'groundout', 'flyout', 'fielders_choice', 'error', 'walk', 'hit_by_pitch', 'bunt', 'sacrifice_fly'];
    if (ATBAT_ENDERS.includes(structuredPlay.play_type)) {
      const batterSide = game.half === 'top' ? 'away' : 'home';
      console.log(`[play] At-bat ended for ${batterSide} (play_type: ${structuredPlay.play_type}), advancing batter index`);

      const { data: lineup, error: lineupErr } = await supabaseAdmin
        .from('game_lineups')
        .select('current_batter_index, players')
        .eq('game_id', id)
        .eq('side', batterSide)
        .single();

      if (!lineupErr && lineup) {
        const playerCount = Array.isArray(lineup.players) && lineup.players.length > 0
          ? lineup.players.length
          : 9; // Default to 9 if no players stored

        const nextIndex = ((lineup.current_batter_index ?? 0) + 1) % playerCount;
        const { error: updateLineupErr } = await supabaseAdmin
          .from('game_lineups')
          .update({ current_batter_index: nextIndex })
          .eq('game_id', id)
          .eq('side', batterSide);

        if (updateLineupErr) {
          console.warn(`[play] Could not advance batter index for ${batterSide}:`, updateLineupErr.message);
        } else {
          console.log(`[play] Advanced ${batterSide} batter index from ${lineup.current_batter_index ?? 0} to ${nextIndex}`);
        }
      }
    }

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

    if (updateErr) {
      console.error(`[play] Error updating game ${id}:`, updateErr.message);
      return res.status(500).json({ error: updateErr.message });
    }

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
