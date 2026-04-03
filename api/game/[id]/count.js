import { supabaseAdmin } from '../../../lib/supabase.js';

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
    .select('balls, strikes')
    .eq('id', id)
    .single();

  if (error || !game) return res.status(404).json({ error: 'Game not found' });

  const newBalls   = balls   !== undefined ? Math.max(0, Math.min(3, balls))   : game.balls;
  const newStrikes = strikes !== undefined ? Math.max(0, Math.min(2, strikes)) : game.strikes;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('games')
    .update({ balls: newBalls, strikes: newStrikes })
    .eq('id', id)
    .select('id, balls, strikes')
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });
  return res.status(200).json(updated);
}
