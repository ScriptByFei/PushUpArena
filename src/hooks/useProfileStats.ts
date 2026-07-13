import { useCallback, useEffect, useState } from 'react';
import { calculateStreakWithRestDays } from '@/lib/streakUtils';
import type { RestDayInfo } from '@/lib/streakUtils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export type { RestDayInfo };

export interface DayData {
  date: string; // YYYY-MM-DD in Europe/Berlin
  amount: number;
  sessions: number;
}

export interface ProfileStats {
  totalAmount: number;
  currentStreak: number;
  longestStreak: number;
  avgPerActiveDay: number;
  bestDay: DayData | null;
  bestWeek: number;
  trainingDays: number;
  last7Days: number;
  last30Days: number;
  restDayInfo: RestDayInfo;
  /** Last 182 days (26 weeks) for heatmap */
  dailyData: DayData[];
  /** Last 7 days for bar chart */
  last7DaysData: DayData[];
}

const EMPTY: ProfileStats = {
  totalAmount: 0,
  currentStreak: 0,
  longestStreak: 0,
  avgPerActiveDay: 0,
  bestDay: null,
  bestWeek: 0,
  trainingDays: 0,
  last7Days: 0,
  last30Days: 0,
  restDayInfo: { restDaysThisWeek: 0, isRestDayToday: false, isRestDayYesterday: false, consecutiveRestToday: 0 },
  dailyData: [],
  last7DaysData: [],
};

/** ISO-Wochenschlüssel "YYYY-Www" für einen "YYYY-MM-DD"-String */
function isoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const thu = new Date(date);
  thu.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3);
  const yearStart = new Date(thu.getFullYear(), 0, 1);
  const week = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thu.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

const TZ = 'Europe/Berlin';

/** Datum als "YYYY-MM-DD" in Europe/Berlin */
function berlinDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}

/** Addiert n Tage zu einem "YYYY-MM-DD"-String (rein kalendarisch) */
function shiftDate(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const result = new Date(y, m - 1, d + n);
  const ry = result.getFullYear();
  const rm = result.getMonth() + 1;
  const rd = result.getDate();
  return `${ry}-${String(rm).padStart(2, '0')}-${String(rd).padStart(2, '0')}`;
}

export function useProfileStats(exerciseId?: string) {
  const { user } = useAuth();
  const [stats, setStats] = useState<ProfileStats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!exerciseId || !user) return;
    setLoading(true);
    setError(null);

    const today = berlinDateStr(new Date()); // "2026-07-02"
    const since = shiftDate(today, -200); // 182 days for heatmap + buffer for streak calculation

    const { data, error: err } = await supabase
      .from('workout_entries')
      .select('amount, performed_at')
      .eq('exercise_id', exerciseId)
      .gte('performed_at', since + 'T00:00:00+02:00') // Berliner Mitternacht als UTC-Grenze
      .order('performed_at', { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    // Aggregate by Berlin date
    const byDay = new Map<string, { amount: number; sessions: number }>();
    for (const row of data ?? []) {
      const dateStr = berlinDateStr(new Date(row.performed_at as string));
      const prev = byDay.get(dateStr) ?? { amount: 0, sessions: 0 };
      byDay.set(dateStr, { amount: prev.amount + row.amount, sessions: prev.sessions + 1 });
    }

    // Build 182-day array for heatmap (26 weeks, oldest first)
    const dailyData: DayData[] = [];
    for (let i = 181; i >= 0; i--) {
      const dateStr = shiftDate(today, -i);
      const entry = byDay.get(dateStr);
      dailyData.push({ date: dateStr, amount: entry?.amount ?? 0, sessions: entry?.sessions ?? 0 });
    }

    // Last 7 days for bar chart (oldest first)
    const last7DaysData: DayData[] = [];
    for (let i = 6; i >= 0; i--) {
      const dateStr = shiftDate(today, -i);
      const entry = byDay.get(dateStr);
      last7DaysData.push({ date: dateStr, amount: entry?.amount ?? 0, sessions: entry?.sessions ?? 0 });
    }

    // Aggregate totals
    let totalAmount = 0;
    let trainingDays = 0;
    let bestDay: DayData | null = null;
    let last7Days = 0;
    let last30Days = 0;

    const cutoff7 = shiftDate(today, -6);
    const cutoff30 = shiftDate(today, -29);

    const weekTotals = new Map<string, number>();

    for (const [dateStr, v] of byDay) {
      totalAmount += v.amount;
      trainingDays++;
      if (!bestDay || v.amount > bestDay.amount) {
        bestDay = { date: dateStr, amount: v.amount, sessions: v.sessions };
      }
      if (dateStr >= cutoff7) last7Days += v.amount;
      if (dateStr >= cutoff30) last30Days += v.amount;
      const wk = isoWeekKey(dateStr);
      weekTotals.set(wk, (weekTotals.get(wk) ?? 0) + v.amount);
    }

    const bestWeek = weekTotals.size > 0 ? Math.max(...weekTotals.values()) : 0;

    const avgPerActiveDay = trainingDays > 0 ? Math.round(totalAmount / trainingDays) : 0;

    // Streak-Berechnung mit Ruhetag-Regeln (siehe src/lib/streakUtils.ts)
    const byDayAmounts = new Map(Array.from(byDay.entries()).map(([d, v]) => [d, v.amount]));
    const { currentStreak, longestStreak, restDayInfo } = calculateStreakWithRestDays(byDayAmounts, today);

    setStats({
      totalAmount,
      currentStreak,
      longestStreak,
      avgPerActiveDay,
      bestDay: bestDay && (bestDay as DayData).amount > 0 ? bestDay : null,
      bestWeek,
      trainingDays,
      last7Days,
      last30Days,
      restDayInfo,
      dailyData,
      last7DaysData,
    });
    setLoading(false);
  }, [exerciseId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  return { stats, loading, error, refetch: load };
}
