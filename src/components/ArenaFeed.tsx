import { useEffect, useRef, useState } from 'react';
import { useFeed, type FeedEvent, type FeedFilter } from '@/hooks/useFeed';
import { groupAccentClass, getChip } from '@/lib/feedRegistry';
import { UserInfoSheet } from '@/components/UserInfoSheet';
import { useExercise } from '@/context/ExerciseContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventGroup {
  key: string;
  user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  event_date: string;
  latest_at: string;
  items: FeedEvent[];
  isNew: boolean;
}

// ─── Group events by user × day ──────────────────────────────────────────────

function groupEvents(events: FeedEvent[], newIds: Set<string>): EventGroup[] {
  const map = new Map<string, EventGroup>();
  const order: string[] = [];

  for (const ev of events) {
    const key = `${ev.user_id}::${ev.event_date}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        user_id: ev.user_id,
        display_name: ev.display_name,
        username: ev.username,
        avatar_url: ev.avatar_url,
        event_date: ev.event_date,
        latest_at: ev.created_at,
        items: [],
        isNew: false,
      });
      order.push(key);
    }
    const g = map.get(key)!;
    g.items.push(ev);
    if (newIds.has(ev.id)) g.isNew = true;
    if (ev.created_at > g.latest_at) g.latest_at = ev.created_at;
  }

  return order.map(k => map.get(k)!);
}

// ─── Accent + chip delegated to feedRegistry ─────────────────────────────────
// groupAccentClass() and getChip() are imported from @/lib/feedRegistry.
// To add a new event type, only edit feedRegistry.ts — no changes needed here.

// ─── Compact time ─────────────────────────────────────────────────────────────

function compactTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'jetzt';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} Std.`;
  return `${Math.floor(h / 24)} Tg.`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
  return url ? (
    <img src={url} alt={name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
      {initials || '?'}
    </div>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({
  group,
  onOpenProfile,
}: {
  group: EventGroup;
  onOpenProfile: (group: EventGroup) => void;
}) {
  const name = group.display_name || group.username || 'Unbekannt';
  const accent = groupAccentClass(group.items);

  return (
    <div
      className={`overflow-hidden rounded-xl border border-ink-700 bg-ink-900 ${accent}`}
      style={group.isNew ? { animation: 'feedEnter 0.35s ease-out' } : undefined}
    >
      {/* Header: avatar + name (truncated) + timestamp — all on one line */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
        <button
          onClick={() => onOpenProfile(group)}
          className="shrink-0 rounded-full transition hover:opacity-75 active:opacity-60"
          aria-label={`Profil von ${name}`}
        >
          <Avatar url={group.avatar_url} name={name} />
        </button>

        {/* Name — truncates before timestamp, never overlaps */}
        <button
          onClick={() => onOpenProfile(group)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[13px] font-bold leading-none text-slate-100">
            {name}
          </span>
        </button>

        {/* Timestamp — always visible, never pushed off screen */}
        <span className="shrink-0 pl-2 text-[11px] leading-none text-slate-600">
          {compactTime(group.latest_at)}
        </span>
      </div>

      {/* Event chips — compact, no reactions */}
      <div className="space-y-1 px-3 pb-2">
        {group.items.map(ev => {
          const { icon, label } = getChip(ev);
          return (
            <div key={ev.id} className="flex items-center gap-1.5">
              <span className="text-[14px] leading-none">{icon}</span>
              <span className="min-w-0 truncate text-[12px] font-semibold leading-snug text-slate-200">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-ink-700 bg-ink-900 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 shrink-0 rounded-full bg-ink-700" />
        <div className="min-w-0 flex-1">
          <div className="h-2.5 w-2/5 rounded-full bg-ink-700" />
        </div>
        <div className="h-2 w-8 shrink-0 rounded-full bg-ink-700" />
      </div>
      <div className="mt-1.5 ml-10 h-2.5 w-3/5 rounded-full bg-ink-700" />
    </div>
  );
}

// ─── Filter pill ─────────────────────────────────────────────────────────────

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        active
          ? 'bg-brand-500 text-white'
          : 'bg-ink-800 text-slate-400 hover:bg-ink-700'
      }`}
    >
      {label}
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface InfoSheetState {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  exerciseId: string;
}

export function ArenaFeed({ onClose }: { onClose: () => void }) {
  const { exercise: activeExercise } = useExercise();
  const [filter, setFilter] = useState<FeedFilter>('global');
  const [infoSheet, setInfoSheet] = useState<InfoSheetState | null>(null);
  const {
    events, loading, refreshing, hasMore, newEventIds,
    refresh, loadMore,
  } = useFeed(filter);

  const groups = groupEvents(events, newEventIds);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading) void loadMore();
      },
      { root: listRef.current, threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Pull-to-refresh via touch
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 60 && (listRef.current?.scrollTop ?? 0) <= 0 && !refreshing) void refresh();
  };

  // Open the shared UserInfoSheet — same component used in Friends and Leaderboard.
  // Uses user_id (stable), not @handle, so safe against username changes.
  const handleOpenProfile = (group: EventGroup) => {
    const exerciseId =
      group.items.find(i => i.exercise_id)?.exercise_id ?? activeExercise?.id;
    if (!exerciseId) return;
    setInfoSheet({
      userId: group.user_id,
      displayName: group.display_name || group.username || 'Unbekannt',
      avatarUrl: group.avatar_url,
      exerciseId,
    });
  };

  return (
    <>
      {/* Feed-enter animation */}
      <style>{`
        @keyframes feedEnter {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
        <div style={{ paddingTop: 'env(safe-area-inset-top)' }} />

        {/* Header */}
        <div className="shrink-0 border-b border-ink-800 px-4 pb-3 pt-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-slate-100">Arena-Feed</h2>
                <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold text-green-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                  Live
                </span>
              </div>
              <p className="text-[12px] text-slate-500">Live aus der PushUpArena</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 transition hover:bg-ink-800 hover:text-slate-200"
              aria-label="Schließen"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>

          {/* Filter */}
          <div className="mt-3 flex gap-2">
            <FilterPill label="Global" active={filter === 'global'} onClick={() => setFilter('global')} />
            <FilterPill label="Freunde" active={filter === 'friends'} onClick={() => setFilter('friends')} />
          </div>
        </div>

        {/* Pull-to-refresh indicator */}
        {refreshing && (
          <div className="flex shrink-0 items-center justify-center gap-1.5 py-2 text-xs text-brand-400">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Aktualisieren…
          </div>
        )}

        {/* Feed list */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-3 py-2"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {loading && groups.length === 0 ? (
            <div className="space-y-1.5">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : groups.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-800 text-3xl">
                🏋️
              </div>
              <p className="text-sm font-bold text-slate-300">Noch nichts los.</p>
              <p className="max-w-[200px] text-xs text-slate-600">
                {filter === 'friends'
                  ? 'Deine Freunde waren heute noch nicht aktiv.'
                  : 'Sei der Erste, der heute trainiert!'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {groups.map(group => (
                <GroupCard
                  key={group.key}
                  group={group}
                  onOpenProfile={handleOpenProfile}
                />
              ))}

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-1" />

              {!hasMore && groups.length > 0 && (
                <p className="py-4 text-center text-xs text-slate-600">Das war alles 🎉</p>
              )}

              {/* Bottom safe area */}
              <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }} />
            </div>
          )}
        </div>
      </div>

      {/* Profile sheet — same component used in Friends + Leaderboard */}
      {infoSheet && (
        <UserInfoSheet
          userId={infoSheet.userId}
          displayName={infoSheet.displayName}
          avatarUrl={infoSheet.avatarUrl}
          exerciseId={infoSheet.exerciseId}
          onClose={() => setInfoSheet(null)}
        />
      )}
    </>
  );
}
