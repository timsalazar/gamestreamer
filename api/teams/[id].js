import { isMissingTableError, supabaseAdmin } from '../../lib/supabase.js';
import { extractUser } from '../../lib/auth-middleware.js';
import { requireTeamAccess, requireTeamOwner } from '../../lib/permissions.js';

const TEAM_SELECT_COLUMNS = 'id, name, players, owner_id, created_at';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Require authentication for all methods
  const user = await extractUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;

  // GET /api/teams/[id] — allowed if user is owner or member
  if (req.method === 'GET') {
    const denied = await requireTeamAccess(id, user.id);
    if (denied) return res.status(denied.status).json({ error: denied.error });

    const { data, error } = await supabaseAdmin
      .from('teams')
      .select(TEAM_SELECT_COLUMNS)
      .eq('id', id)
      .single();

    if (error && isMissingTableError(error)) {
      return res.status(404).json({ error: 'Team not found' });
    }
    if (error || !data) return res.status(404).json({ error: 'Team not found' });
    return res.status(200).json({
      ...data,
      player_count: Array.isArray(data.players) ? data.players.length : 0,
    });
  }

  // PUT /api/teams/[id] — full update, owner only
  if (req.method === 'PUT') {
    const denied = await requireTeamOwner(id, user.id);
    if (denied) return res.status(denied.status).json({ error: denied.error });

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

  // PATCH /api/teams/[id] — partial update, owner only (kept for backward compatibility)
  if (req.method === 'PATCH') {
    const denied = await requireTeamOwner(id, user.id);
    if (denied) return res.status(denied.status).json({ error: denied.error });

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

  // DELETE /api/teams/[id] — owner only
  if (req.method === 'DELETE') {
    const denied = await requireTeamOwner(id, user.id);
    if (denied) return res.status(denied.status).json({ error: denied.error });

    const { error } = await supabaseAdmin
      .from('teams')
      .delete()
      .eq('id', id);

    if (error && isMissingTableError(error)) {
      return res.status(503).json({ error: 'Teams storage is not configured yet' });
    }
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  res.status(405).json({ error: 'Method not allowed' });
}
