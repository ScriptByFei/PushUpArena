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

export interface RecapDateEntry {
  recap_date: string;
  has_data: boolean;
}

const shownKey = () => {
  const today = new Date().toISOString().split('T')[0];
  return `daily-recap-shown-${today}`;
};

export interface MedalCounts {
  gold: number;
  silver: number;
  bronze: number;
}

export function useDailyRecap() {
  const { user } = useAuth();
  const { enrolledExercises, loading: exLoading } = useExercise();
  const [recap, setRecap] = useState<DailyRecap | null>(null);
  const [open, setOpen] = useState(false);
  const [availableDates, setAvailableDates] = useState<RecapDateEntry[]>([]);
  const [currentDateIdx, setCurrentDateIdx] = useState(0); // 0 = neuestes Datum
  const [navLoading, setNavLoading] = useState(false);
  const [medalCounts, setMedalCounts] = useState<MedalCounts | null>(null);

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

  // ── Verfügbare Daten + Medaillen-Zähler laden ─────────────────────────────
  useEffect(() => {
    if (!user || exLoading || !pushups) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc('get_my_recap_dates', { p_exercise: pushups.id })
      .then(({ data }: { data: RecapDateEntry[] | null }) => {
        if (!cancelled && data) setAvailableDates(data);
      });
    // Medaillen-Zähler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc('get_my_medal_counts', { p_exercise: pushups.id })
      .then(({ data }: { data: { gold_count: number; silver_count: number; bronze_count: number }[] | null }) => {
        if (!cancelled && data && data[0]) {
          setMedalCounts({ gold: data[0].gold_count, silver: data[0].silver_count, bronze: data[0].bronze_count });
        }
      });
    return () => { cancelled = true; };
  }, [user, exLoading, pushups]);

  // ── Recap für ein bestimmtes Datum laden ───────────────────────────────────
  const loadDate = useCallback(
    async (entry: RecapDateEntry) => {
      if (!pushups) return;
      setNavLoading(true);
      try {
        if (!entry.has_data) {
          // Kein Row in DB — leeren Platzhalter setzen
          setRecap({
            id: '',
            recap_date: entry.recap_date,
            yesterday_pushups: 0,
            prev_day_pushups: 0,
            yesterday_rank: null,
            yesterday_medal: null,
            top_three: null,
          });
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any).rpc('get_my_daily_recap', {
            p_exercise: pushups.id,
            p_date: entry.recap_date,
          });
          const row = Array.isArray(data) ? data[0] : data;
          if (row) setRecap(row as DailyRecap);
        }
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
    if (recap?.id) {
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
    medalCounts,
  };
}
