import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import type { WorkoutEntry } from '@/lib/database.types';

interface SubmitInput {
  amount: number;
  note?: string | null;
  performedAt?: string; // ISO-String; default = jetzt
}

interface SubmitResult {
  error: string | null;
  entry?: WorkoutEntry;
}

/**
 * Zentrale „Eintrag loggen"-Logik: speichert den Eintrag, wertet danach
 * serverseitig die Achievements aus und zeigt entsprechende Toasts.
 * Gibt den neuen Eintrag zurück, damit der Aufrufer seine Liste/Statistik aktualisieren kann.
 */
export function useWorkoutLogger(exerciseId?: string, unit = 'Wdh.') {
  const { user } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async ({ amount, note, performedAt }: SubmitInput): Promise<SubmitResult> => {
      if (!user || !exerciseId) return { error: 'Nicht angemeldet.' };
      setSubmitting(true);

      const { data: entry, error } = await supabase
        .from('workout_entries')
        .insert({
          user_id: user.id,
          exercise_id: exerciseId,
          amount,
          note: note?.trim() ? note.trim() : null,
          performed_at: performedAt,
        })
        .select()
        .single();

      if (error || !entry) {
        setSubmitting(false);
        toast.error(error?.message ?? 'Eintrag konnte nicht gespeichert werden.');
        return { error: error?.message ?? 'Unbekannter Fehler' };
      }

      toast.success(`+${amount} ${unit} gespeichert 💪`);

      // Meilenstein-Check: hat der User heute 100 erreicht?
      const MILESTONE = 100;
      const { data: statsRows } = await supabase.rpc('get_my_stats', { p_exercise: exerciseId });
      const todayTotal = (Array.isArray(statsRows) ? statsRows[0]?.today_amount : 0) ?? 0;
      const prevTotal = todayTotal - amount;
      if (prevTotal < MILESTONE && todayTotal >= MILESTONE) {
        void supabase.functions.invoke('notify-milestone', {
          body: { user_id: user.id, milestone: MILESTONE },
        });
      }

      setSubmitting(false);
      return { error: null, entry };
    },
    [user, exerciseId, unit, toast],
  );

  return { submit, submitting };
}
