import { supabaseAdmin } from '../../../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  // GET /api/game/[id]/state
  if (req.method === 'GET') {
    const { data: game, error: gameErr } = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('id', id)
      .single();

    if (gameErr) return res.status(404).json({ error: 'Game not found' });

    const { data: plays } = await supabaseAdmin
      .from('plays')
      .select('id, inning, half, raw_input, structured_play, score_after, created_at')
      .eq('game_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    return res.status(200).json({ ...game, recent_plays: plays ?? [] });
  }

  // PATCH /api/game/[id]/state — update stream URL or status
  if (req.method === 'PATCH') {
    const allowed = ['stream_url', 'status', 'balls', 'strikes'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );

    const { data, error } = await supabaseAdmin
      .from('games')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
