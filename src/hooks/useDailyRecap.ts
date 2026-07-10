import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useExercise } from '@/context/ExerciseContext';

export interface TopThreeEntry {
  rank: number;
  name: string;
  avatar: string | null;
  pushups: number;
}

export interface DailyRecap {
  id: string;
  recap_date: string;
  yesterday_pushups: number;
  prev_day_pushups: number;
  yesterday_rank: number | null;
  yesterday_medal: 'gold' | 'silver' | 'bronze' | null;
  top_three: TopThreeEntry[] | null;
}

const shownKey = () => {
  const today = new Date().toISOString().split('T')[0];
  return `daily-recap-shown-${today}`;
};

export function useDailyRecap() {
  const { user } = useAuth();
  const { enrolledExercises, loading: exLoading } = useExercise();
  const [recap, setRecap] = useState<DailyRecap | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || exLoading) return;

    // Nur für Pushups (primary exercise)
    const pushups = enrolledExercises.find((e) => e.slug === 'pushups');
    if (!pushups) return;

    // Schnell-Check: bereits heute angezeigt? (PREVIEW: Check deaktiviert)
    // if (localStorage.getItem(shownKey())) return;

    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any).rpc('get_my_daily_recap', {
          p_exercise: pushups.id,
        });
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          setRecap(row as DailyRecap);
          setOpen(true);
        }
      } catch {
        // Fehler lautlos ignorieren — App startet normal
      }
    })();

    return () => { cancelled = true; };
  }, [user, exLoading, enrolledExercises]);

  const dismiss = useCallback(async () => {
    setOpen(false);
    localStorage.setItem(shownKey(), '1');
    if (recap) {
      await supabase
        .from('daily_recaps')
        .update({ shown_at: new Date().toISOString() })
        .eq('id', recap.id);
    }
  }, [recap]);

  return { recap, open, dismiss };
}
