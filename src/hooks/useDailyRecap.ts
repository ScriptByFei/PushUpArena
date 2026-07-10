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
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [currentDateIdx, setCurrentDateIdx] = useState(0); // 0 = neuestes Datum
  const [navLoading, setNavLoading] = useState(false);

  const pushups = enrolledExercises.find((e) => e.slug === 'pushups');

  // ── Auto-show beim ersten Login des Tages ──────────────────────────────────
  useEffect(() => {
    if (!user || exLoading || !pushups) return;
    if (localStorage.getItem(shownKey())) return;

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
        // Fehler lautlos ignorieren
      }
    })();

    return () => { cancelled = true; };
  }, [user, exLoading, pushups]);

  // ── Verfügbare Daten laden (für Navigation) ────────────────────────────────
  useEffect(() => {
    if (!user || exLoading || !pushups) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc('get_my_recap_dates', { p_exercise: pushups.id })
      .then(({ data }: { data: { recap_date: string }[] | null }) => {
        if (!cancelled && data) {
          setAvailableDates(data.map((r) => r.recap_date));
        }
      });
    return () => { cancelled = true; };
  }, [user, exLoading, pushups]);

  // ── Recap für ein bestimmtes Datum laden ───────────────────────────────────
  const loadDate = useCallback(
    async (date: string) => {
      if (!pushups) return;
      setNavLoading(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any).rpc('get_my_daily_recap', {
          p_exercise: pushups.id,
          p_date: date,
        });
        const row = Array.isArray(data) ? data[0] : data;
        if (row) setRecap(row as DailyRecap);
      } catch {
        // ignore
      } finally {
        setNavLoading(false);
      }
    },
    [pushups],
  );

  // ── Manuelles Öffnen (ignoriert localStorage) ──────────────────────────────
  const forceLoad = useCallback(async () => {
    if (!pushups) return;
    setNavLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc('get_my_daily_recap', {
        p_exercise: pushups.id,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setRecap(row as DailyRecap);
        setCurrentDateIdx(0);
      } else {
        setRecap(null);
      }
    } catch {
      // ignore
    } finally {
      setNavLoading(false);
    }
  }, [pushups]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goToPrev = useCallback(() => {
    const nextIdx = currentDateIdx + 1;
    if (nextIdx >= availableDates.length) return;
    setCurrentDateIdx(nextIdx);
    void loadDate(availableDates[nextIdx]);
  }, [currentDateIdx, availableDates, loadDate]);

  const goToNext = useCallback(() => {
    const nextIdx = currentDateIdx - 1;
    if (nextIdx < 0) return;
    setCurrentDateIdx(nextIdx);
    void loadDate(availableDates[nextIdx]);
  }, [currentDateIdx, availableDates, loadDate]);

  // ── Dismiss ────────────────────────────────────────────────────────────────
  const dismiss = useCallback(async () => {
    setOpen(false);
    setCurrentDateIdx(0);
    localStorage.setItem(shownKey(), '1');
    if (recap) {
      await supabase
        .from('daily_recaps')
        .update({ shown_at: new Date().toISOString() })
        .eq('id', recap.id);
    }
  }, [recap]);

  return {
    recap,
    open,
    dismiss,
    forceLoad,
    goToPrev,
    goToNext,
    hasPrev: currentDateIdx < availableDates.length - 1,
    hasNext: currentDateIdx > 0,
    navLoading,
  };
}
