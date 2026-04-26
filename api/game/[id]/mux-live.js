import { supabaseAdmin } from '../../../lib/supabase.js';
import { createMuxLiveStream } from '../../../lib/mux.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  const { data: game, error: gameErr } = await supabaseAdmin
    .from('games')
    .select('id')
    .eq('id', id)
    .single();

  if (gameErr || !game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  try {
    const live = await createMuxLiveStream({
      gameId: id,
      latencyMode: req.body?.latency_mode,
    });

    const { data, error } = await supabaseAdmin
      .from('games')
      .update({ stream_url: live.playback_url })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({
      game: data,
      mux: live,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create Mux live stream';
    const status = message.includes('MUX_TOKEN') ? 500 : 502;
    return res.status(status).json({ error: message });
  }
}
