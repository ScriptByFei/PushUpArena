import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface GlobalStats {
  total_members: number;
  active_members: number;
  total_pushups: number;
  total_pullups: number;
  total_dips: number;
}

export function useGlobalStats() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: err } = await (supabase as any).rpc('get_global_stats');
      if (err) {
        setError(err.message);
      } else {
        setStats(data as unknown as GlobalStats);
      }
      setLoading(false);
    }
    void load();
  }, []);

  return { stats, loading, error };
}
