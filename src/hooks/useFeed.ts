import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

// Central list of exercise names allowed in the feed (mirrors the RPC's feed_slugs CTE).
// To enable more exercises in the feed, add their names here.
export const FEED_EXERCISE_NAMES: string[] = ['PushUp'];

export type FeedFilter = 'global' | 'friends';

export interface FeedReactions {
  [emoji: string]: { count: number; reacted: boolean };
}

export interface FeedEvent {
  id: string;
  user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  event_type: string;
  exercise_id: string | null;
  exercise_name: string | null;
  metadata: Record<string, unknown>;
  event_date: string;
  created_at: string;
  reactions: FeedReactions;
}

const PAGE_SIZE = 20;

function applyFilter(rows: FeedEvent[]): FeedEvent[] {
  return rows.filter(
    ev => ev.exercise_id === null || FEED_EXERCISE_NAMES.includes(ev.exercise_name ?? ''),
  );
}

export function useFeed(filter: FeedFilter) {
  const { user } = useAuth();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());
  const cursorRef = useRef<string | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | null, replace: boolean) => {
      if (!user) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc('get_feed_events', {
          p_filter: filter,
          p_cursor: cursor,
          p_limit: PAGE_SIZE,
        });
        if (error) throw error;
        const rows = applyFilter((data as FeedEvent[]) ?? []);
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
        console.error('useFeed fetchPage error', e);
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

      let snapshot: FeedEvent | undefined;

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
      const { data } = await (supabase as any).rpc('get_feed_events', {
        p_filter: filter,
        p_cursor: null,
        p_limit: 5,
      });
      if (!data) return;
      setEvents(prev => {
        const existingIds = new Set(prev.map(e => e.id));
        const newItems = applyFilter(data as FeedEvent[]).filter(e => !existingIds.has(e.id));
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

  return {
    events,
    loading,
    refreshing,
    hasMore,
    newEventIds,
    refresh,
    loadMore,
    toggleReaction,
  };
}
