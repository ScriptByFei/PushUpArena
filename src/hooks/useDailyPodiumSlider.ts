import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { TopThreeEntry } from './useDailyRecap';

export function useDailyPodiumSlider(exerciseId?: string) {
  const [dates, setDates] = useState<string[]>([]); // sorted oldest → newest
  const [sliderIdx, setSliderIdx] = useState(0);
  const [top3, setTop3] = useState<TopThreeEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [datesLoading, setDatesLoading] = useState(true);
  // Cache already-loaded dates so slider back-and-forth avoids re-fetching
  const dateCache = useRef<Map<string, TopThreeEntry[]>>(new Map());

  // Alle verfügbaren Daten laden
  useEffect(() => {
    if (!exerciseId) { setDatesLoading(false); return; }
    setDatesLoading(true);
    dateCache.current.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc('get_podium_dates', { p_exercise: exerciseId })
      .then(({ data }: { data: { recap_date: string }[] | null }) => {
        if (data && data.length > 0) {
          const sorted = data.map((d) => d.recap_date).sort();
          setDates(sorted);
          setSliderIdx(sorted.length - 1); // neuestes Datum vorauswählen
        }
        setDatesLoading(false);
      });
  }, [exerciseId]);

  // Podest für ein Datum laden — hits cache first to avoid redundant RPC calls
  const loadDate = useCallback(
    async (date: string) => {
      if (!exerciseId || !date) return;

      // Serve from cache if available (slider back-and-forth)
      const cached = dateCache.current.get(date);
      if (cached) {
        setTop3(cached);
        return;
      }

      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc('get_daily_podium', {
        p_exercise: exerciseId,
        p_date: date,
      });
      const row = Array.isArray(data) ? data[0] : data;
      const entries = (row?.top_three as TopThreeEntry[]) ?? null;
      if (entries) dateCache.current.set(date, entries);
      setTop3(entries);
      setLoading(false);
    },
    [exerciseId],
  );

  // Laden wenn Slider oder Daten sich ändern
  useEffect(() => {
    if (dates.length === 0 || datesLoading) return;
    const date = dates[sliderIdx];
    if (date) void loadDate(date);
  }, [sliderIdx, dates, datesLoading, loadDate]);

  return {
    dates,
    sliderIdx,
    setSliderIdx,
    top3,
    loading,
    datesLoading,
    selectedDate: dates[sliderIdx] ?? null,
  };
}
