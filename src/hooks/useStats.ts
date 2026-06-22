import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MyStats } from '@/lib/database.types';

const EMPTY: MyStats = {
  today_amount: 0,
  week_amount: 0,
  total_amount: 0,
  level: 1,
  current_streak: 0,
};

export function useStats(exerciseId?: string) {
  const [stats, setStats] = useState<MyStats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!exerciseId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('get_my_stats', { p_exercise: exerciseId });
    if (err) setError(err.message);
    else setStats(data?.[0] ?? EMPTY);
    setLoading(false);
  }, [exerciseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { stats, loading, error, refetch: load };
}
