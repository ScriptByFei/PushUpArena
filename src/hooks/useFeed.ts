import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

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

export function useFeed(filter: FeedFilter) {
  const { user } = useAuth();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
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
        const rows = (data as FeedEvent[]) ?? [];
        if (replace) {
          setEvents(rows);
        } else {
          setEvents((prev) => [...prev, ...rows]);
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

  // Initial load
  useEffect(() => {
    cursorRef.current = null;
    setEvents([]);
    setHasMore(true);
    setLoading(true);
    fetchPage(null, true).finally(() => setLoading(false));
  }, [fetchPage]);

  // Pull-to-refresh
  const refresh = useCallback(async () => {
    setRefreshing(true);
    cursorRef.current = null;
    await fetchPage(null, true);
    setRefreshing(false);
  }, [fetchPage]);

  // Infinite scroll — load next page
  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    await fetchPage(cursorRef.current, false);
  }, [fetchPage, hasMore, loading]);

  // Optimistic reaction toggle
  const toggleReaction = useCallback(
    async (eventId: string, emoji: string) => {
      if (!user) return;

      // Optimistic update
      setEvents((prev) =>
        prev.map((ev) => {
          if (ev.id !== eventId) return ev;
          const current = ev.reactions[emoji] ?? { count: 0, reacted: false };
          return {
            ...ev,
            reactions: {
              ...ev.reactions,
              [emoji]: {
                count: current.reacted ? current.count - 1 : current.count + 1,
                reacted: !current.reacted,
              },
            },
          };
        }),
      );

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc('toggle_feed_reaction', {
          p_event_id: eventId,
          p_reaction: emoji,
        });
      } catch (e) {
        // Revert on error
        console.error('toggleReaction error', e);
        setEvents((prev) =>
          prev.map((ev) => {
            if (ev.id !== eventId) return ev;
            const current = ev.reactions[emoji] ?? { count: 0, reacted: false };
            return {
              ...ev,
              reactions: {
                ...ev.reactions,
                [emoji]: {
                  count: current.reacted ? current.count - 1 : current.count + 1,
                  reacted: !current.reacted,
                },
              },
            };
          }),
        );
      }
    },
    [user],
  );

  // Realtime: prepend new events
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('feed_events_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'feed_events' },
        async () => {
          // Refetch first page and merge new items at top
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any).rpc('get_feed_events', {
            p_filter: filter,
            p_cursor: null,
            p_limit: 5,
          });
          if (!data) return;
          setEvents((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const newItems = (data as FeedEvent[]).filter((e) => !existingIds.has(e.id));
            return newItems.length > 0 ? [...newItems, ...prev] : prev;
          });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, filter]);

  return {
    events,
    loading,
    refreshing,
    hasMore,
    refresh,
    loadMore,
    toggleReaction,
  };
}
