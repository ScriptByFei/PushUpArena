import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useArenaFeed, type FeedFilter, type LiveActivityMap } from '@/hooks/useArenaFeed';
import { getChip, getEventPriority, getGroupCardType } from '@/lib/feedRegistry';
import { UserInfoSheet } from '@/components/UserInfoSheet';
import { useExercise } from '@/context/ExerciseContext';
import { Avatar } from '@/components/ui/Avatar';
import type { ArenaFeedEvent, ArenaFeedGroup, FeedCardType } from '@/types/feed';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RankEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  reps: number;
  rank: number;
}

// ─── Story building ────────────────────────────────────────────────────────────

/** Numeric threshold for milestone_N event types (e.g. 'milestone_100' → 100). */
function milestoneValue(eventType: string): number {
  return parseInt(eventType.replace('milestone_', ''), 10) || 0;
}

/**
 * Variety pass: prevent more than 2 consecutive cards of the same event_type.
 * Preserves priority ordering as much as possible.
 */
function interleaveVariety(stories: ArenaFeedGroup[]): ArenaFeedGroup[] {
  if (stories.length <= 3) return stories;
  const result: ArenaFeedGroup[] = [];
  const pool = [...stories];
  while (pool.length > 0) {
    const prevType = result.at(-1)?.items[0]?.event_type;
    const prev2Type = result.at(-2)?.items[0]?.event_type;
    if (prevType && prevType === prev2Type) {
      const idx = pool.findIndex(s => s.items[0]?.event_type !== prevType);
      if (idx > 0) { result.push(pool.splice(idx, 1)[0]); continue; }
    }
    result.push(pool.shift()!);
  }
  return result;
}

// Deterministic phrase picker — same event id always yields the same phrase.
// Avoids flicker on re-renders while still producing variation across events.
function pickPhrase(phrases: readonly string[], seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h * 31) + seed.charCodeAt(i)) >>> 0;
  }
  return phrases[h % phrases.length];
}

function buildStories(
  events: ArenaFeedEvent[],
  newIds: Set<string>,
  live: LiveActivityMap,
): ArenaFeedGroup[] {
  // 1. Global ID dedup
  const seenIds = new Set<string>();
  const unique = events.filter(ev => !seenIds.has(ev.id) && !!seenIds.add(ev.id));

  // 2. Milestone dedup: only the highest milestone per user×exercise earns a card
  const milestonePeak = new Map<string, ArenaFeedEvent>();
  for (const ev of unique) {
    if (!ev.event_type.startsWith('milestone_')) continue;
    const k = `${ev.user_id}::${ev.exercise_id ?? ''}`;
    const cur = milestonePeak.get(k);
    if (!cur || milestoneValue(ev.event_type) > milestoneValue(cur.event_type)) {
      milestonePeak.set(k, ev);
    }
  }
  const keepMilestones = new Set([...milestonePeak.values()].map(e => e.id));

  // 3. rank_improved dedup: only the best rank achieved per user×exercise
  const overtakePeak = new Map<string, ArenaFeedEvent>();
  for (const ev of unique) {
    if (ev.event_type !== 'rank_improved') continue;
    const k = `${ev.user_id}::${ev.exercise_id ?? ''}`;
    const cur = overtakePeak.get(k);
    const newRank = (ev.metadata as Record<string, unknown>).new_rank as number | undefined;
    const curRank = cur ? (cur.metadata as Record<string, unknown>).new_rank as number | undefined : 99;
    if (newRank != null && (curRank == null || newRank < curRank)) overtakePeak.set(k, ev);
  }
  const keepOvertakes = new Set([...overtakePeak.values()].map(e => e.id));

  // 4. Low-value event types that don't merit a standalone card
  const SKIP = new Set([
    'top10_first', 'milestone_20', 'milestone_50', 'streak_broken',
    'quick_starter', 'night_owl', 'new_friend', 'friendship_confirmed', 'friend_overtaken',
  ]);

  // 5. One card per significant event
  const stories: ArenaFeedGroup[] = [];
  for (const ev of unique) {
    if (SKIP.has(ev.event_type)) continue;
    if (ev.event_type.startsWith('milestone_') && !keepMilestones.has(ev.id)) continue;
    if (ev.event_type === 'rank_improved' && !keepOvertakes.has(ev.id)) continue;
    stories.push({
      key: ev.id,
      user_id: ev.user_id,
      display_name: ev.display_name,
      username: ev.username,
      avatar_url: ev.avatar_url,
      event_date: ev.event_date,
      latest_at: ev.created_at,
      items: [ev],
      secondaryOverflow: 0,
      isNew: newIds.has(ev.id),
      cardType: getGroupCardType([ev]),
    });
  }

  // 6. place1_new scenario annotation: first of day vs. takeover
  {
    const allP1 = unique
      .filter(ev => ev.event_type === 'place1_new')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const exFirstLeader = new Map<string | null, string>();
    for (const ev of allP1) {
      if (!exFirstLeader.has(ev.exercise_id)) exFirstLeader.set(ev.exercise_id, ev.user_id);
    }
    for (const s of stories) {
      const ev = s.items[0];
      if (ev.event_type !== 'place1_new') continue;
      const scenario: 'first_of_day' | 'takeover' =
        exFirstLeader.get(ev.exercise_id) === s.user_id ? 'first_of_day' : 'takeover';
      s.items = [{ ...ev, metadata: { ...ev.metadata, __p1_scenario: scenario } }];
    }
  }

  // 7. Sort: live activity → card weight → recency
  const CARD_WEIGHT: Partial<Record<FeedCardType, number>> = {
    hero: 10, record: 8, rank_movement: 7, comeback: 6, streak: 5, duel: 5, standard: 1,
  };
  stories.sort((a, b) => {
    const aLive = live[a.user_id]?.ts && live[a.user_id].ts > a.latest_at;
    const bLive = live[b.user_id]?.ts && live[b.user_id].ts > b.latest_at;
    if (aLive !== bLive) return aLive ? -1 : 1;
    const wa = CARD_WEIGHT[a.cardType] ?? 1;
    const wb = CARD_WEIGHT[b.cardType] ?? 1;
    if (wa !== wb) return wb - wa;
    return b.latest_at.localeCompare(a.latest_at);
  });

  // 8. Variety pass: no more than 2 consecutive cards of the same event_type
  return interleaveVariety(stories);
}

