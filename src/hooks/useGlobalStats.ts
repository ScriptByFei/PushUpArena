import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface GlobalStats {
  total_members: number;
  active_members: number;
  total_pushups: number;
  total_pullups: number;
  total_dips: number;
  today_active: number;
  new_this_week: number;
  weekly_total: number;
  loaded_at: Date;
}

const CACHE_KEY = 'global-stats-cache';
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

function berlinDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

function berlinToUTC(dateStr: string): string {
  const month = parseInt(dateStr.split('-')[1]);
  const offset = month >= 4 && month <= 10 ? '+02:00' : '+01:00';
  return new Date(`${dateStr}T00:00:00${offset}`).toISOString();
}

export function useGlobalStats() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // Check sessionStorage cache first (avoids redundant RPC on each mount)
      try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as { data: GlobalStats; ts: number };
          if (Date.now() - cached.ts < CACHE_TTL_MS) {
            setStats({ ...cached.data, loaded_at: new Date(cached.data.loaded_at) });
            setLoading(false);
            return;
          }
        }
      } catch {
        // ignore parse errors
      }

      setLoading(true);

      // Berlin date helpers
      const todayBerlin = berlinDateStr(new Date());
      const [y, mo, d] = todayBerlin.split('-').map(Number);
      const localDate = new Date(y, mo - 1, d);
      const dow = (localDate.getDay() + 6) % 7;
      const monDate = new Date(y, mo - 1, d - dow);
      const mondayBerlin = berlinDateStr(monDate);
      const todayStart  = berlinToUTC(todayBerlin);
      const mondayStart = berlinToUTC(mondayBerlin);

      // All stats via RPC (SECURITY DEFINER — bypasses RLS)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: err } = await (supabase as any).rpc('get_global_stats', {
        today_start: todayStart,
        week_start:  mondayStart,
      });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const core = data as {
        total_members: number;
        active_members: number;
        total_pushups: number;
        total_pullups: number;
        total_dips: number;
        today_active: number;
        weekly_total: number;
        new_this_week: number;
      };

      const result: GlobalStats = { ...core, loaded_at: new Date() };
      setStats(result);

      // Cache for 5 minutes
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: result, ts: Date.now() }));
      } catch {
        // ignore quota errors
      }

      setLoading(false);
    }

    void load();
  }, []);

  return { stats, loading, error };
}
