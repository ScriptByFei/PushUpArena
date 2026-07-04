/**
 * useRestDayInfo – liefert Ruhetag-Status für die aktuelle Woche.
 * Wird auf dem Dashboard für die Hinweis-Banner genutzt.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { getWeekKey, getDayType, shiftDate } from '@/lib/streakUtils';

const TZ = 'Europe/Berlin';

function berlinToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}

export interface RestDayStatus {
  restDaysThisWeek: number;       // 0–3+
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

export function useRestDayInfo(exerciseId?: string): RestDayStatus {
  const { user } = useAuth();
  const [status, setStatus] = useState<RestDayStatus>(EMPTY);

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

    // Ruhetage in akt. Woche (Montag bis heute)
    let restDaysThisWeek = 0;
    const [wy, wm, wd] = weekStart.split('-').map(Number);
    const [ty, tm, td] = today.split('-').map(Number);
    const daysInWeek = Math.round(
      (new Date(ty, tm - 1, td).getTime() - new Date(wy, wm - 1, wd).getTime()) / 86_400_000
    ) + 1;
    for (let i = 0; i < daysInWeek; i++) {
      const d = shiftDate(weekStart, i);
      if (getDayType(byDay.get(d) ?? 0) === 'rest') restDaysThisWeek++;
    }

    const isRestDayToday = getDayType(byDay.get(today) ?? 0) === 'rest';
    const isRestDayYesterday = getDayType(byDay.get(shiftDate(today, -1)) ?? 0) === 'rest';
    const consecutiveRestToday = isRestDayToday ? (isRestDayYesterday ? 2 : 1) : 0;

    setStatus({ restDaysThisWeek, isRestDayToday, consecutiveRestToday, loading: false });
  }, [exerciseId, user]);

  useEffect(() => { void load(); }, [load]);

  // Refresh when tab becomes visible (user returns from Track page)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  return status;
}
