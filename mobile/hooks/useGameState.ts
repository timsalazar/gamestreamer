import { useState, useEffect, useRef, useCallback } from 'react';
import { api, GameState } from '../lib/api';

interface UseGameStateResult {
  state: GameState | null;
  setState: React.Dispatch<React.SetStateAction<GameState | null>>;
  error: string | null;
  refetch: () => void;
}

/**
 * Polls /api/game/:id/state on a timer.
 * Slows to 10 s once the game is final.
 */
export function useGameState(
  gameId: string | null,
  pollMs = 3000
): UseGameStateResult {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await api.getState(gameId);
      if (!cancelledRef.current) {
        setState(data);
        setError(null);
      }
    } catch (e) {
      if (!cancelledRef.current) {
        setError((e as Error).message);
      }
    }
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;

    cancelledRef.current = false;

    const tick = async () => {
      await fetchOnce();
      if (!cancelledRef.current) {
        const interval =
          state?.status === 'final' ? 10_000 : pollMs;
        timerRef.current = setTimeout(tick, interval);
      }
    };

    tick();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  return { state, setState, error, refetch: fetchOnce };
}
