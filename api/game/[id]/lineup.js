import { isMissingTableError, supabaseAdmin } from '../../../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  // GET /api/game/[id]/lineup — fetch both home and away lineups
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('game_lineups')
      .select('id, game_id, side, team_id, players, current_batter_index')
      .eq('game_id', id);

    if (error) {
      if (isMissingTableError(error)) {
        return res.status(200).json({ home: null, away: null });
      }
      return res.status(500).json({ error: error.message });
    }

    // Return as object with home and away keys
    const result = { home: null, away: null };
    data.forEach(lineup => {
      result[lineup.side] = lineup;
    });

    return res.status(200).json(result);
  }

  // POST /api/game/[id]/lineup — create or replace a lineup for a side
  if (req.method === 'POST') {
    const { side, team_id, players } = req.body;

    if (!side || !['home', 'away'].includes(side)) {
      return res.status(400).json({ error: 'side must be "home" or "away"' });
    }

    if (!players || !Array.isArray(players)) {
      return res.status(400).json({ error: 'players must be an array' });
    }

    // Upsert: if a lineup exists for this game+side, replace it
    const { data, error } = await supabaseAdmin
      .from('game_lineups')
      .upsert({
        game_id: id,
        side,
        team_id: team_id || null,
        players,
        current_batter_index: 0,
      }, {
        onConflict: 'game_id,side'
      })
      .select()
      .single();

    if (error && isMissingTableError(error)) {
      return res.status(202).json({
        id: null,
        game_id: id,
        side,
        team_id: team_id || null,
        players,
        current_batter_index: 0,
        warning: 'game_lineups_table_missing',
      });
    }
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // PATCH /api/game/[id]/lineup — advance batter index only
  if (req.method === 'PATCH') {
    const { side, current_batter_index } = req.body;

    if (!side || !['home', 'away'].includes(side)) {
      return res.status(400).json({ error: 'side must be "home" or "away"' });
    }

    if (typeof current_batter_index !== 'number' || current_batter_index < 0) {
      return res.status(400).json({ error: 'current_batter_index must be a non-negative number' });
    }

    const { data, error } = await supabaseAdmin
      .from('game_lineups')
      .update({ current_batter_index })
      .eq('game_id', id)
      .eq('side', side)
      .select()
      .single();

    if (error && isMissingTableError(error)) {
      return res.status(202).json({
        id: null,
        game_id: id,
        side,
        current_batter_index,
        warning: 'game_lineups_table_missing',
      });
    }
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Lineup not found' });

    return res.status(200).json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
