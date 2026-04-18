import { supabaseAdmin } from './supabase.js';

/**
 * Returns 'owner' | 'viewer' | null for the given (teamId, userId) pair.
 * Uses the service-role client so RLS does not interfere with the lookup.
 *
 * @param {string} teamId
 * @param {string} userId
 * @returns {Promise<'owner'|'viewer'|null>}
 */
export async function getTeamRole(teamId, userId) {
  if (!teamId || !userId) return null;

  // Check ownership first (single row lookup, cheapest)
  const { data: team, error: teamError } = await supabaseAdmin
    .from('teams')
    .select('id, owner_id')
    .eq('id', teamId)
    .single();

  if (teamError || !team) return null;
  if (team.owner_id === userId) return 'owner';

  // Check team_members for viewer access
  const { data: member, error: memberError } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberError || !member) return null;
  return member.role; // currently always 'viewer'
}

/**
 * Asserts the user is the team owner.
 * Returns { error, status } if the check fails, or null if access is granted.
 *
 * Usage in a route handler:
 *   const denied = await requireTeamOwner(teamId, userId);
 *   if (denied) return res.status(denied.status).json({ error: denied.error });
 *
 * @param {string} teamId
 * @param {string} userId
 * @returns {Promise<null | { error: string, status: number }>}
 */
export async function requireTeamOwner(teamId, userId) {
  const role = await getTeamRole(teamId, userId);

  if (role === null) {
    // Either the team doesn't exist or the user has no relationship to it.
    // Return 404 to avoid leaking team existence to unauthorised callers.
    return { error: 'Team not found', status: 404 };
  }

  if (role !== 'owner') {
    return { error: 'Forbidden: only the team owner can perform this action', status: 403 };
  }

  return null; // access granted
}

/**
 * Asserts the user is the team owner OR a member (viewer).
 * Returns { error, status } if the check fails, or null if access is granted.
 *
 * @param {string} teamId
 * @param {string} userId
 * @returns {Promise<null | { error: string, status: number }>}
 */
export async function requireTeamAccess(teamId, userId) {
  const role = await getTeamRole(teamId, userId);

  if (role === null) {
    return { error: 'Team not found', status: 404 };
  }

  // Both 'owner' and 'viewer' are acceptable
  return null; // access granted
}
