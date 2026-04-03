import { supabaseAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET /api/games — list all games
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('games')
      .select('id, home_team, away_team, game_date, status, home_score, away_score, inning, half, stream_url')
      .order('game_date', { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST /api/games — create a new game
  if (req.method === 'POST') {
    const { home_team, away_team, game_date, stream_url } = req.body;
    if (!home_team || !away_team) {
      return res.status(400).json({ error: 'home_team and away_team are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('games')
      .insert({ home_team, away_team, game_date: game_date ?? new Date().toISOString().slice(0, 10), stream_url })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
