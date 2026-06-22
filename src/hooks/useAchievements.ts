import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Achievement } from '@/lib/database.types';

export interface AchievementWithStatus extends Achievement {
  unlocked: boolean;
  unlocked_at: string | null;
}

interface NewlyUnlocked {
  slug: string;
  name: string;
  icon: string;
}

export function useAchievements() {
  const { user } = useAuth();
  const [items, setItems] = useState<AchievementWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const [catalogRes, unlockedRes] = await Promise.all([
      supabase.from('achievements').select('*').order('sort_order'),
      supabase.from('user_achievements').select('achievement_id, unlocked_at').eq('user_id', user.id),
    ]);

    const firstError = catalogRes.error || unlockedRes.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const unlockedMap = new Map(
      (unlockedRes.data ?? []).map((u) => [u.achievement_id, u.unlocked_at]),
    );
    setItems(
      (catalogRes.data ?? []).map((a) => ({
        ...a,
        unlocked: unlockedMap.has(a.id),
        unlocked_at: unlockedMap.get(a.id) ?? null,
      })),
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Serverseitige Auswertung – gibt die NEU freigeschalteten Badges zurück. */
  const evaluate = useCallback(
    async (exerciseId: string): Promise<NewlyUnlocked[]> => {
      const { data, error: err } = await supabase.rpc('evaluate_achievements', {
        p_exercise: exerciseId,
      });
      if (err) {
        setError(err.message);
        return [];
      }
      if (data && data.length > 0) await load();
      return data ?? [];
    },
    [load],
  );

  const unlockedCount = items.filter((i) => i.unlocked).length;

  return { items, unlockedCount, loading, error, refetch: load, evaluate };
}
