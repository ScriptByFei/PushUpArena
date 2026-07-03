import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import type { WorkoutEntry } from '@/lib/database.types';

interface SubmitInput {
  amount: number;
  note?: string | null;
  performedAt?: string; // ISO-String; default = jetzt
  /** Tagesstand VOR diesem Eintrag – für Meilenstein-Check */
  prevDailyTotal?: number;
}

interface SubmitResult {
  error: string | null;
  entry?: WorkoutEntry;
}

const MILESTONE = 100;

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
    async ({ amount, note, performedAt, prevDailyTotal = 0 }: SubmitInput): Promise<SubmitResult> => {
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

      // Meilenstein-Check: hat der User mit diesem Eintrag 100 heute geknackt?
      const newTotal = prevDailyTotal + amount;
      if (prevDailyTotal < MILESTONE && newTotal >= MILESTONE) {
        // Notify the user themselves
        supabase.functions
          .invoke('notify-milestone', { body: { user_id: user.id, milestone: MILESTONE } })
          .then(({ data, error }) => {
            console.log('[milestone] invoke result:', JSON.stringify(data), error);
          })
          .catch((e) => console.error('[milestone] invoke error:', e));
        // Broadcast to all subscribed users
        supabase.functions
          .invoke('notify-milestone-broadcast', { body: { milestone: MILESTONE } })
          .then(({ data, error }) => {
            console.log('[milestone-broadcast] invoke result:', JSON.stringify(data), error);
          })
          .catch((e) => console.error('[milestone-broadcast] invoke error:', e));
      }

      setSubmitting(false);
      return { error: null, entry };
    },
    [user, exerciseId, unit, toast],
  );

  return { submit, submitting };
}
