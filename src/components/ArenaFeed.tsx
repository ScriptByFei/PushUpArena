import { useEffect, useMemo, useRef, useState } from 'react';
import { useArenaFeed, type FeedFilter, type LiveActivityMap } from '@/hooks/useArenaFeed';
import { getChip, getEventPriority, getGroupCardType } from '@/lib/feedRegistry';
import { UserInfoSheet } from '@/components/UserInfoSheet';
import { useExercise } from '@/context/ExerciseContext';
import { Avatar } from '@/components/ui/Avatar';
import type { ArenaFeedEvent, ArenaFeedGroup, FeedCardType } from '@/types/feed';

// ─── Group events by group_key (user × exercise × day, computed server-side) ──

function groupEvents(events: ArenaFeedEvent[], newIds: Set<string>, live: LiveActivityMap): ArenaFeedGroup[] {
  const map = new Map<string, ArenaFeedGroup>();
  const order: string[] = [];

  for (const ev of events) {
    const key = ev.group_key;
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
        cardType: 'standard',
      });
      order.push(key);
    }
    const g = map.get(key)!;
    g.items.push(ev);
    if (newIds.has(ev.id)) g.isNew = true;
    if (ev.created_at > g.latest_at) g.latest_at = ev.created_at;
  }

  for (const g of map.values()) {
    g.items.sort((a, b) => getEventPriority(b.event_type) - getEventPriority(a.event_type));
    g.cardType = getGroupCardType(g.items);
  }

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

// ─── Reactions bar ────────────────────────────────────────────────────────────

const REACTION_EMOJIS = ['💪', '🔥', '👑', '🤯', '❤️'];

function ReactionsBar({
  eventId,
  reactions,
  onToggle,
}: {
  eventId: string;
  reactions: ArenaFeedEvent['reactions'];
  onToggle: (eventId: string, emoji: string) => void;
}) {
  return (
    <div className="mt-2.5 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      {REACTION_EMOJIS.map(emoji => {
        const r = reactions[emoji];
        const count = r?.count ?? 0;
        const reacted = r?.reacted ?? false;
        return (
          <button
            key={emoji}
            onClick={() => onToggle(eventId, emoji)}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
              reacted
                ? 'bg-brand-500/20 text-brand-300'
                : 'bg-ink-800/80 text-slate-500 hover:bg-ink-700'
            }`}
          >
            <span className="text-[13px] leading-none">{emoji}</span>
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Shared card chrome ───────────────────────────────────────────────────────

interface CardProps {
  group: ArenaFeedGroup;
  liveReps?: { addedReps: number; ts: string };
  onOpenProfile: (group: ArenaFeedGroup) => void;
  onToggleReaction: (eventId: string, emoji: string) => void;
}

const CARD_TYPE_GLOW: Partial<Record<FeedCardType, string>> = {
  hero: 'shadow-[0_0_24px_-6px_rgba(251,191,36,0.35)]',
};

function CardShell({
  group,
  flashing,
  extraClass,
  children,
}: {
  group: ArenaFeedGroup;
  flashing: boolean;
  extraClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-ink-900 transition-transform active:scale-[0.985] ${
        group.cardType === 'hero' ? 'border-amber-400/30' : 'border-ink-700/60'
      } ${CARD_TYPE_GLOW[group.cardType] ?? ''} ${extraClass ?? ''}`}
      style={
        group.isNew
          ? { animation: 'feedEnter 0.35s ease-out' }
          : flashing
          ? { animation: 'liveFlash 0.9s ease-out' }
          : undefined
      }
    >
      {children}
    </div>
  );
}

function CardHeader({
  name,
  avatarUrl,
  time,
  size = 38,
}: {
  name: string;
  avatarUrl: string | null;
  time: string;
  size?: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Avatar url={avatarUrl} name={name} size={size} />
        <span className="truncate text-[13px] font-semibold leading-none text-slate-400">{name}</span>
      </div>
      <span className="shrink-0 text-[10px] font-medium leading-none text-slate-600 tabular-nums">
        {compactTime(time)}
      </span>
    </div>
  );
}

