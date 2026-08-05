import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MyStatisticsSummary } from '@/lib/database.types';

const EMPTY: MyStatisticsSummary = {
  total_amount: 0,
  total_sets: 0,
  training_days: 0,
  current_streak: 0,
  longest_streak: 0,
  avg_per_set: 0,
  avg_per_training: 0,
  best_day_amount: 0,
  best_day_date: null,
  best_set_amount: 0,
  best_set_date: null,
  most_sets_in_day: 0,
  most_sets_day_date: null,
  best_avg_per_day: 0,
  best_avg_per_day_date: null,
};

/** All-Time-Kennzahlen für die Statistik-Seite (Übersicht + Rekorde). */
export function useStatisticsSummary(exerciseId?: string) {
  const [stats, setStats] = useState<MyStatisticsSummary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!exerciseId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('get_my_statistics_summary', { p_exercise: exerciseId });
    if (err) setError(err.message);
    else setStats(data?.[0] ?? EMPTY);
    setLoading(false);
  }, [exerciseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { stats, loading, error, refetch: load };
}