// ─── Narrative headlines ───────────────────────────────────────────────────────
// Short, name-free action labels. The card header already shows who did it.
// The badge shows the category. These labels answer only "what happened".

function storyHeadline(ev: ArenaFeedEvent): string {
  const m = ev.metadata as Record<string, unknown>;
  switch (ev.event_type) {
    case 'place1_new': {
      const scenario = m.__p1_scenario as string | undefined;
      return scenario === 'first_of_day' ? 'Erste Bestmarke' : 'Führung übernommen';
    }
    case 'medal_gold':   return 'Gold gewonnen';
    case 'medal_silver': return 'Silber gewonnen';
    case 'medal_bronze': return 'Bronze gewonnen';
    case 'rank_improved': {
      const over = (m.overtaken_name as string | undefined)?.split(' ')[0];
      return over ? `${over} überholt` : 'Platz verbessert';
    }
    case 'top3_first':       return 'Top 3 erreicht';
    case 'daily_record':     return 'Tagesrekord';
    case 'personal_record':  return 'Persönlicher Rekord';
    case 'milestone_100':
    case 'milestone_250':
    case 'milestone_500':
    case 'milestone_1000':   return 'Meilenstein'; // big number is the hero; label is secondary
    case 'streak_7':
    case 'streak_30':
    case 'streak_100':
    case 'streak_365':       return 'Aktiv-Serie';  // big day count is the hero
    case 'comeback': {
      const days = m.days_off as number | undefined;
      return days ? `Zurück nach ${days} Tagen` : 'Comeback';
    }
    case 'total_500':
    case 'total_1000':
    case 'total_5000':
    case 'total_10000':
    case 'total_25000':
    case 'total_50000':
    case 'total_100000':     return 'Gesamtleistung';
    default:                 return getChip(ev).label;
  }
}

// ─── Snapshot rank status line ────────────────────────────────────────────────
// Generates a compact rank status badge from event metadata (snapshot at event
// time, never live). Returns null when rank is unknown so callers can skip it.

