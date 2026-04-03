import { supabaseAdmin } from '../../../lib/supabase.js';

// GET /api/game/:id/plays — full play log (oldest first)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const { data, error } = await supabaseAdmin
    .from('plays')
    .select('id, inning, half, raw_input, structured_play, score_after, created_at')
    .eq('game_id', id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data ?? []);
}
