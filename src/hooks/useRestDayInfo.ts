/**
 * useRestDayInfo – liefert Ruhetag-Status für die aktuelle Woche.
 * Wird auf dem Dashboard für die Hinweis-Banner genutzt.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { getWeekKey, getDayType, shiftDate } from '@/lib/streakUtils';

const TZ = 'Europe/Berlin';

function berlinToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}

export interface RestDayStatus {
  restDaysThisWeek: number;       // Ruhetage Mo–gestern (heute wird nicht voreilig gezählt)
  isRestDayToday: boolean;
  consecutiveRestToday: number;   // 0,1,2+
  loading: boolean;
}

const EMPTY: RestDayStatus = {
  restDaysThisWeek: 0,
  isRestDayToday: false,
  consecutiveRestToday: 0,
  loading: true,
};

const VISIBILITY_REFETCH_MS = 5 * 60_000; // only re-fetch once per 5 min on tab-focus

export function useRestDayInfo(exerciseId?: string): RestDayStatus {
  const { user } = useAuth();
  const [status, setStatus] = useState<RestDayStatus>(EMPTY);
  const lastLoadedAt = useRef<number>(0);

  const load = useCallback(async () => {
    if (!exerciseId || !user) return;

    const today = berlinToday();
    const weekStart = getWeekKey(today); // ISO-Montag
    const twoWeeksAgo = shiftDate(today, -14); // Puffer für Wochenanfang

    const { data } = await supabase
      .from('workout_entries')
      .select('amount, performed_at')
      .eq('exercise_id', exerciseId)
      .gte('performed_at', twoWeeksAgo + 'T00:00:00+02:00')
      .order('performed_at', { ascending: true });

    // Aggregieren nach Berlin-Tag
    const byDay = new Map<string, number>();
    for (const row of data ?? []) {
      const d = new Date(row.performed_at as string).toLocaleDateString('sv-SE', { timeZone: TZ });
      byDay.set(d, (byDay.get(d) ?? 0) + row.amount);
    }

    // Ruhetage Mo–gestern (heute wird NICHT gezählt — User könnte noch trainieren)
    let restDaysThisWeek = 0;
    const [wy, wm, wd] = weekStart.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);
    const completedDays = Math.round(
      (new Date(ty, tm - 1, td).getTime() - new Date(wy, wm - 1, wd).getTime()) / 86_400_000
    ); // ohne +1 schließt heute aus
    for (let i = 0; i < completedDays; i++) {
      const d = shiftDate(weekStart, i);
      if (getDayType(byDay.get(d) ?? 0) === 'rest') restDaysThisWeek++;
    }

    const isRestDayToday = getDayType(byDay.get(today) ?? 0) === 'rest';
    const isRestDayYesterday = getDayType(byDay.get(shiftDate(today, -1)) ?? 0) === 'rest';
    const consecutiveRestToday = isRestDayToday ? (isRestDayYesterday ? 2 : 1) : 0;

    setStatus({ restDaysThisWeek, isRestDayToday, consecutiveRestToday, loading: false });
    lastLoadedAt.current = Date.now();
  }, [exerciseId, user]);

  useEffect(() => { void load(); }, [load]);

  // Refresh when tab becomes visible, but at most once every 5 minutes.
  // PWA users switch apps constantly — without the throttle this fires on every unlock.
  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastLoadedAt.current > VISIBILITY_REFETCH_MS
      ) {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  return status;
}
