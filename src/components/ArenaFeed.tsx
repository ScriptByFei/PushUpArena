import { useEffect, useRef, useState } from 'react';
import { useFeed, type FeedEvent, type FeedFilter } from '@/hooks/useFeed';
import { groupAccentClass, getChip, getEventPriority } from '@/lib/feedRegistry';
import { UserInfoSheet } from '@/components/UserInfoSheet';
import { useExercise } from '@/context/ExerciseContext';
import { Avatar } from '@/components/ui/Avatar';

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

type LiveActivity = Record<string, { addedReps: number; ts: string }>;

function groupEvents(events: FeedEvent[], newIds: Set<string>, live: LiveActivity): EventGroup[] {
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

  // Sort chips within each group by priority (highest first)
  for (const g of map.values()) {
    g.items.sort((a, b) => getEventPriority(b.event_type) - getEventPriority(a.event_type));
  }

  // Sort groups: most recently active (live or latest_at) first
  return order
    .map(k => map.get(k)!)
    .sort((a, b) => {
      const aKey = (live[a.user_id]?.ts ?? '') > a.latest_at ? live[a.user_id].ts : a.latest_at;
      const bKey = (live[b.user_id]?.ts ?? '') > b.latest_at ? live[b.user_id].ts : b.latest_at;
      return bKey.localeCompare(aKey);
    });
}

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

// ─── Group card (Story layout) ────────────────────────────────────────────────
//
// Structure:
//   [Avatar]  [name · time]
//             [HEADLINE ICON] [HEADLINE LABEL — big]
//             [small icon]    [secondary label — muted]
//             ...

function GroupCard({
  group,
  liveReps,
  onOpenProfile,
}: {
  group: EventGroup;
  liveReps?: { addedReps: number; ts: string };
  onOpenProfile: (group: EventGroup) => void;
}) {
  // Flash border animation when new live reps arrive
  const [flashing, setFlashing] = useState(false);
  const prevTsRef = useRef<string | undefined>(liveReps?.ts);
  useEffect(() => {
    if (liveReps?.ts && liveReps.ts !== prevTsRef.current) {
      prevTsRef.current = liveReps.ts;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 900);
      return () => clearTimeout(t);
    }
  }, [liveReps?.ts]);

  // Count-up animation for the delta badge
  const prevRepsRef = useRef(0);
  const [displayedReps, setDisplayedReps] = useState(0);
  useEffect(() => {
    if (liveReps?.addedReps == null) return;
    const from = prevRepsRef.current;
    const to = liveReps.addedReps;
    prevRepsRef.current = to;
    if (from === to) return;
    const start = performance.now();
    const dur = 500;
    let rafId: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const ease = 1 - (1 - t) ** 3;
      setDisplayedReps(Math.round(from + (to - from) * ease));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [liveReps?.addedReps]);

  const name = group.display_name || group.username || 'Unbekannt';
  const accent = groupAccentClass(group.items);

  // Highest-priority event is the story headline; rest are secondary details
  const [headline, ...secondary] = group.items;
  const { icon: hIcon, label: hLabel } = getChip(headline);

  // Use live timestamp for recency display if more recent
  const displayTime = liveReps?.ts && liveReps.ts > group.latest_at
    ? liveReps.ts
    : group.latest_at;

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-ink-700/60 bg-ink-900 transition-transform active:scale-[0.985] ${accent}`}
      style={
        group.isNew
          ? { animation: 'feedEnter 0.35s ease-out' }
          : flashing
          ? { animation: 'liveFlash 0.9s ease-out' }
          : undefined
      }
    >
      <button
        className="w-full text-left"
        onClick={() => onOpenProfile(group)}
        aria-label={`Profil von ${name}`}
      >
        <div className="flex items-start gap-3 px-4 pt-3.5 pb-3.5">
          {/* Avatar */}
          <div className="shrink-0 pt-0.5">
            <Avatar url={group.avatar_url} name={name} size={38} />
          </div>

          {/* Story content */}
          <div className="min-w-0 flex-1">
            {/* Name + time row */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-semibold leading-none text-slate-400">
                {name}
              </span>
              <span className="shrink-0 text-[10px] font-medium leading-none text-slate-600 tabular-nums">
                {compactTime(displayTime)}
              </span>
            </div>

            {/* Headline event — the story */}
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[22px] leading-none">{hIcon}</span>
              <span className="min-w-0 truncate text-[15px] font-extrabold leading-snug tracking-tight text-slate-100">
                {hLabel}
              </span>
            </div>

            {/* Secondary events — supporting details */}
            {secondary.length > 0 && (
              <div className="mt-2 space-y-1">
                {secondary.map(ev => {
                  const { icon, label } = getChip(ev);
                  return (
                    <div key={ev.id} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-center text-[16px] leading-none opacity-60">
                        {icon}
                      </span>
                      <span className="min-w-0 truncate text-[12px] font-medium leading-snug text-slate-500">
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Live delta badge — appears when new reps are logged since card was shown */}
            {liveReps && displayedReps > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-bold text-brand-400">
                  +{displayedReps}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-600">
                  <span className="inline-block h-1 w-1 rounded-full bg-green-400 animate-pulse" />
                  gerade eben
                </span>
              </div>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-ink-700/60 bg-ink-900 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-[38px] w-[38px] shrink-0 rounded-full bg-ink-700" />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-baseline justify-between">
            <div className="h-2.5 w-1/4 rounded-full bg-ink-700" />
            <div className="h-2 w-8 rounded-full bg-ink-700" />
          </div>
          <div className="mt-2 h-4 w-3/5 rounded-full bg-ink-700" />
        </div>
      </div>
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
    events, loading, refreshing, hasMore, newEventIds, liveActivity,
    refresh, loadMore,
  } = useFeed(filter);

  const groups = groupEvents(events, newEventIds, liveActivity);
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

  // Lock body scroll while feed is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Auto-refresh at Berlin midnight
  useEffect(() => {
    const msUntilMidnight = (): number => {
      const now = new Date();
      const berlinStr = now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' });
      const berlinNow = new Date(berlinStr);
      const midnight = new Date(berlinNow);
      midnight.setHours(24, 0, 5, 0);
      return Math.max(0, midnight.getTime() - berlinNow.getTime());
    };
    const timer = setTimeout(() => void refresh(), msUntilMidnight());
    return () => clearTimeout(timer);
  }, [refresh]);

  // Pull-to-refresh via touch
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 60 && (listRef.current?.scrollTop ?? 0) <= 0 && !refreshing) void refresh();
  };

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
      <style>{`
        @keyframes feedEnter {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes liveFlash {
          0%   { box-shadow: 0 0 0 0px rgba(99,102,241,0); }
          35%  { box-shadow: 0 0 0 3px rgba(99,102,241,0.45); }
          100% { box-shadow: 0 0 0 0px rgba(99,102,241,0); }
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

          <div className="mt-3 flex gap-2">
            <FilterPill label="Global"  active={filter === 'global'}  onClick={() => setFilter('global')}  />
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
          className="flex-1 overflow-y-auto px-3 py-3"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {loading && groups.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 7 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : groups.length === 0 ? (
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
            <div className="space-y-2">
              {groups.map(group => (
                <GroupCard
                  key={group.key}
                  group={group}
                  liveReps={liveActivity[group.user_id]}
                  onOpenProfile={handleOpenProfile}
                />
              ))}

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-1" />

              {!hasMore && groups.length > 0 && (
                <p className="py-4 text-center text-xs text-slate-600">Das war alles 🎉</p>
              )}

              <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }} />
            </div>
          )}
        </div>
      </div>

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
