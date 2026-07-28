import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

/**
 * Liefert die heutige Push-up-Anzahl — unabhängig von der aktuell im
 * Exercise-Switcher aktiven Übung. Der Kalorienrechner soll IMMER Push-ups
 * zählen, auch wenn der Nutzer gerade z. B. auf Pull-ups umgeschaltet hat.
 *
 * Single Source of Truth bleibt workout_entries (via get_my_stats RPC),
 * dieselbe die auch Dashboard/DrawerStats verwenden.
 */

let cachedPushupsExerciseId: string | null = null;

async function resolvePushupsExerciseId(): Promise<string | null> {
  if (cachedPushupsExerciseId) return cachedPushupsExerciseId;
  const { data, error } = await supabase
    .from('exercises')
    .select('id')
    .eq('slug', 'pushups')
    .maybeSingle();
  if (error || !data) return null;
  cachedPushupsExerciseId = data.id;
  return data.id;
}

export function useTodayPushups() {
  const { user } = useAuth();
  const [todayAmount, setTodayAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const exerciseId = await resolvePushupsExerciseId();
    if (!exerciseId) {
      setError('Push-up-Übung nicht gefunden.');
      setLoading(false);
      return;
    }

    const { data, error: err } = await supabase.rpc('get_my_stats', { p_exercise: exerciseId });
    if (err) setError(err.message);
    else setTodayAmount(data?.[0]?.today_amount ?? 0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sofort neu laden, wenn ein Satz hinzugefügt/geändert/gelöscht wurde
  // (dasselbe Event wie DrawerStatsContext, Dashboard, etc.).
  useEffect(() => {
    const handler = () => void load();
    window.addEventListener('workoutEntriesChanged', handler);
    return () => window.removeEventListener('workoutEntriesChanged', handler);
  }, [load]);

  return { todayAmount, loading, error, refetch: load };
}