function rankStatusLine(ev: ArenaFeedEvent): string | null {
  const m = ev.metadata as Record<string, unknown>;
  const rank = (m.new_rank ?? m.rank) as number | undefined;
  if (rank == null) return null;

  // leadOver: reps ahead of the person directly below us (valid for rank=1)
  const leadOver   = m.lead_over   as number | undefined;
  // gapToFirst: reps behind rank-1 (valid for rank=2+)
  const gapToFirst = m.gap_to_first as number | undefined;
  // Name of person we overtook (now below us — useful when rank=1 as the #2 person's name)
  const overtakenShort = (m.overtaken_name as string | undefined)?.split(' ')[0];
  // Name of person ahead of us (explicitly stored, optional)
  const leaderShort = ((m.lead_name ?? m.target_name) as string | undefined)?.split(' ')[0];

  if (rank === 1) {
    if (leadOver != null && leadOver > 0 && overtakenShort) {
      return `🥇 +${leadOver} vor ${overtakenShort}`;
    }
    if (leadOver != null && leadOver > 0) {
      return `🥇 Führt mit +${leadOver}`;
    }
    return ev.event_type === 'place1_new' ? '🥇 Platz 1 übernommen' : '🥇 Führt weiterhin';
  }

  if (rank === 2) {
    if (gapToFirst != null && gapToFirst > 0 && leaderShort) {
      return `🥈 ${gapToFirst} hinter ${leaderShort}`;
    }
    if (gapToFirst != null && gapToFirst > 0) {
      return `🥈 ${gapToFirst} hinter Platz 1`;
    }
    return ev.event_type === 'rank_improved' ? '🥈 Jetzt Platz 2' : '🥈 Platz 2';
  }

  if (rank === 3) {
    if (gapToFirst != null && gapToFirst > 0) {
      return `🥉 ${gapToFirst} hinter Platz 1`;
    }
    return ev.event_type === 'rank_improved' ? '🥉 Jetzt Platz 3' : '🥉 Platz 3';
  }

  // Rank 4+
  if (gapToFirst != null && gapToFirst > 0) {
    return `⬆️ ${gapToFirst} hinter Platz 1`;
  }
  return ev.event_type === 'rank_improved'
    ? `⬆️ Auf Platz ${rank} verbessert`
    : `⬆️ Platz ${rank}`;
}

// ─── Event style map ──────────────────────────────────────────────────────────
// Each event type gets a badge label, badge classes, accent text class,
// and a left-border hex colour. Colours are intentionally subtle.

interface EventStyleDef {
  badge: string;
  badgeClasses: string;
  accentTextClass: string;
  borderColor: string; // hex/rgba for inline style
}

function getEventStyle(eventType: string): EventStyleDef {
  if (eventType === 'place1_new') return {
    badge: 'FÜHRUNG', badgeClasses: 'bg-amber-500/15 text-amber-400',
    accentTextClass: 'text-amber-300', borderColor: '#d97706',
  };
  if (eventType === 'medal_gold') return {
    badge: 'GOLD', badgeClasses: 'bg-amber-500/15 text-amber-400',
    accentTextClass: 'text-amber-300', borderColor: '#d97706',
  };
  if (eventType === 'medal_silver') return {
    badge: 'SILBER', badgeClasses: 'bg-slate-400/15 text-slate-300',
    accentTextClass: 'text-slate-200', borderColor: '#94a3b8',
  };
  if (eventType === 'medal_bronze') return {
    badge: 'BRONZE', badgeClasses: 'bg-orange-400/15 text-orange-300',
    accentTextClass: 'text-orange-200', borderColor: '#c2410c',
  };
  if (eventType === 'rank_improved') return {
    badge: 'ÜBERHOLMANÖVER', badgeClasses: 'bg-violet-500/15 text-violet-400',
    accentTextClass: 'text-violet-300', borderColor: '#7c3aed',
  };
  if (eventType === 'top3_first') return {
    badge: 'TOP 3', badgeClasses: 'bg-purple-500/15 text-purple-400',
    accentTextClass: 'text-purple-300', borderColor: '#9333ea',
  };
  if (eventType === 'daily_record' || eventType === 'personal_record') return {
    badge: 'REKORD', badgeClasses: 'bg-green-500/15 text-green-400',
    accentTextClass: 'text-green-300', borderColor: '#16a34a',
  };
  if (eventType.startsWith('milestone_')) return {
    badge: 'MEILENSTEIN', badgeClasses: 'bg-blue-500/15 text-blue-400',
    accentTextClass: 'text-blue-300', borderColor: '#2563eb',
  };
  if (eventType.startsWith('streak_')) return {
    badge: 'STREAK', badgeClasses: 'bg-orange-500/15 text-orange-400',
    accentTextClass: 'text-orange-300', borderColor: '#ea580c',
  };
  if (eventType === 'comeback') return {
    badge: 'COMEBACK', badgeClasses: 'bg-pink-500/15 text-pink-400',
    accentTextClass: 'text-pink-300', borderColor: '#db2777',
  };
  if (eventType.startsWith('total_')) return {
    badge: 'GESAMT', badgeClasses: 'bg-teal-500/15 text-teal-400',
    accentTextClass: 'text-teal-300', borderColor: '#0d9488',
  };
  return {
    badge: 'NEWS', badgeClasses: 'bg-slate-500/15 text-slate-400',
    accentTextClass: 'text-slate-300', borderColor: '#475569',
  };
}

