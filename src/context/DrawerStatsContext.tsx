/**
 * DrawerStatsContext
 *
 * Single source of truth for the stats shown in the NavDrawer profile header
 * AND in the Dashboard tile row.  Prevents a duplicate `get_my_stats` RPC call
 * that would otherwise fire from both the always-mounted NavDrawer and the
 * Dashboard page simultaneously.
 *
 * Provider placement: inside ExerciseProvider (needs exercise.id),
 *                     outside PushProvider and AppLayout.
 *
 * Provides:
 *   stats        – from get_my_stats  (total_amount, current_streak, …)
 *   dailyRank    – from get_my_daily_rank (1-based; null = not yet ranked today)
 *   statsLoading / rankLoading
 *   refetch()    – call after logging a workout to refresh both values
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useExercise } from '@/context/ExerciseContext';
import type { MyStats } from '@/lib/database.types';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface DrawerStatsContextValue {
  stats: MyStats;
  statsLoading: boolean;
  /** 1-based position in today's global daily ranking. null = not yet ranked today. */
  dailyRank: number | null;
  rankLoading: boolean;
  /** Call after logging a workout to refresh stats and rank immediately. */
  refetch: () => void;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const EMPTY_STATS: MyStats = {
  today_amount: 0,
  week_amount: 0,
  total_amount: 0,
  level: 1,
  current_streak: 0,
};

/** Throttle tab-focus refetch to at most once per 3 minutes. */
const VISIBILITY_REFETCH_MS = 3 * 60_000;

/* ─── Context ────────────────────────────────────────────────────────────── */

const DrawerStatsContext = createContext<DrawerStatsContextValue | undefined>(undefined);

/* ─── Provider ───────────────────────────────────────────────────────────── */

export function DrawerStatsProvider({ children }: { children: ReactNode }) {
  const { exercise } = useExercise();
  const exerciseId = exercise?.id;

  const [stats, setStats]               = useState<MyStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);
  const [dailyRank, setDailyRank]       = useState<number | null>(null);
  const [rankLoading, setRankLoading]   = useState(true);
  const lastLoadedAt                    = useRef<number>(0);

  const load = useCallback(async () => {
    if (!exerciseId) return;
    setStatsLoading(true);
    setRankLoading(true);

    // Both RPCs fire in parallel — one round trip
    const [statsResult, rankResult] = await Promise.all([
      supabase.rpc('get_my_stats', { p_exercise: exerciseId }),
      supabase.rpc('get_my_daily_rank', { p_exercise: exerciseId }),
    ]);

    if (!statsResult.error) {
      setStats(statsResult.data?.[0] ?? EMPTY_STATS);
    }
    if (!rankResult.error) {
      const row = (rankResult.data as { daily_rank: number; today_amount: number }[] | null)?.[0];
      setDailyRank(row?.daily_rank ?? null);
    }

    setStatsLoading(false);
    setRankLoading(false);
    lastLoadedAt.current = Date.now();
  }, [exerciseId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Throttled refetch on tab-focus — same pattern as useLeaderboard
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

  const value: DrawerStatsContextValue = {
    stats,
    statsLoading,
    dailyRank,
    rankLoading,
    refetch: load,
  };

  return (
    <DrawerStatsContext.Provider value={value}>
      {children}
    </DrawerStatsContext.Provider>
  );
}

/* ─── Hook ───────────────────────────────────────────────────────────────── */

export function useDrawerStats(): DrawerStatsContextValue {
  const ctx = useContext(DrawerStatsContext);
  if (!ctx) throw new Error('useDrawerStats must be used inside DrawerStatsProvider');
  return ctx;
}
