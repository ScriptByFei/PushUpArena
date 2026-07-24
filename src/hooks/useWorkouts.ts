import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { WorkoutEntry } from '@/lib/database.types';

interface NewEntry {
  amount: number;
  note?: string | null;
  performed_at?: string;
}

export function useWorkouts(exerciseId?: string) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<WorkoutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !exerciseId) return;
    setLoading(true);
    setError(null);
    // Limit to last 90 days — older entries are rarely edited and keep the query small.
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const { data, error: err } = await supabase
      .from('workout_entries')
      .select('id, user_id, exercise_id, amount, note, performed_at')
      .eq('user_id', user.id)
      .eq('exercise_id', exerciseId)
      .gte('performed_at', since.toISOString())
      .order('performed_at', { ascending: false });
    if (err) setError(err.message);
    else setEntries(data ?? []);
    setLoading(false);
  }, [user, exerciseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addEntry = useCallback(
    async (entry: NewEntry): Promise<{ error: string | null; data: WorkoutEntry | null }> => {
      if (!user || !exerciseId) return { error: 'Nicht angemeldet.', data: null };
      const { data, error: err } = await supabase
        .from('workout_entries')
        .insert({
          user_id: user.id,
          exercise_id: exerciseId,
          amount: entry.amount,
          note: entry.note ?? null,
          performed_at: entry.performed_at,
        })
        .select()
        .single();
      if (err) return { error: err.message, data: null };
      setEntries((prev) =>
        [data, ...prev].sort((a, b) => b.performed_at.localeCompare(a.performed_at)),
      );
      window.dispatchEvent(new CustomEvent('workoutEntriesChanged'));
      return { error: null, data };
    },
    [user, exerciseId],
  );

  const updateEntry = useCallback(
    async (
      id: string,
      patch: { amount?: number; note?: string | null; performed_at?: string },
    ): Promise<{ error: string | null }> => {
      const { data, error: err } = await supabase
        .from('workout_entries')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (err) return { error: err.message };
      setEntries((prev) =>
        prev
          .map((e) => (e.id === id ? data : e))
          .sort((a, b) => b.performed_at.localeCompare(a.performed_at)),
      );
      window.dispatchEvent(new CustomEvent('workoutEntriesChanged'));
      return { error: null };
    },
    [],
  );

  const deleteEntry = useCallback(async (id: string): Promise<{ error: string | null }> => {
    const { error: err } = await supabase.from('workout_entries').delete().eq('id', id);
    if (err) return { error: err.message };
    setEntries((prev) => prev.filter((e) => e.id !== id));
    window.dispatchEvent(new CustomEvent('workoutEntriesChanged'));
    return { error: null };
  }, []);

  return { entries, loading, error, refetch: load, addEntry, updateEntry, deleteEntry };
}
