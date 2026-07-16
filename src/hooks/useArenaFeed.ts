import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { ArenaFeedEvent } from '@/types/feed';

// Central list of exercise names allowed in the feed (mirrors the RPC's feed_slugs CTE).
// To enable more exercises in the feed, add their names here.
export const FEED_EXERCISE_NAMES: string[] = ['PushUp'];

export type FeedFilter = 'global' | 'friends';

export interface LiveActivityEntry {
  exerciseId: string;
  todayTotal: number;
  lastDelta: number;
  ts: string;
}

export type LiveActivityMap = Record<string, LiveActivityEntry>;

const PAGE_SIZE = 20;

function applyFilter(rows: ArenaFeedEvent[]): ArenaFeedEvent[] {
  return rows.filter(
    ev => ev.exercise_id === null || FEED_EXERCISE_NAMES.includes(ev.exercise_name ?? ''),
  );
}

export function useArenaFeed(filter: FeedFilter) {
  const { user } = useAuth();
  const [events, setEvents] = useState<ArenaFeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());
  const [liveActivity, setLiveActivity] = useState<LiveActivityMap>({});
  const cursorRef = useRef<string | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | null, replace: boolean) => {
      if (!user) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc('get_arena_feed', {
          p_filter: filter,
          p_cursor: cursor,
          p_limit: PAGE_SIZE,
        });
        if (error) throw error;
        const rows = applyFilter((data as ArenaFeedEvent[]) ?? []);
        if (replace) {
          setEvents(rows);
        } else {
          setEvents(prev => [...prev, ...rows]);
        }
        if (rows.length > 0) {
          cursorRef.current = rows[rows.length - 1].created_at;
        }
        setHasMore(rows.length === PAGE_SIZE);
      } catch (e) {
        console.error('useArenaFeed fetchPage error', e);
      }
    },
    [user, filter],
  );

  // Initial load / filter change
  useEffect(() => {
    cursorRef.current = null;
    setEvents([]);
    setHasMore(true);
    setLoading(true);
    fetchPage(null, true).finally(() => setLoading(false));
  }, [fetchPage]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setLiveActivity({});  // clear live deltas so delta badges reset after pull-to-refresh
    cursorRef.current = null;
    await fetchPage(null, true);
    setRefreshing(false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    await fetchPage(cursorRef.current, false);
  }, [fetchPage, hasMore, loading]);

  // One-reaction-at-a-time toggle with optimistic update + revert
  const toggleReaction = useCallback(
    async (eventId: string, emoji: string) => {
      if (!user) return;

      let snapshot: ArenaFeedEvent | undefined;

      setEvents(prev =>
        prev.map(ev => {
          if (ev.id !== eventId) return ev;
          snapshot = ev;

          // Which emoji is currently active?
          const activeEmoji = Object.entries(ev.reactions).find(([, r]) => r.reacted)?.[0];
          const next = { ...ev.reactions };

          // Remove the active reaction
          if (activeEmoji) {
            const cur = next[activeEmoji] ?? { count: 0, reacted: false };
            next[activeEmoji] = { count: Math.max(0, cur.count - 1), reacted: false };
          }

          // Add new reaction only if it differs from what was active (toggle-off vs switch)
          if (activeEmoji !== emoji) {
            const cur = next[emoji] ?? { count: 0, reacted: false };
            next[emoji] = { count: cur.count + 1, reacted: true };
          }

          return { ...ev, reactions: next };
        }),
      );

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc('toggle_feed_reaction', {
          p_event_id: eventId,
          p_reaction: emoji,
        });
      } catch (e) {
        console.error('toggleReaction error', e);
        if (snapshot) {
          const snap = snapshot;
          setEvents(prev => prev.map(ev => (ev.id === eventId ? snap : ev)));
        }
      }
    },
    [user],
  );

  // Realtime: prepend new events + animate.
  // Debounced 3 s so rapid bursts (multiple INSERTs in quick succession) only
  // trigger a single RPC fetch instead of one per row.
  const realtimeDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchNewEvents = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc('get_arena_feed', {
        p_filter: filter,
        p_cursor: null,
        p_limit: 5,
      });
      if (!data) return;
      setEvents(prev => {
        const existingIds = new Set(prev.map(e => e.id));
        const newItems = applyFilter(data as ArenaFeedEvent[]).filter(e => !existingIds.has(e.id));
        if (newItems.length === 0) return prev;

        // Mark as new for animation
        const ids = new Set(newItems.map(e => e.id));
        setNewEventIds(s => new Set([...s, ...ids]));
        setTimeout(() => setNewEventIds(s => {
          const next = new Set(s);
          ids.forEach(id => next.delete(id));
          return next;
        }), 900);

        return [...newItems, ...prev];
      });
    };

    const channel = supabase
      .channel('feed_events_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'feed_events' },
        () => {
          if (realtimeDebounce.current) clearTimeout(realtimeDebounce.current);
          realtimeDebounce.current = setTimeout(() => { void fetchNewEvents(); }, 3_000);
        },
      )
      .subscribe();

    return () => {
      if (realtimeDebounce.current) clearTimeout(realtimeDebounce.current);
      void supabase.removeChannel(channel);
    };
  }, [user, filter]);

  // Realtime: live_activity aggregate → per-user today totals + last delta.
  // Replaces the old raw workout_entries subscription (fewer rows, no client-side accumulation).
  useEffect(() => {
    if (!user) return;
    const applyRow = (row: {
      user_id: string; exercise_id: string; today_total: number; last_delta: number; last_updated: string;
    }) => {
      setLiveActivity(prev => ({
        ...prev,
        [row.user_id]: {
          exerciseId: row.exercise_id,
          todayTotal: Number(row.today_total) || 0,
          lastDelta: Number(row.last_delta) || 0,
          ts: row.last_updated,
        },
      }));
    };

    const channel = supabase
      .channel('live_activity_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_activity' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => applyRow(payload.new),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user]);

  return {
    events,
    loading,
    refreshing,
    hasMore,
    newEventIds,
    liveActivity,
    refresh,
    loadMore,
    toggleReaction,
  };
}
