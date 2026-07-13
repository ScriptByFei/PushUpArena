import { useEffect, useRef, useState } from 'react';
import { useFeed, type FeedEvent, type FeedFilter } from '@/hooks/useFeed';

// ── Event text ────────────────────────────────────────────────────────────────

function eventText(event: FeedEvent): string {
  const ex = event.exercise_name ?? 'Übung';
  const reps = event.metadata.reps as number | undefined;
  const days = event.metadata.days as number | undefined;
  const pos  = event.metadata.position as number | undefined;

  switch (event.event_type) {
    case 'medal_gold':
      return `hat heute Gold bei ${ex} gewonnen. 🥇`;
    case 'medal_silver':
      return `hat heute Silber bei ${ex} gewonnen. 🥈`;
    case 'medal_bronze':
      return `hat heute Bronze bei ${ex} gewonnen. 🥉`;
    case 'milestone_100':
      return `hat heute 100 ${ex} geschafft. 💯`;
    case 'milestone_250':
      return `hat heute 250 ${ex} geschafft. 🔥`;
    case 'milestone_500':
      return `hat heute 500 ${ex} geschafft. 🚀`;
    case 'milestone_1000':
      return `hat heute 1.000 ${ex} geschafft. 🤯`;
    case 'streak_7':
      return `hält jetzt eine Streak von 7 Tagen. 🔥`;
    case 'streak_14':
      return `hält jetzt eine Streak von 14 Tagen. 💪`;
    case 'streak_30':
      return `hält jetzt eine Streak von 30 Tagen. 🏅`;
    case 'streak_50':
      return `hält jetzt eine Streak von 50 Tagen. ⚡`;
    case 'streak_100':
      return `hält jetzt eine Streak von 100 Tagen. 🔱`;
    case 'personal_record':
      return reps != null
        ? `hat einen neuen Rekord bei ${ex}: ${reps} Wdh. 🏆`
        : `hat einen neuen persönlichen Rekord bei ${ex}. 🏆`;
    case 'top10':
      return pos != null
        ? `ist jetzt auf Platz ${pos} bei ${ex}. 👀`
        : `ist in die Top 10 bei ${ex} eingestiegen. 👀`;
    case 'place1':
      return `ist #1 bei ${ex}! 🥇`;
    case 'daily_goal':
      return `hat das Tagesziel bei ${ex} erreicht. ✅`;
    case 'weekly_goal':
      return `hat das Wochenziel bei ${ex} erreicht. 🎯`;
    case 'achievement':
      return `hat einen Erfolg freigeschaltet. 🏅`;
    default:
      return `war aktiv.`;
  }
}

// ── Relative time ─────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'gerade eben';
  const m = Math.floor(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag${d === 1 ? '' : 'en'}`;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return url ? (
    <img
      src={url}
      alt={name}
      className="h-10 w-10 shrink-0 rounded-full object-cover"
    />
  ) : (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
      {initials || '?'}
    </div>
  );
}

// ── Reaction bar ──────────────────────────────────────────────────────────────

const EMOJIS = ['💪', '🔥', '👏', '❤️'];

function ReactionBar({
  eventId,
  reactions,
  onToggle,
}: {
  eventId: string;
  reactions: FeedEvent['reactions'];
  onToggle: (id: string, emoji: string) => void;
}) {
  return (
    <div className="mt-2.5 flex gap-1.5">
      {EMOJIS.map((emoji) => {
        const r = reactions[emoji] ?? { count: 0, reacted: false };
        return (
          <button
            key={emoji}
            onClick={() => onToggle(eventId, emoji)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition active:scale-95 ${
              r.reacted
                ? 'bg-brand-500/25 text-brand-300 ring-1 ring-brand-500/50'
                : 'bg-ink-700 text-slate-400 hover:bg-ink-600'
            }`}
          >
            <span>{emoji}</span>
            {r.count > 0 && <span>{r.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Feed card ─────────────────────────────────────────────────────────────────

function FeedCard({
  event,
  onToggle,
}: {
  event: FeedEvent;
  onToggle: (id: string, emoji: string) => void;
}) {
  const displayName = event.display_name || event.username || 'Unbekannt';
  const handle = event.username ? `@${event.username}` : null;

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900 p-3.5">
      <div className="flex items-start gap-3">
        <Avatar url={event.avatar_url} name={displayName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-bold text-slate-100">{displayName}</span>
            <span className="shrink-0 text-[11px] text-slate-500">{relativeTime(event.created_at)}</span>
          </div>
          {handle && <p className="text-[11px] text-slate-500">{handle}</p>}
          <p className="mt-1 text-sm leading-snug text-slate-300">
            <span className="font-semibold text-slate-100">{displayName}</span>{' '}
            {eventText(event)}
          </p>
          <ReactionBar eventId={event.id} reactions={event.reactions} onToggle={onToggle} />
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900 p-3.5 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-ink-700" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/3 rounded bg-ink-700" />
          <div className="h-3 w-2/3 rounded bg-ink-700" />
          <div className="h-3 w-1/2 rounded bg-ink-700" />
        </div>
      </div>
    </div>
  );
}

// ── Filter pill ───────────────────────────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────────

export function ArenaFeed({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState<FeedFilter>('global');
  const { events, loading, refreshing, hasMore, refresh, loadMore, toggleReaction } =
    useFeed(filter);

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          void loadMore();
        }
      },
      { root: listRef.current, threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  // Trap scroll on body while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Pull-to-refresh: track touch start + drag
  const touchStartY = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const scrollTop = listRef.current?.scrollTop ?? 0;
    if (dy > 60 && scrollTop <= 0 && !refreshing) {
      void refresh();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
      {/* Safe area top */}
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }} />

      {/* Header */}
      <div className="shrink-0 border-b border-ink-800 px-4 pb-3 pt-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-slate-100">Arena-Feed</h2>
              <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-[12px] text-slate-500">Live aus der PushUpArena</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-ink-800 hover:text-slate-200 transition"
            aria-label="Schließen"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Filter */}
        <div className="mt-3 flex gap-2">
          <FilterPill
            label="Global"
            active={filter === 'global'}
            onClick={() => setFilter('global')}
          />
          <FilterPill
            label="Freunde"
            active={filter === 'friends'}
            onClick={() => setFilter('friends')}
          />
        </div>
      </div>

      {/* Pull-to-refresh indicator */}
      {refreshing && (
        <div className="flex shrink-0 items-center justify-center gap-2 py-2 text-xs text-brand-400">
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          Aktualisieren…
        </div>
      )}

      {/* Feed list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {loading && events.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <span className="text-4xl">🏋️</span>
            <p className="text-sm font-semibold text-slate-400">Noch nichts los hier.</p>
            <p className="text-xs text-slate-600">
              {filter === 'friends'
                ? 'Deine Freunde waren heute noch nicht aktiv.'
                : 'Sei der Erste, der heute trainiert!'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <FeedCard key={ev.id} event={ev} onToggle={toggleReaction} />
            ))}
            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-2" />
            {hasMore && !loading && (
              <p className="py-2 text-center text-xs text-slate-600">Mehr laden…</p>
            )}
            {!hasMore && events.length > 0 && (
              <p className="py-4 text-center text-xs text-slate-600">Das war alles! 🎉</p>
            )}
            {/* Bottom safe area */}
            <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }} />
          </div>
        )}
      </div>
    </div>
  );
}
