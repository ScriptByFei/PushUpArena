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

  const sorted = [...rows]
    .filter((r) => {
      if (sortKey === 'today_amount') return r.today_amount > 0;
      if (sortKey === 'current_streak') return r.current_streak > 0;
      return true; // 'total_amount' — alle (total_amount > 0 bereits garantiert)
    })
    .sort((a, b) => {
      const diff = b[sortKey] - a[sortKey];
      if (diff !== 0) return diff;
      // Tiebreaker: wer den Wert zuerst erreicht hat (älteres Datum = besserer Rang)
      return new Date(a.tiebreaker_at).getTime() - new Date(b.tiebreaker_at).getTime();
    });

  return { rows: sorted, loading, error, refetch: load, sortKey, setSortKey };
}
