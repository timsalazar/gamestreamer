import { isMissingTableError, supabaseAdmin } from '../../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  // GET /api/teams/[id]
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select('id, name, players')
      .eq('id', id)
      .single();

    if (error && isMissingTableError(error)) {
      return res.status(404).json({ error: 'Team not found' });
    }
    if (error || !data) return res.status(404).json({ error: 'Team not found' });
    return res.status(200).json(data);
  }

  // PATCH /api/teams/[id] — update name and/or players
  if (req.method === 'PATCH') {
    const allowed = ['name', 'players'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data, error } = await supabaseAdmin
      .from('teams')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error && isMissingTableError(error)) {
      return res.status(503).json({ error: 'Teams storage is not configured yet' });
    }
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Team not found' });
    return res.status(200).json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
