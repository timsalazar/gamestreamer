export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Runners {
  first?: string | null;
  second?: string | null;
  third?: string | null;
}

export interface GameState {
  id: string;
  away_team: string;
  home_team: string;
  away_score: number;
  home_score: number;
  away_hits?: number;
  home_hits?: number;
  away_errors?: number;
  home_errors?: number;
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  balls: number;
  strikes: number;
  runners: Runners;
  status: 'scheduled' | 'live' | 'final';
  stream_url: string | null;
  recent_plays?: Play[];
  inning_scores?: {
    top: (number | null)[];
    bottom: (number | null)[];
  };
}

export interface Play {
  id: string;
  raw_input: string;
  inning: number;
  half: string;
  structured_play?: { play_type: string };
  score_after?: { away: number; home: number };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

// ── API calls ──────────────────────────────────────────────────────────────

export const api = {
  createGame: (
    away_team: string,
    home_team: string,
    stream_url: string | null
  ) =>
    request<GameState>('/api/games', {
      method: 'POST',
      body: JSON.stringify({ away_team, home_team, stream_url }),
    }),

  getState: (gameId: string) =>
    request<GameState>(`/api/game/${encodeURIComponent(gameId)}/state`),

  submitPlay: (gameId: string, raw_input: string) =>
    request<{ game: GameState; play: Play }>(
      `/api/game/${encodeURIComponent(gameId)}/play`,
      { method: 'POST', body: JSON.stringify({ raw_input }) }
    ),

  undoPlay: (gameId: string) =>
    request<{ ok: boolean }>(
      `/api/game/${encodeURIComponent(gameId)}/play`,
      { method: 'DELETE' }
    ),

  updateCount: (gameId: string, field: 'balls' | 'strikes', value: number) =>
    request<GameState>(
      `/api/game/${encodeURIComponent(gameId)}/count`,
      { method: 'PATCH', body: JSON.stringify({ [field]: value }) }
    ),

  getPlays: (gameId: string) =>
    request<Play[]>(`/api/game/${encodeURIComponent(gameId)}/plays`),

  updateStreamUrl: (gameId: string, stream_url: string) =>
    request<GameState>(
      `/api/game/${encodeURIComponent(gameId)}/state`,
      { method: 'PATCH', body: JSON.stringify({ stream_url }) }
    ),
};

// ── Utils ──────────────────────────────────────────────────────────────────

export function ordinalInning(inning: number, half: string) {
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  const s = suffixes[inning] ?? 'th';
  return `${half === 'top' ? '▲' : '▼'} ${inning}${s}`;
}
