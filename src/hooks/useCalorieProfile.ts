import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { DeficitLevel } from '@/lib/calorieCalculator';

export interface CalorieProfile {
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  average_daily_steps: number | null;
  calorie_deficit_target: DeficitLevel;
}

type CalorieProfilePatch = Partial<CalorieProfile>;

const SELECT_COLUMNS = 'age, height_cm, weight_kg, average_daily_steps, calorie_deficit_target';

export function useCalorieProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<CalorieProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select(SELECT_COLUMNS)
      .eq('id', user.id)
      .maybeSingle();
    if (err) setError(err.message);
    else setProfile(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveCalorieProfile = useCallback(
    async (patch: CalorieProfilePatch): Promise<{ error: string | null }> => {
      if (!user) return { error: 'Nicht angemeldet.' };
      const { data, error: err } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select(SELECT_COLUMNS)
        .single();
      if (err) return { error: err.message };
      setProfile(data);
      return { error: null };
    },
    [user],
  );

  return { profile, loading, error, refetch: load, saveCalorieProfile };
}
