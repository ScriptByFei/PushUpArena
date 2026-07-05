import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

const DEFAULT_AMOUNTS = [10, 20, 30, 50];

export function useQuickAmounts(exerciseId?: string) {
  const { user } = useAuth();
  const [amounts, setAmounts] = useState<number[]>(DEFAULT_AMOUNTS);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    if (exerciseId) {
      // Per-Übung aus exercise_enrollments laden
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('exercise_enrollments')
        .select('quick_amounts')
        .eq('user_id', user.id)
        .eq('exercise_id', exerciseId)
        .single();

      if (data?.quick_amounts && Array.isArray(data.quick_amounts) && data.quick_amounts.length > 0) {
        setAmounts(data.quick_amounts as number[]);
        return;
      }
      // Fallback: globale Werte aus profiles (Rückwärtskompatibilität)
      const { data: profile } = await supabase
        .from('profiles')
        .select('quick_amounts')
        .eq('id', user.id)
        .single();
      if (profile?.quick_amounts && Array.isArray(profile.quick_amounts) && profile.quick_amounts.length > 0) {
        setAmounts(profile.quick_amounts as number[]);
      } else {
        setAmounts(DEFAULT_AMOUNTS);
      }
    } else {
      // Legacy: globale Werte aus profiles
      const { data } = await supabase
        .from('profiles')
        .select('quick_amounts')
        .eq('id', user.id)
        .single();
      if (data?.quick_amounts && Array.isArray(data.quick_amounts) && data.quick_amounts.length > 0) {
        setAmounts(data.quick_amounts as number[]);
      }
    }
  }, [user, exerciseId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Neu laden wenn App wieder sichtbar wird (z.B. nach Rückkehr von Settings)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') void load();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const save = useCallback(
    async (newAmounts: number[]) => {
      if (!user) return { error: 'Not logged in' };
      setSaving(true);

      if (exerciseId) {
        // Per-Übung in exercise_enrollments speichern
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('exercise_enrollments')
          .update({ quick_amounts: newAmounts })
          .eq('user_id', user.id)
          .eq('exercise_id', exerciseId);
        setSaving(false);
        if (!error) setAmounts(newAmounts);
        return { error: error?.message ?? null };
      } else {
        // Legacy: globale Werte in profiles
        const { error } = await supabase
          .from('profiles')
          .update({ quick_amounts: newAmounts })
          .eq('id', user.id);
        setSaving(false);
        if (!error) setAmounts(newAmounts);
        return { error: error?.message ?? null };
      }
    },
    [user, exerciseId],
  );

  return { amounts, saving, save, refetch: load };
}
