const MUX_API_BASE = 'https://api.mux.com/video/v1';
export const MUX_RTMP_URL = 'rtmp://global-live.mux.com:5222/app';
export const MUX_RTMPS_URL = 'rtmps://global-live.mux.com:443/app';

function getMuxAuthHeader() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET are required');
  }

  return `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64')}`;
}

export function muxPlaybackUrl(playbackId) {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

export async function createMuxLiveStream({ gameId, latencyMode = 'low' } = {}) {
  const response = await fetch(`${MUX_API_BASE}/live-streams`, {
    method: 'POST',
    headers: {
      Authorization: getMuxAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      playback_policy: ['public'],
      latency_mode: latencyMode,
      reconnect_window: 60,
      new_asset_settings: {
        playback_policy: ['public'],
      },
      passthrough: gameId ? `game:${gameId}` : undefined,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.messages?.[0] || payload?.error?.message || `Mux API error (${response.status})`;
    throw new Error(message);
  }

  const liveStream = payload.data;
  const playbackId = liveStream?.playback_ids?.[0]?.id;

  if (!liveStream?.id || !liveStream?.stream_key || !playbackId) {
    throw new Error('Mux did not return a complete live stream');
  }

  return {
    live_stream_id: liveStream.id,
    stream_key: liveStream.stream_key,
    playback_id: playbackId,
    playback_url: muxPlaybackUrl(playbackId),
    rtmp_url: MUX_RTMP_URL,
    rtmps_url: MUX_RTMPS_URL,
    latency_mode: liveStream.latency_mode ?? latencyMode,
  };
}
