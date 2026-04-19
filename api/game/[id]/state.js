import { supabaseAdmin } from '../../../lib/supabase.js';

function isHitPlay(structuredPlay) {
  if (!structuredPlay) return false;
  if (structuredPlay.hit === true) return true;
  if (typeof structuredPlay.hit === 'string' && structuredPlay.hit.toLowerCase() === 'true') {
    return true;
  }

  return ['single', 'double', 'triple', 'home_run'].includes(structuredPlay.play_type);
}

function isErrorPlay(structuredPlay) {
  if (!structuredPlay) return false;
  if (structuredPlay.error === true) return true;
  if (typeof structuredPlay.error === 'string' && structuredPlay.error.toLowerCase() === 'true') {
    return true;
  }
  return structuredPlay.play_type === 'error';
}

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

    const { data: allPlayFlags } = await supabaseAdmin
      .from('plays')
      .select('half, structured_play')
      .eq('game_id', id);

    const totals = (allPlayFlags ?? []).reduce(
      (acc, play) => {
        const battingTeam = play?.half === 'top' ? 'away' : 'home';
        const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
        if (isHitPlay(play?.structured_play)) acc[`${battingTeam}_hits`] += 1;
        if (isErrorPlay(play?.structured_play)) acc[`${fieldingTeam}_errors`] += 1;
        return acc;
      },
      { away_hits: 0, home_hits: 0, away_errors: 0, home_errors: 0 }
    );

    return res.status(200).json({
      ...game,
      away_hits: totals.away_hits,
      home_hits: totals.home_hits,
      away_errors: totals.away_errors,
      home_errors: totals.home_errors,
      recent_plays: plays ?? [],
    });
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