// ─── StandardCard ─────────────────────────────────────────────────────────────

function StandardCard({ group, liveReps, onOpenProfile, onToggleReaction }: CardProps) {
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

  const name = group.display_name || group.username || 'Unbekannt';
  const [headline, ...secondary] = group.items;
  const { icon: hIcon, label: hLabel } = getChip(headline);
  const displayTime = liveReps?.ts && liveReps.ts > group.latest_at ? liveReps.ts : group.latest_at;

  return (
    <CardShell group={group} flashing={flashing}>
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-4 pt-3.5 pb-3.5">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={displayTime} />

          <div className="mt-1 flex items-center gap-2">
            <span className="text-[22px] leading-none">{hIcon}</span>
            <span className="min-w-0 truncate text-[15px] font-extrabold leading-snug tracking-tight text-slate-100">
              {hLabel}
            </span>
          </div>

          {secondary.length > 0 && (
            <div className="mt-2 space-y-1">
              {secondary.map(ev => {
                const { icon, label } = getChip(ev);
                return (
                  <div key={ev.id} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center text-[16px] leading-none opacity-60">{icon}</span>
                    <span className="min-w-0 truncate text-[12px] font-medium leading-snug text-slate-500">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {liveReps && liveReps.addedReps > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-bold text-brand-400">
                +{liveReps.addedReps}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-600">
                <span className="inline-block h-1 w-1 rounded-full bg-green-400 animate-pulse" />
                gerade eben
              </span>
            </div>
          )}
        </div>
      </button>
      <div className="px-4 pb-3.5">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── HeroCard — selten, groß, mit Glow ────────────────────────────────────────

function HeroCard({ group, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const [headline, ...secondary] = group.items;
  const { icon: hIcon, label: hLabel } = getChip(headline);

  return (
    <CardShell group={group} flashing={false} extraClass="bg-gradient-to-br from-ink-900 via-ink-900 to-amber-950/20">
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-4 pt-4 pb-4">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={group.latest_at} size={42} />

          <div className="mt-2.5 flex items-center gap-3">
            <span className="text-[34px] leading-none animate-pulse">{hIcon}</span>
            <span className="min-w-0 truncate text-[19px] font-black leading-tight tracking-tight text-amber-300">
              {hLabel}
            </span>
          </div>

          {secondary.length > 0 && (
            <div className="mt-2.5 space-y-1">
              {secondary.map(ev => {
                const { icon, label } = getChip(ev);
                return (
                  <div key={ev.id} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center text-[16px] leading-none opacity-70">{icon}</span>
                    <span className="min-w-0 truncate text-[12px] font-medium leading-snug text-slate-400">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </button>
      <div className="px-4 pb-4">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── RecordCard — alt vs. neu ──────────────────────────────────────────────────

function RecordCard({ group, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const [headline] = group.items;
  const { icon: hIcon, label: hLabel } = getChip(headline);
  const m = headline.metadata as Record<string, unknown>;
  const reps = m.reps as number | undefined;
  const prevBest = m.prev_best as number | undefined;

  return (
    <CardShell group={group} flashing={false}>
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-4 pt-3.5 pb-3.5">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={group.latest_at} />
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[22px] leading-none">{hIcon}</span>
            <span className="min-w-0 truncate text-[15px] font-extrabold leading-snug tracking-tight text-slate-100">
              {hLabel}
            </span>
          </div>
          {reps != null && prevBest != null && prevBest > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[13px] font-bold tabular-nums">
              <span className="text-slate-600 line-through">{prevBest}</span>
              <span className="text-slate-600">→</span>
              <span className="text-brand-400">{reps}</span>
            </div>
          )}
        </div>
      </button>
      <div className="px-4 pb-3.5">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── RankMovementCard — Rang vorher → nachher ─────────────────────────────────

function RankMovementCard({ group, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const [headline] = group.items;
  const m = headline.metadata as Record<string, unknown>;
  const oldRank = m.old_rank as number | undefined;
  const newRank = m.new_rank as number | undefined;
  const overtaken = m.overtaken_name as string | undefined;

  return (
    <CardShell group={group} flashing={false}>
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-4 pt-3.5 pb-3.5">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={group.latest_at} />
          <div className="mt-1.5 flex items-center gap-2.5">
            <span className="text-[22px] leading-none">📈</span>
            {oldRank != null && newRank != null ? (
              <span className="flex items-center gap-1.5 text-[16px] font-black tabular-nums text-slate-100">
                <span className="text-slate-500">#{oldRank}</span>
                <span className="text-brand-400">→</span>
                <span className="text-brand-400">#{newRank}</span>
              </span>
            ) : (
              <span className="text-[15px] font-extrabold text-slate-100">Rangverbesserung</span>
            )}
          </div>
          {overtaken && (
            <p className="mt-1 text-[12px] font-medium text-slate-500">{overtaken} überholt</p>
          )}
        </div>
      </button>
      <div className="px-4 pb-3.5">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── ComebackCard ─────────────────────────────────────────────────────────────

function ComebackCard({ group, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const [headline] = group.items;
  const daysOff = (headline.metadata as Record<string, unknown>).days_off as number | undefined;

  return (
    <CardShell group={group} flashing={false} extraClass="bg-gradient-to-br from-ink-900 to-orange-950/10">
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-4 pt-3.5 pb-3.5">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={group.latest_at} />
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[22px] leading-none">💥</span>
            <span className="text-[15px] font-extrabold text-orange-300">
              {daysOff != null ? `Comeback nach ${daysOff} Tagen` : 'Comeback'}
            </span>
          </div>
        </div>
      </button>
      <div className="px-4 pb-3.5">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── StreakCard ────────────────────────────────────────────────────────────────

function StreakCard({ group, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const [headline] = group.items;
  const { icon: hIcon, label: hLabel } = getChip(headline);
  const days = (headline.metadata as Record<string, unknown>).days as number | undefined;

  return (
    <CardShell group={group} flashing={false}>
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-4 pt-3.5 pb-3.5">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={group.latest_at} />
          <div className="mt-1.5 flex items-center gap-2.5">
            <span className="text-[26px] leading-none">{hIcon}</span>
            <div className="flex flex-col">
              <span className="text-[15px] font-extrabold leading-snug text-slate-100">{hLabel}</span>
              {days != null && (
                <span className="text-[11px] font-semibold text-slate-600">{days} Tage in Folge</span>
              )}
            </div>
          </div>
        </div>
      </button>
      <div className="px-4 pb-3.5">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── DuelCard — knapper Zweikampf (rank_improved mit improvement === 1) ───────

function DuelCard({ group, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const [headline] = group.items;
  const m = headline.metadata as Record<string, unknown>;
  const overtaken = m.overtaken_name as string | undefined;
  const newRank = m.new_rank as number | undefined;

  return (
    <CardShell group={group} flashing={false} extraClass="bg-gradient-to-br from-ink-900 to-brand-950/20">
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-4 pt-3.5 pb-3.5">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={group.latest_at} />
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[22px] leading-none">⚔️</span>
            <span className="text-[15px] font-extrabold text-brand-300">
              Knapp an {overtaken ?? 'der Konkurrenz'} vorbeigezogen{newRank != null ? ` · #${newRank}` : ''}
            </span>
          </div>
        </div>
      </button>
      <div className="px-4 pb-3.5">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── LiveCard — flüchtige Live-Aktivität ohne eigenes Feed-Event ──────────────

interface LiveCardProps {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  entry: { addedReps: number; ts: string };
  onOpenProfile: () => void;
}

function LiveCard({ displayName, avatarUrl, entry, onOpenProfile }: LiveCardProps) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-green-500/25 bg-ink-900 transition-transform active:scale-[0.985]"
      style={{ animation: 'feedEnter 0.35s ease-out' }}
    >
      <button className="w-full text-left" onClick={onOpenProfile} aria-label={`Profil von ${displayName}`}>
        <div className="px-4 pt-3.5 pb-3.5">
          <CardHeader name={displayName} avatarUrl={avatarUrl} time={entry.ts} />
          <div className="mt-1.5 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
            </span>
            <span className="text-[15px] font-extrabold text-green-400">
              Trainiert gerade · +{entry.addedReps}
            </span>
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

function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        active ? 'bg-brand-500 text-white' : 'bg-ink-800 text-slate-400 hover:bg-ink-700'
      }`}
    >
      {label}
    </button>
  );
}

// ─── Card dispatch ────────────────────────────────────────────────────────────

function FeedCard(props: CardProps) {
  const [headline] = props.group.items;
  const m = headline.metadata as Record<string, unknown>;
  if (headline.event_type === 'rank_improved' && (m.improvement as number | undefined) === 1) {
    return <DuelCard {...props} />;
  }
  switch (props.group.cardType) {
    case 'hero':          return <HeroCard {...props} />;
    case 'record':         return <RecordCard {...props} />;
    case 'rank_movement':  return <RankMovementCard {...props} />;
    case 'comeback':       return <ComebackCard {...props} />;
    case 'streak':         return <StreakCard {...props} />;
    default:               return <StandardCard {...props} />;
  }
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
    refresh, loadMore, toggleReaction,
  } = useArenaFeed(filter);

  const groups = useMemo(() => groupEvents(events, newEventIds, liveActivity), [events, newEventIds, liveActivity]);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);

  // Users with live activity in the last 5 minutes that have no group in the current
  // list yet (e.g. their first rep of the day hasn't crossed a milestone threshold).
  const liveOnlyUsers = useMemo(() => {
    const groupedUserIds = new Set(groups.map(g => g.user_id));
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return Object.entries(liveActivity)
      .filter(([userId, entry]) => !groupedUserIds.has(userId) && new Date(entry.ts).getTime() > fiveMinAgo)
      .map(([userId, entry]) => {
        const ref = events.find(e => e.user_id === userId);
        return {
          userId,
          displayName: ref?.display_name || ref?.username || 'Unbekannt',
          avatarUrl: ref?.avatar_url ?? null,
          entry: { addedReps: entry.lastDelta, ts: entry.ts },
        };
      })
      .filter(l => l.entry.addedReps > 0);
  }, [liveActivity, groups, events]);

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
  const handleTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 60 && (listRef.current?.scrollTop ?? 0) <= 0 && !refreshing) void refresh();
  };

  const handleOpenProfile = (group: ArenaFeedGroup) => {
    const exerciseId = group.items.find(i => i.exercise_id)?.exercise_id ?? activeExercise?.id;
    if (!exerciseId) return;
    setInfoSheet({
      userId: group.user_id,
      displayName: group.display_name || group.username || 'Unbekannt',
      avatarUrl: group.avatar_url,
      exerciseId,
    });
  };

  const handleOpenLiveProfile = (userId: string, displayName: string, avatarUrl: string | null) => {
    const exerciseId = liveActivity[userId]?.exerciseId ?? activeExercise?.id;
    if (!exerciseId) return;
    setInfoSheet({ userId, displayName, avatarUrl, exerciseId });
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
          ) : groups.length === 0 && liveOnlyUsers.length === 0 ? (
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
              {liveOnlyUsers.map(l => (
                <LiveCard
                  key={`live-${l.userId}`}
                  userId={l.userId}
                  displayName={l.displayName}
                  avatarUrl={l.avatarUrl}
                  entry={l.entry}
                  onOpenProfile={() => handleOpenLiveProfile(l.userId, l.displayName, l.avatarUrl)}
                />
              ))}

              {groups.map(group => (
                <FeedCard
                  key={group.key}
                  group={group}
                  liveReps={
                    liveActivity[group.user_id]
                      ? { addedReps: liveActivity[group.user_id].lastDelta, ts: liveActivity[group.user_id].ts }
                      : undefined
                  }
                  onOpenProfile={handleOpenProfile}
                  onToggleReaction={toggleReaction}
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
