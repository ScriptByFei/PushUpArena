import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PodiumRow {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  gold_count: number;
  silver_count: number;
  bronze_count: number;
  is_me: boolean;
}

export function usePodiumHistory(exerciseId?: string) {
  const [rows, setRows] = useState<PodiumRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!exerciseId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: err } = await (supabase as any).rpc('get_friend_podium_history', {
      p_exercise: exerciseId,
    });
    if (err) setError(err.message);
    else setRows((data ?? []) as PodiumRow[]);
    setLoading(false);
  }, [exerciseId]);

  useEffect(() => { void fetch(); }, [fetch]);

  return { rows, loading, error, refetch: fetch };
}
