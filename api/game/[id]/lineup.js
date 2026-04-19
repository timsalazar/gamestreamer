import { isMissingTableError, supabaseAdmin } from '../../../lib/supabase.js';

function enrichLineup(lineup, teamPlayersById = {}) {
  if (!lineup) return null;

  const teamPlayers = lineup.team_id ? (teamPlayersById[lineup.team_id] ?? []) : [];
  const effectivePlayers = Array.isArray(lineup.players) && lineup.players.length
    ? lineup.players
    : teamPlayers;
  const sortedPlayers = [...effectivePlayers].sort(
    (a, b) => (a?.batting_order || 99) - (b?.batting_order || 99)
  );
  const currentIndex = sortedPlayers.length
    ? ((lineup.current_batter_index ?? 0) % sortedPlayers.length)
    : 0;
  const currentBatter = sortedPlayers.length ? sortedPlayers[currentIndex] : null;
  const onDeck = sortedPlayers.length ? sortedPlayers[(currentIndex + 1) % sortedPlayers.length] : null;

  return {
    ...lineup,
    team_players: teamPlayers,
    effective_players: sortedPlayers,
    current_batter: currentBatter,
    on_deck: onDeck,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  // GET /api/game/[id]/lineup — fetch both home and away lineups
  if (req.method === 'GET') {
    let { data: game, error: gameErr } = await supabaseAdmin
      .from('games')
      .select('away_team, home_team, away_batter_index, home_batter_index')
      .eq('id', id)
      .single();

    if (gameErr) {
      console.warn(`[lineup GET] Error fetching game ${id}:`, gameErr.message);
      // Try again without the batter_index fields in case they don't exist
      const { data: gameBasic, error: gameErr2 } = await supabaseAdmin
        .from('games')
        .select('away_team, home_team')
        .eq('id', id)
        .single();

      if (gameErr2) {
        console.warn(`[lineup GET] Game ${id} not found`);
        return res.status(404).json({ error: 'Game not found' });
      }
      game = gameBasic;
    }

    const { data, error } = await supabaseAdmin
      .from('game_lineups')
      .select('id, game_id, side, team_id, players, current_batter_index')
      .eq('game_id', id);

    let lineupData = data ?? [];
    if (error && !isMissingTableError(error)) {
      return res.status(500).json({ error: error.message });
    }

    if (error && isMissingTableError(error)) {
      console.log(`[lineup] game_lineups table missing for ${id}, will use team rosters as fallback`);
      lineupData = [];
    } else {
      console.log(`[lineup] Found ${lineupData?.length ?? 0} lineups for game ${id}. Game teams:`, { away_team: game?.away_team, home_team: game?.home_team });
    }

    // Return as object with home and away keys
    const result = { home: null, away: null };
    const teamIds = [...new Set((lineupData ?? []).map((lineup) => lineup.team_id).filter(Boolean))];
    const teamNames = [game?.away_team, game?.home_team].filter(Boolean);
    let teamPlayersById = {};
    let teamsByName = {};

    if (teamIds.length > 0) {
      const { data: teams } = await supabaseAdmin
        .from('teams')
        .select('id, players')
        .in('id', teamIds);

      teamPlayersById = Object.fromEntries(
        (teams ?? []).map((team) => [team.id, Array.isArray(team.players) ? team.players : []])
      );
      console.log(`[lineup] Loaded ${Object.keys(teamPlayersById).length} teams by ID`);
    }

    if (teamNames.length > 0) {
      const { data: namedTeams } = await supabaseAdmin
        .from('teams')
        .select('id, name, players')
        .in('name', teamNames);

      teamsByName = Object.fromEntries(
        (namedTeams ?? []).map((team) => [team.name, team])
      );
      console.log(`[lineup] Loaded teams by name:`, Object.keys(teamsByName));
    }

    lineupData.forEach(lineup => {
      result[lineup.side] = enrichLineup(lineup, teamPlayersById);
    });

    if (!result.away && game?.away_team && teamsByName[game.away_team]) {
      const team = teamsByName[game.away_team];
      const batterIndex = (game?.away_batter_index !== null && game?.away_batter_index !== undefined) ? game.away_batter_index : 0;
      result.away = enrichLineup({
        id: null,
        game_id: id,
        side: 'away',
        team_id: team.id,
        players: [],
        current_batter_index: batterIndex,
      }, { [team.id]: Array.isArray(team.players) ? team.players : [] });
    }

    if (!result.home && game?.home_team && teamsByName[game.home_team]) {
      const team = teamsByName[game.home_team];
      const batterIndex = (game?.home_batter_index !== null && game?.home_batter_index !== undefined) ? game.home_batter_index : 0;
      result.home = enrichLineup({
        id: null,
        game_id: id,
        side: 'home',
        team_id: team.id,
        players: [],
        current_batter_index: batterIndex,
      }, { [team.id]: Array.isArray(team.players) ? team.players : [] });
    }

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
    return res.status(200).json(enrichLineup(data));
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

    return res.status(200).json(enrichLineup(data));
  }

  res.status(405).json({ error: 'Method not allowed' });
}
