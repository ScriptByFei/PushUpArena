import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { GlobalLeaderboardRow } from '@/lib/database.types';

const VISIBILITY_REFETCH_MS = 3 * 60_000; // max once per 3 minutes on tab-focus

export function useGlobalLeaderboard(exerciseId?: string) {
  const [rows, setRows] = useState<GlobalLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastLoadedAt = useRef<number>(0);

  const load = useCallback(async () => {
    if (!exerciseId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('get_global_daily_leaderboard', {
      p_exercise: exerciseId,
    });
    if (err) setError(err.message);
    else setRows((data ?? []) as GlobalLeaderboardRow[]);
    setLoading(false);
    lastLoadedAt.current = Date.now();
  }, [exerciseId]);

  useEffect(() => { void load(); }, [load]);

  // Throttle refetch on visibility change
  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastLoadedAt.current > VISIBILITY_REFETCH_MS
      ) {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  return { rows, loading, error, refetch: load };
}
