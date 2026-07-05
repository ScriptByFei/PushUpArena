import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { LeaderboardRow } from '@/lib/database.types';

type SortKey = 'total_amount' | 'today_amount' | 'current_streak';

export function useLeaderboard(exerciseId?: string) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('today_amount');

  const load = useCallback(async () => {
    if (!exerciseId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('get_friend_leaderboard', {
      p_exercise: exerciseId,
    });
    if (err) setError(err.message);
    // Nur User anzeigen die mindestens einen Eintrag haben (total_amount > 0)
    else setRows((data ?? []).filter((r) => r.total_amount > 0));
    setLoading(false);
  }, [exerciseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = [...rows].sort((a, b) => b[sortKey] - a[sortKey]);

  return { rows: sorted, loading, error, refetch: load, sortKey, setSortKey };
}
