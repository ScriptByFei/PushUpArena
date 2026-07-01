import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export interface DayData {
  date: string; // YYYY-MM-DD UTC
  amount: number;
  sessions: number;
}

export interface ProfileStats {
  totalAmount: number;
  currentStreak: number;
  longestStreak: number;
  avgPerActiveDay: number;
  bestDay: DayData | null;
  trainingDays: number;
  last7Days: number;
  last30Days: number;
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
  trainingDays: 0,
  last7Days: 0,
  last30Days: 0,
  dailyData: [],
  last7DaysData: [],
};

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
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

    const todayUtc = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ),
    );
    const since = addDays(todayUtc, -364);

    const { data, error: err } = await supabase
      .from('workout_entries')
      .select('amount, performed_at')
      .eq('exercise_id', exerciseId)
      .gte('performed_at', since.toISOString())
      .order('performed_at', { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    // Aggregate by UTC date
    const byDay = new Map<string, { amount: number; sessions: number }>();
    for (const row of data ?? []) {
      const dateStr = (row.performed_at as string).slice(0, 10);
      const prev = byDay.get(dateStr) ?? { amount: 0, sessions: 0 };
      byDay.set(dateStr, { amount: prev.amount + row.amount, sessions: prev.sessions + 1 });
    }

    // Build 182-day array for heatmap (26 weeks, oldest first)
    const dailyData: DayData[] = [];
    for (let i = 181; i >= 0; i--) {
      const d = addDays(todayUtc, -i);
      const dateStr = utcDateStr(d);
      const entry = byDay.get(dateStr);
      dailyData.push({ date: dateStr, amount: entry?.amount ?? 0, sessions: entry?.sessions ?? 0 });
    }

    // Last 7 days for bar chart (oldest first)
    const last7DaysData: DayData[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(todayUtc, -i);
      const dateStr = utcDateStr(d);
      const entry = byDay.get(dateStr);
      last7DaysData.push({ date: dateStr, amount: entry?.amount ?? 0, sessions: entry?.sessions ?? 0 });
    }

    // Aggregate totals from all fetched data
    let totalAmount = 0;
    let trainingDays = 0;
    let bestDay: DayData | null = null;
    let last7Days = 0;
    let last30Days = 0;

    const cutoff7 = utcDateStr(addDays(todayUtc, -6));
    const cutoff30 = utcDateStr(addDays(todayUtc, -29));

    for (const [dateStr, v] of byDay) {
      totalAmount += v.amount;
      trainingDays++;
      if (!bestDay || v.amount > bestDay.amount) {
        bestDay = { date: dateStr, amount: v.amount, sessions: v.sessions };
      }
      if (dateStr >= cutoff7) last7Days += v.amount;
      if (dateStr >= cutoff30) last30Days += v.amount;
    }

    const avgPerActiveDay = trainingDays > 0 ? Math.round(totalAmount / trainingDays) : 0;

    // Streak calculations (UTC, matching compute_streak server logic)
    const activeDates = Array.from(byDay.keys()).sort();
    const activeDateSet = new Set(activeDates);
    const todayStr = utcDateStr(todayUtc);
    const yesterdayStr = utcDateStr(addDays(todayUtc, -1));

    // Current streak: consecutive days ending today or yesterday
    let currentStreak = 0;
    const streakStart = activeDateSet.has(todayStr)
      ? todayUtc
      : activeDateSet.has(yesterdayStr)
        ? addDays(todayUtc, -1)
        : null;
    if (streakStart) {
      let cursor = streakStart;
      while (activeDateSet.has(utcDateStr(cursor))) {
        currentStreak++;
        cursor = addDays(cursor, -1);
      }
    }

    // Longest streak: scan sorted active dates
    let longestStreak = 0;
    let run = 0;
    for (let i = 0; i < activeDates.length; i++) {
      if (i === 0) {
        run = 1;
      } else {
        const diff =
          (new Date(activeDates[i]).getTime() - new Date(activeDates[i - 1]).getTime()) / 86_400_000;
        run = diff === 1 ? run + 1 : 1;
      }
      if (run > longestStreak) longestStreak = run;
    }

    setStats({
      totalAmount,
      currentStreak,
      longestStreak,
      avgPerActiveDay,
      bestDay: bestDay && (bestDay as DayData).amount > 0 ? bestDay : null,
      trainingDays,
      last7Days,
      last30Days,
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
