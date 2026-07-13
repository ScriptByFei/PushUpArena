import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { UserGoal } from '@/lib/database.types';

export function useGoals(exerciseId?: string) {
  const { user } = useAuth();
  const [goal, setGoal] = useState<UserGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !exerciseId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('user_goals')
      .select('id, user_id, exercise_id, daily_goal, weekly_goal, updated_at')
      .eq('user_id', user.id)
      .eq('exercise_id', exerciseId)
      .maybeSingle();
    if (err) setError(err.message);
    else setGoal(data);
    setLoading(false);
  }, [user, exerciseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveGoals = useCallback(
    async (dailyGoal: number, weeklyGoal: number): Promise<{ error: string | null }> => {
      if (!user || !exerciseId) return { error: 'Nicht angemeldet.' };
      const { data, error: err } = await supabase
        .from('user_goals')
        .upsert(
          {
            user_id: user.id,
            exercise_id: exerciseId,
            daily_goal: dailyGoal,
            weekly_goal: weeklyGoal,
          },
          { onConflict: 'user_id,exercise_id' },
        )
        .select()
        .single();
      if (err) return { error: err.message };
      setGoal(data);
      return { error: null };
    },
    [user, exerciseId],
  );

  return { goal, loading, error, refetch: load, saveGoals };
}
