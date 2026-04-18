import { isMissingTableError, supabaseAdmin } from '../lib/supabase.js';
import { extractUser } from '../lib/auth-middleware.js';

const TEAM_SELECT_COLUMNS = 'id, name, players, owner_id, created_at';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Require authentication for all methods
  const user = await extractUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // GET /api/teams — list teams the authenticated user owns OR is a member of
  if (req.method === 'GET') {
    // Fetch owned teams
    const { data: ownedTeams, error: ownedError } = await supabaseAdmin
      .from('teams')
      .select(TEAM_SELECT_COLUMNS)
      .eq('owner_id', user.id)
      .order('name', { ascending: true });

    if (ownedError) {
      if (isMissingTableError(ownedError)) return res.status(200).json([]);
      return res.status(500).json({ error: ownedError.message });
    }

    // Fetch teams the user is a member of (but does not own)
    const { data: memberships, error: memberError } = await supabaseAdmin
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id);

    if (memberError && !isMissingTableError(memberError)) {
      return res.status(500).json({ error: memberError.message });
    }

    let memberTeams = [];
    const membershipsByTeamId = {};

    if (memberships && memberships.length > 0) {
      const memberTeamIds = memberships.map((m) => m.team_id);
      memberships.forEach((m) => { membershipsByTeamId[m.team_id] = m.role; });

      const { data: sharedTeams, error: sharedError } = await supabaseAdmin
        .from('teams')
        .select(TEAM_SELECT_COLUMNS)
        .in('id', memberTeamIds)
        .order('name', { ascending: true });

      if (sharedError && !isMissingTableError(sharedError)) {
        return res.status(500).json({ error: sharedError.message });
      }

      memberTeams = sharedTeams || [];
    }

    // Merge and annotate each team with the caller's role
    const owned = (ownedTeams || []).map((t) => ({ ...t, role: 'owner' }));
    const shared = memberTeams.map((t) => ({
      ...t,
      role: membershipsByTeamId[t.id] || 'viewer',
    }));

    // De-duplicate: if somehow a user is both owner and member, owned wins
    const ownedIds = new Set(owned.map((t) => t.id));
    const deduped = shared.filter((t) => !ownedIds.has(t.id));

    const all = [...owned, ...deduped].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return res.status(200).json(all);
  }

  // POST /api/teams — create a new team, owned by the authenticated user
  if (req.method === 'POST') {
    const { name, players } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('teams')
      .insert({ name: name.trim(), players: players || [], owner_id: user.id })
      .select()
      .single();

    if (error && isMissingTableError(error)) {
      return res.status(202).json({
        id: null,
        name: name.trim(),
        players: players || [],
        owner_id: user.id,
        warning: 'teams_table_missing',
      });
    }
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
