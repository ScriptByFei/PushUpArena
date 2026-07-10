import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { GlobalLeaderboardRow } from '@/lib/database.types';

export function useGlobalLeaderboard(exerciseId?: string) {
  const [rows, setRows] = useState<GlobalLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [exerciseId]);

  useEffect(() => { void load(); }, [load]);

  return { rows, loading, error, refetch: load };
}
