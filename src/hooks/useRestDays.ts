import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export interface RestDayEntry {
  id: string;
  rest_date: string; // YYYY-MM-DD
  created_at: string;
}

export function useRestDays(exerciseId?: string) {
  const { user } = useAuth();
  const [restDays, setRestDays] = useState<RestDayEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!exerciseId || !user) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('rest_days')
      .select('id, rest_date, created_at')
      .eq('exercise_id', exerciseId)
      .order('rest_date', { ascending: false });
    setRestDays((data ?? []) as RestDayEntry[]);
    setLoading(false);
  }, [exerciseId, user]);

  useEffect(() => { void load(); }, [load]);

  async function addRestDay(date: string): Promise<{ error: string | null }> {
    if (!exerciseId || !user) return { error: 'Nicht angemeldet' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('rest_days').upsert(
      { user_id: user.id, exercise_id: exerciseId, rest_date: date },
      { onConflict: 'user_id,exercise_id,rest_date' }
    );
    if (!error) await load();
    return { error: error?.message ?? null };
  }

  async function deleteRestDay(id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('rest_days').delete().eq('id', id);
    setRestDays((prev) => prev.filter((r) => r.id !== id));
  }

  return { restDays, loading, refetch: load, addRestDay, deleteRestDay };
}
