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

      // Achievements serverseitig prüfen (verhindert Manipulation).
      const { data: unlocked } = await supabase.rpc('evaluate_achievements', {
        p_exercise: exerciseId,
      });
      unlocked?.forEach((u) =>
        toast.achievement(`Badge freigeschaltet: ${u.name}`, u.icon),
      );

      setSubmitting(false);
      return { error: null, entry };
    },
    [user, exerciseId, unit, toast],
  );

  return { submit, submitting };
}
