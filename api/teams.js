import { isMissingTableError, supabaseAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET /api/teams — list all teams
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select('id, name, players')
      .order('name', { ascending: true });

    if (error) {
      if (isMissingTableError(error)) return res.status(200).json([]);
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json(data);
  }

  // POST /api/teams — create a new team
  if (req.method === 'POST') {
    const { name, players } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('teams')
      .insert({ name: name.trim(), players: players || [] })
      .select()
      .single();

    if (error && isMissingTableError(error)) {
      return res.status(202).json({
        id: null,
        name: name.trim(),
        players: players || [],
        warning: 'teams_table_missing',
      });
    }
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
