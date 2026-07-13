import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { RestDay } from '@/lib/database.types';

export function useRestDays(exerciseId?: string) {
  const { user } = useAuth();
  const [restDays, setRestDays] = useState<RestDay[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!exerciseId || !user) { setRestDays([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('rest_days')
      .select('id, exercise_id, user_id, rest_date')
      .eq('exercise_id', exerciseId)
      .eq('user_id', user.id)
      .order('rest_date', { ascending: false });
    setRestDays((data as RestDay[]) ?? []);
    setLoading(false);
  }, [exerciseId, user]);

  useEffect(() => { void refetch(); }, [refetch]);

  async function addRestDay(restDate: string): Promise<{ error: string | null }> {
    if (!exerciseId || !user) return { error: 'Nicht angemeldet.' };
    const { error } = await supabase
      .from('rest_days')
      .insert({ exercise_id: exerciseId, user_id: user.id, rest_date: restDate });
    if (error) return { error: error.message };
    await refetch();
    return { error: null };
  }

  async function deleteRestDay(id: string): Promise<void> {
    await supabase.from('rest_days').delete().eq('id', id);
    await refetch();
  }

  return { restDays, loading, refetch, addRestDay, deleteRestDay };
}