// ─── Compact time ─────────────────────────────────────────────────────────────

function compactTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'gerade eben';
  const m = Math.floor(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.floor(h / 24)} Tg.`;
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
  const hasAny = REACTION_EMOJIS.some(e => (reactions[e]?.count ?? 0) > 0);
  return (
    <div className="mt-2 flex items-center gap-1" onClick={e => e.stopPropagation()}>
      {REACTION_EMOJIS.map(emoji => {
        const r = reactions[emoji];
        const count = r?.count ?? 0;
        const reacted = r?.reacted ?? false;
        const visible = count > 0 || !hasAny; // always show if none have counts
        if (!visible) return null;
        return (
          <button
            key={emoji}
            onClick={() => onToggle(eventId, emoji)}
            aria-label={`${emoji} Reaktion`}
            aria-pressed={reacted}
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold transition
              ${reacted
                ? 'bg-brand-500/25 text-brand-300 ring-1 ring-brand-500/50'
                : count > 0
                  ? 'bg-ink-800 text-slate-400 hover:bg-ink-700'
                  : 'bg-ink-800/60 text-slate-600 hover:bg-ink-700 hover:text-slate-400'
              }`}
          >
            <span className="text-[12px] leading-none">{emoji}</span>
            {count > 0 && (
              <span className="ml-0.5 tabular-nums leading-none">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Secondary chips ──────────────────────────────────────────────────────────

function SecondaryChips({ events, overflow }: { events: ArenaFeedEvent[]; overflow: number }) {
  if (events.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {events.map(ev => {
        const { icon, label } = getChip(ev);
        return (
          <span
            key={ev.id}
            className="flex max-w-full items-center gap-0.5 rounded-full bg-ink-800/70 px-2 py-0.5 text-[10px] font-medium text-slate-500"
          >
            <span className="leading-none">{icon}</span>
            <span className="truncate leading-none">{label}</span>
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
          +{overflow}
        </span>
      )}
    </div>
  );
}

// ─── Shared card shell ────────────────────────────────────────────────────────

function CardShell({
  group,
  flashing,
  leftAccent,
  extraClass,
  children,
}: {
  group: ArenaFeedGroup;
  flashing: boolean;
  leftAccent?: string; // hex colour for the 3 px left accent border
  extraClass?: string;
  children: React.ReactNode;
}) {
  const animStyle: React.CSSProperties = group.isNew
    ? { animation: 'feedEnter 0.35s ease-out' }
    : flashing
      ? { animation: 'liveFlash 0.9s ease-out' }
      : {};
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-ink-700/50 bg-ink-900 transition-transform active:scale-[0.985] ${extraClass ?? ''}`}
      style={{
        ...animStyle,
        ...(leftAccent ? { borderLeftColor: leftAccent, borderLeftWidth: '3px' } : {}),
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({
  name,
  avatarUrl,
  time,
  size = 32,
}: {
  name: string;
  avatarUrl: string | null;
  time: string;
  size?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <Avatar url={avatarUrl} name={name} size={size} />
        <span className="truncate text-[12px] font-semibold leading-none text-slate-400">{name}</span>
      </div>
      <span className="shrink-0 text-[10px] font-medium leading-none text-slate-600 tabular-nums">
        {compactTime(time)}
      </span>
    </div>
  );
}

// ─── Card props ───────────────────────────────────────────────────────────────

interface CardProps {
  group: ArenaFeedGroup;
  rankList: RankEntry[];
  liveReps?: { addedReps: number; ts: string };
  onOpenProfile: (group: ArenaFeedGroup) => void;
  onToggleReaction: (eventId: string, emoji: string) => void;
}

// ─── PremiumFeedCard ─────────────────────────────────────────────────────────
// Single unified card component for all feed event types.
// Layout: left accent bar → header → badge → big primary → secondary → status.
// Number-centric events (milestones, streaks): big number is the hero.
// Action-centric events (lead, overtake, record, medals): action phrase is hero.

function PremiumFeedCard({ group, liveReps, onOpenProfile, onToggleReaction }: CardProps) {
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
  const [headline] = group.items;
  const m = headline.metadata as Record<string, unknown>;
  const exName = headline.exercise_name ?? 'PushUps';
  const displayTime = liveReps?.ts && liveReps.ts > group.latest_at ? liveReps.ts : group.latest_at;

  const style = getEventStyle(headline.event_type);
  const action = storyHeadline(headline);
  const status = rankStatusLine(headline);

  // Number-centric layout: big number is the hero (milestone_*, streak_*, total_*)
  const isNumberCentric = headline.event_type.startsWith('milestone_') || headline.event_type.startsWith('total_');
  const isStreakCentric  = headline.event_type.startsWith('streak_');

  const repsAtEvent = (m.today_total ?? m.reps) as number | undefined;
  const totalCount  = m.total as number | undefined;
  const streakDays  = m.days as number | undefined;
  const prevBest    = m.prev_best as number | undefined;

  const bigNumber = isNumberCentric
    ? (headline.event_type.startsWith('total_') ? totalCount : repsAtEvent)
    : isStreakCentric ? streakDays
    : undefined;
  const bigUnit = isNumberCentric ? exName : 'Tage';

  // For records: show improvement delta if available
  const recordReps = (m.reps ?? m.today_total) as number | undefined;
  const isRecord = headline.event_type === 'daily_record' || headline.event_type === 'personal_record';
  const delta = isRecord && recordReps != null && prevBest != null ? recordReps - prevBest : undefined;

  return (
    <CardShell group={group} flashing={flashing} leftAccent={style.borderColor}>
      <button
        className="w-full text-left"
        onClick={() => onOpenProfile(group)}
        aria-label={`Profil von ${name}`}
      >
        <div className="px-4 pt-4 pb-3">
          {/* ── Header ── */}
          <CardHeader name={name} avatarUrl={group.avatar_url} time={displayTime} size={28} />

          {/* ── Event badge ── */}
          <div className="mt-3">
            <span className={`inline-block rounded-full px-2 py-[3px] text-[9px] font-bold uppercase tracking-widest ${style.badgeClasses}`}>
              {style.badge}
            </span>
          </div>

          {/* ── Primary content ── */}
          <div className="mt-2.5">
            {bigNumber != null ? (
              /* Number hero */
              <div className="flex items-baseline gap-1.5">
                <span className={`text-[30px] font-black leading-none tabular-nums ${style.accentTextClass}`}>
                  {bigNumber.toLocaleString('de-DE')}
                </span>
                <span className="text-[14px] font-semibold text-slate-400">{bigUnit}</span>
              </div>
            ) : (
              /* Action hero */
              <span className={`block text-[17px] font-extrabold leading-snug tracking-tight ${style.accentTextClass}`}>
                {action}
              </span>
            )}
          </div>

          {/* ── Secondary content ── */}
          {bigNumber != null ? null : repsAtEvent != null ? (
            <p className="mt-1.5 text-[13px] font-semibold text-slate-400">
              {repsAtEvent.toLocaleString('de-DE')}{' '}
              <span className="text-[12px] font-medium text-slate-500">{exName}</span>
              {delta != null && delta > 0 && (
                <span className="ml-2 text-[11px] font-bold text-green-400">+{delta}</span>
              )}
              {!isRecord && prevBest != null && prevBest > 0 && (
                <span className="ml-2 text-[11px] text-slate-600">vorher {prevBest}</span>
              )}
            </p>
          ) : null}

          {/* ── Rank status (snapshot) ── */}
          {status && (
            <p className="mt-2 text-[11px] font-medium text-slate-500">{status}</p>
          )}

          {/* ── Live activity badge ── */}
          {liveReps && liveReps.addedReps > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold text-brand-400">
                +{liveReps.addedReps}
              </span>
              <span className="flex items-center gap-1 text-[9px] text-slate-600">
                <span className="inline-block h-1 w-1 rounded-full bg-green-400 animate-pulse" />
                gerade eben
              </span>
            </div>
          )}
        </div>
      </button>
      <div className="px-4 pb-3">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── LiveCard ──────────────────────────────────────────────────────────────────

interface LiveCardProps {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  entry: { addedReps: number; ts: string };
  rankList: RankEntry[];
  onOpenProfile: () => void;
}

function LiveCard({ displayName, avatarUrl, entry, rankList, userId, onOpenProfile }: LiveCardProps) {
  const myEntry = rankList.find(r => r.userId === userId);
  return (
    <div
      className="overflow-hidden rounded-2xl border border-green-500/25 bg-ink-900 transition-transform active:scale-[0.985]"
      style={{ animation: 'feedEnter 0.35s ease-out' }}
    >
      <button className="w-full text-left" onClick={onOpenProfile} aria-label={`Profil von ${displayName}`}>
        <div className="px-3.5 pt-3 pb-2.5">
          <CardHeader name={displayName} avatarUrl={avatarUrl} time={entry.ts} size={30} />
          <div className="mt-1.5 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
            </span>
            <span className="text-[14px] font-extrabold text-green-400">
              Trainiert gerade
              {myEntry && ` · ${myEntry.reps.toLocaleString('de-DE')} PushUps`}
              {entry.addedReps > 0 && ` (+${entry.addedReps})`}
            </span>
          </div>
          {myEntry && (
            <p className="mt-0.5 text-[10px] text-slate-600">Platz {myEntry.rank} · live</p>
          )}
        </div>
      </button>
    </div>
  );
}

// ─── CurrentLeaderCard ────────────────────────────────────────────────────────
// Built EXCLUSIVELY from the live leaderboard (get_all_active_today).
// Never uses a feed_event as its source of truth.
// Shown at the top of every feed render — always correct, never stale.

interface CurrentLeaderCardProps {
  leader: RankEntry;
  secondPlace: RankEntry | undefined;
  isLive: boolean;
  exerciseName: string;
  onOpenProfile: () => void;
}

function CurrentLeaderCard({
  leader,
  secondPlace,
  isLive,
  exerciseName,
  onOpenProfile,
}: CurrentLeaderCardProps) {
  const shortName = leader.displayName.split(' ')[0];
  const lead = secondPlace ? leader.reps - secondPlace.reps : null;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-br from-ink-900 via-ink-900 to-amber-950/30 shadow-[0_0_20px_-6px_rgba(251,191,36,0.3)] transition-transform active:scale-[0.985]"
    >
      <button
        className="w-full text-left"
        onClick={onOpenProfile}
        aria-label={`Profil von ${leader.displayName}`}
      >
        <div className="px-3.5 pt-3 pb-3">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-1.5">
              <Avatar url={leader.avatarUrl} name={leader.displayName} size={30} />
              <span className="truncate text-[12px] font-semibold leading-none text-slate-400">
                {leader.displayName}
              </span>
              {isLive && (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
                </span>
              )}
            </div>
            <span className="shrink-0 text-[10px] font-semibold leading-none text-amber-500/80">
              Platz 1 • live
            </span>
          </div>

          {/* Big number */}
          <div className="mt-2 flex items-end gap-2.5">
            <span className="text-[22px] leading-none">👑</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1">
                <span className="text-[28px] font-black leading-none tabular-nums text-amber-300">
                  {leader.reps.toLocaleString('de-DE')}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">{exerciseName} heute</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0">
                <span className="text-[11px] font-bold text-amber-400">{shortName} führt</span>
                {lead != null && lead > 0 && secondPlace && (
                  <span className="text-[10px] text-slate-600">
                    {lead.toLocaleString('de-DE')} vor {secondPlace.displayName.split(' ')[0]}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-ink-700/60 bg-ink-900 px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 h-[30px] w-[30px] shrink-0 rounded-full bg-ink-700" />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-baseline justify-between">
            <div className="h-2.5 w-1/4 rounded-full bg-ink-700" />
            <div className="h-2 w-8 rounded-full bg-ink-700" />
          </div>
          <div className="mt-2 h-4 w-3/5 rounded-full bg-ink-700" />
          <div className="mt-1.5 h-2.5 w-2/5 rounded-full bg-ink-700/60" />
        </div>
      </div>
    </div>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

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
  if (!headline) return null;
  return <PremiumFeedCard {...props} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  const [rankList, setRankList] = useState<RankEntry[]>([]);

  const {
    events, loading, refreshing, hasMore, newEventIds, liveActivity,
    refresh, loadMore, toggleReaction,
  } = useArenaFeed(filter);

  // Fetch live leaderboard for competitive context (lead-over-#2, rank proximity)
  const rankFetched = useRef(false);
  useEffect(() => {
    if (rankFetched.current) return;
    const exId = activeExercise?.id ?? events.find(e => e.exercise_id)?.exercise_id;
    if (!exId) return;
    rankFetched.current = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_all_active_today', { p_exercise: exId }).then(({ data }: any) => {
      if (!data) return;
      const sorted: RankEntry[] = [...data]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => b.today_amount - a.today_amount)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any, i: number) => ({
          userId: r.user_id,
          displayName: r.display_name || r.username || 'Unbekannt',
          avatarUrl: (r.avatar_url ?? null) as string | null,
          reps: r.today_amount as number,
          rank: i + 1,
        }));
      setRankList(sorted);
    });
  }, [activeExercise?.id, events]);

  // Re-fetch ranking on pull-to-refresh
  const handleRefresh = async () => {
    rankFetched.current = false;
    await refresh();
  };

  const stories = useMemo(
    () => buildStories(events, newEventIds, liveActivity),
    [events, newEventIds, liveActivity],
  );

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);

  // Users with live activity who have no story in the current feed
  const liveOnlyUsers = useMemo(() => {
    const storyUserIds = new Set(stories.map(g => g.user_id));
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return Object.entries(liveActivity)
      .filter(([userId, entry]) => !storyUserIds.has(userId) && new Date(entry.ts).getTime() > fiveMinAgo)
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
  }, [liveActivity, stories, events]);

  // Infinite scroll
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

  const handleTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 60 && (listRef.current?.scrollTop ?? 0) <= 0 && !refreshing) void handleRefresh();
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
          from { opacity: 0; transform: translateY(-6px); }
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
                <h2 className="text-lg font-extrabold text-slate-100">Arena</h2>
                <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                  Live
                </span>
              </div>
              <p className="text-[11px] text-slate-600">Wer führt gerade?</p>
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

          <div className="mt-2.5 flex gap-2">
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

        {/* Feed */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-3 py-2.5"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {loading && stories.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : stories.length === 0 && liveOnlyUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-800 text-3xl">🏋️</div>
              <p className="text-sm font-bold text-slate-300">Noch nichts los.</p>
              <p className="max-w-[200px] text-xs text-slate-600">
                {filter === 'friends'
                  ? 'Deine Freunde waren heute noch nicht aktiv.'
                  : 'Sei der Erste, der heute trainiert!'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* ── Current leader — built from live leaderboard, never from feed events ── */}
              {rankList.length > 0 && rankList[0].reps > 0 && (
                <CurrentLeaderCard
                  leader={rankList[0]}
                  secondPlace={rankList[1]}
                  isLive={!!liveActivity[rankList[0].userId]}
                  exerciseName={
                    events.find(e => e.exercise_id)?.exercise_name ?? 'PushUps'
                  }
                  onOpenProfile={() => {
                    const exerciseId =
                      activeExercise?.id ??
                      events.find(e => e.exercise_id)?.exercise_id;
                    if (!exerciseId) return;
                    setInfoSheet({
                      userId: rankList[0].userId,
                      displayName: rankList[0].displayName,
                      avatarUrl: rankList[0].avatarUrl,
                      exerciseId,
                    });
                  }}
                />
              )}

              {liveOnlyUsers.map(l => (
                <LiveCard
                  key={`live-${l.userId}`}
                  userId={l.userId}
                  displayName={l.displayName}
                  avatarUrl={l.avatarUrl}
                  entry={l.entry}
                  rankList={rankList}
                  onOpenProfile={() => handleOpenLiveProfile(l.userId, l.displayName, l.avatarUrl)}
                />
              ))}

              {stories.map(group => (
                <FeedCard
                  key={group.key}
                  group={group}
                  rankList={rankList}
                  liveReps={
                    liveActivity[group.user_id]
                      ? { addedReps: liveActivity[group.user_id].lastDelta, ts: liveActivity[group.user_id].ts }
                      : undefined
                  }
                  onOpenProfile={handleOpenProfile}
                  onToggleReaction={toggleReaction}
                />
              ))}

              <div ref={sentinelRef} className="h-1" />

              {!hasMore && stories.length > 0 && (
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
