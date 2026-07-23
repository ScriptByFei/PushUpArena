/**
 * useNavBadges
 *
 * Lightweight hook that provides badge signals for the NavDrawer.
 * Intentionally minimal — no leaderboard, no feed data, no heavy state.
 *
 *   challengeIsActive  – true while the daily challenge window is open
 *   feedNewCount       – INSERT events on feed_events since app mount (realtime)
 *   clearFeedBadge     – call when the user opens Arena Feed
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useExercise } from '@/context/ExerciseContext';

/** Re-check challenge status every 5 minutes. */
const POLL_MS = 5 * 60 * 1000;

export function useNavBadges() {
  const { user } = useAuth();
  const { exercise } = useExercise();
  const exerciseId = exercise?.id ?? null;

  const [challengeIsActive, setChallengeIsActive] = useState(false);
  const [feedNewCount, setFeedNewCount] = useState(0);

  // ── Daily challenge active? ───────────────────────────────────────────────
  useEffect(() => {
    if (!user || !exerciseId) return;
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const { data } = await (supabase as any).rpc('get_daily_challenge_status', {
          p_exercise_id: exerciseId,
        });
        if (!cancelled) setChallengeIsActive(Boolean(data?.is_active));
      } catch {
        /* Silently ignore — badge stays false */
      }
    };

    void fetchStatus();
    const id = setInterval(() => void fetchStatus(), POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [user, exerciseId]);

  // ── Feed new events (realtime INSERT counter since app mount) ─────────────
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('nav-feed-badge')
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'feed_events' },
        () => setFeedNewCount(c => c + 1),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user]);

  const clearFeedBadge = useCallback(() => setFeedNewCount(0), []);

  return { challengeIsActive, feedNewCount, clearFeedBadge };
}
