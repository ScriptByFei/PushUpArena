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

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SECONDARY = 3;

// Semantic suppression: if headline is the key, drop these secondary event types.
const SECONDARY_SUPPRESSION: Record<string, string[]> = {
  place1_new:   ['rank_improved', 'top3_first', 'top10_first'],
  medal_gold:   ['place1_new', 'rank_improved', 'top3_first'],
  medal_silver: ['rank_improved', 'top3_first'],
  medal_bronze: ['rank_improved'],
  daily_record: ['milestone_20', 'milestone_50', 'milestone_100', 'milestone_250', 'milestone_500', 'milestone_1000'],
  top3_first:   ['rank_improved', 'top10_first'],
  top10_first:  ['rank_improved'],
};

// ─── Story building ────────────────────────────────────────────────────────────
// One story per user × exercise (cross-day). Each person gets exactly ONE card
// in the feed showing their best current achievement.
// After grouping: actuality pass ensures only the current Platz-1 holder shows
// place1_new as hero — the second person in the same exercise gets their
// place1_new stripped (becomes whatever their next-best event is).

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
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
  const map = new Map<string, ArenaFeedGroup>();
  // Track ALL items per group BEFORE semantic dedup (needed for streak calculation).
  const rawItemsMap = new Map<string, ArenaFeedEvent[]>();
  const order: string[] = [];
  const seenIds = new Set<string>();

  for (const ev of events) {
    if (seenIds.has(ev.id)) continue;
    seenIds.add(ev.id);

    // Cross-day story key — ONE card per person per exercise
    const key = `${ev.user_id}::${ev.exercise_id ?? 'none'}`;
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
        secondaryOverflow: 0,
        isNew: false,
        cardType: 'standard',
      });
      rawItemsMap.set(key, []);
      order.push(key);
    }
    const g = map.get(key)!;
    g.items.push(ev);
    rawItemsMap.get(key)!.push(ev);
    if (newIds.has(ev.id)) g.isNew = true;
    if (ev.created_at > g.latest_at) {
      g.latest_at = ev.created_at;
      g.event_date = ev.event_date;
    }
  }

  for (const g of map.values()) {
    // Sort by DB priority DESC, then recency DESC
    g.items.sort((a, b) => {
      const pd = (b.priority ?? 0) - (a.priority ?? 0);
      if (pd !== 0) return pd;
      return b.created_at.localeCompare(a.created_at);
    });

    g.cardType = getGroupCardType(g.items);

    // Compute place1_new streak BEFORE semantic dedup
    const p1Events = rawItemsMap.get(g.key)!
      .filter(ev => ev.event_type === 'place1_new')
      .sort((a, b) => b.event_date.localeCompare(a.event_date));

    if (p1Events.length >= 2) {
      let streak = 1;
      for (let i = 1; i < p1Events.length; i++) {
        if (p1Events[i].event_date === addDays(p1Events[i - 1].event_date, -1)) streak++;
        else break;
      }
      if (streak > 1) {
        // Augment the most recent place1_new with streak_days (client-side only)
        const idx = g.items.findIndex(ev => ev.event_type === 'place1_new');
        if (idx >= 0) {
          const ev = g.items[idx];
          g.items[idx] = { ...ev, metadata: { ...ev.metadata, streak_days: streak } };
        }
      }
    }

    // Semantic dedup + suppression
    const [headline, ...rest] = g.items;
    if (!headline) continue;

    const suppressed = SECONDARY_SUPPRESSION[headline.event_type] ?? [];
    const seenTypes = new Set<string>([headline.event_type]);
    const deduped = rest.filter(ev => {
      if (suppressed.includes(ev.event_type)) return false;
      if (seenTypes.has(ev.event_type)) return false;
      seenTypes.add(ev.event_type);
      return true;
    });

    const secondary = deduped.slice(0, MAX_SECONDARY);
    g.secondaryOverflow = deduped.length - secondary.length;
    g.items = [headline, ...secondary];
  }

  // NOTE: No actuality pass needed. place1_new is now cardType:'standard' in the registry
  // (a historical "first reached #1 today" event). The CurrentLeaderCard component
  // in ArenaFeed is the sole source of current-leader truth, built from get_all_active_today.

  // ── Scenario annotation for place1_new ────────────────────────────────────────
  // Determine which place1_new per exercise happened first (= "first of day")
  // vs. later ones (= "takeover"). storyHeadline() uses __p1_scenario to vary text.
  {
    // Collect all place1_new events across all groups (use rawItemsMap = pre-dedup)
    const allP1 = [...rawItemsMap.values()]
      .flat()
      .filter(ev => ev.event_type === 'place1_new')
      .sort((a, b) => a.created_at.localeCompare(b.created_at)); // ascending → earliest first

    // First occurrence per exercise = "first of day"
    const exFirstLeader = new Map<string | null, string>(); // exercise_id → user_id
    for (const ev of allP1) {
      if (!exFirstLeader.has(ev.exercise_id)) exFirstLeader.set(ev.exercise_id, ev.user_id);
    }

    // Stamp each group's place1_new item with the resolved scenario
    for (const g of map.values()) {
      if (!g.items.some(ev => ev.event_type === 'place1_new')) continue;
      const scenario: 'first_of_day' | 'takeover' =
        exFirstLeader.get(g.items.find(ev => ev.event_type === 'place1_new')!.exercise_id) === g.user_id
          ? 'first_of_day'
          : 'takeover';
      g.items = g.items.map(ev =>
        ev.event_type === 'place1_new'
          ? { ...ev, metadata: { ...ev.metadata, __p1_scenario: scenario } }
          : ev,
      );
    }
  }

  // ── Sort: live → hero priority → recency
  const CARD_WEIGHT: Partial<Record<FeedCardType, number>> = {
    hero: 10, record: 8, rank_movement: 7, comeback: 6, streak: 5, duel: 5, standard: 1,
  };

  return order
    .filter(k => map.has(k))
    .map(k => map.get(k)!)
    .sort((a, b) => {
      const aLiveFresh = live[a.user_id]?.ts && live[a.user_id].ts > a.latest_at;
      const bLiveFresh = live[b.user_id]?.ts && live[b.user_id].ts > b.latest_at;
      if (aLiveFresh !== bLiveFresh) return aLiveFresh ? -1 : 1;
      const wa = CARD_WEIGHT[a.cardType] ?? 1;
      const wb = CARD_WEIGHT[b.cardType] ?? 1;
      if (wa !== wb) return wb - wa;
      return b.latest_at.localeCompare(a.latest_at);
    });
}

// ─── Narrative headlines ───────────────────────────────────────────────────────

function storyHeadline(ev: ArenaFeedEvent, shortName: string): string {
  const m = ev.metadata as Record<string, unknown>;
  switch (ev.event_type) {
    case 'place1_new': {
      // Historical event — describes the MOMENT of taking #1, not current state.
      // Text varies by scenario (first of day vs. overtake) using a deterministic
      // hash of the event id so the same event always shows the same phrase.
      const scenario = m.__p1_scenario as string | undefined;
      if (scenario === 'first_of_day') {
        return pickPhrase([
          `${shortName} legt als Erster vor`,
          `${shortName} eröffnet die Tageswertung`,
          `${shortName} setzt die erste Bestmarke`,
        ], ev.id);
      }
      return pickPhrase([
        `${shortName} geht in Führung`,
        `${shortName} übernimmt die Führung`,
        `${shortName} setzt sich an die Spitze`,
        `${shortName} erobert Platz 1`,
        `${shortName} zieht an allen vorbei`,
        `${shortName} ist neuer Spitzenreiter`,
        `${shortName} führt jetzt das Feld an`,
        `${shortName} steht jetzt ganz oben`,
      ], ev.id);
    }
    case 'medal_gold':
      return 'Goldmedaille';
    case 'medal_silver':
      return 'Silbermedaille';
    case 'medal_bronze':
      return 'Bronzemedaille';
    case 'rank_improved': {
      const nr = m.new_rank as number | undefined;
      const over = m.overtaken_name as string | undefined;
      if (over && nr) return `${over} überholt · Platz ${nr}`;
      if (nr) return `Jetzt Platz ${nr}`;
      return 'Rang verbessert';
    }
    case 'top3_first':
      return `${shortName} erreicht die Top 3`;
    case 'top10_first':
      return `${shortName} in den Top 10`;
    case 'daily_record': {
      const reps = m.reps as number | undefined;
      return reps
        ? `Rekord · ${reps.toLocaleString('de-DE')} ${ev.exercise_name ?? 'Wdh.'}`
        : `${shortName} bricht den Rekord`;
    }
    case 'personal_record': {
      const reps = m.reps as number | undefined;
      return reps ? `Rekord · ${reps.toLocaleString('de-DE')} ${ev.exercise_name ?? 'Wdh.'}` : 'Persönlicher Rekord';
    }
    case 'comeback': {
      const days = m.days_off as number | undefined;
      return days ? `${shortName} zurück nach ${days} Tagen` : `${shortName} ist zurück`;
    }
    case 'milestone_1000':
      return `1.000 ${ev.exercise_name ?? 'PushUps'} heute 🤯`;
    case 'milestone_500':
      return `500 ${ev.exercise_name ?? 'PushUps'} heute`;
    case 'milestone_250':
      return `250 ${ev.exercise_name ?? 'PushUps'} heute`;
    case 'milestone_100':
      return `100 ${ev.exercise_name ?? 'PushUps'} heute`;
    case 'streak_365':
      return '365-Tage-Streak 💎';
    case 'streak_100':
      return '100-Tage-Streak 🔱';
    case 'streak_30':
      return '30-Tage-Streak ⚡';
    case 'streak_7':
      return '7-Tage-Streak 🔥';
    default:
      return getChip(ev).label;
  }
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
      className={`overflow-hidden rounded-2xl border bg-ink-900 transition-transform active:scale-[0.985]
        ${group.cardType === 'hero' ? 'border-amber-400/25' : 'border-ink-700/50'}
        ${group.cardType === 'hero' ? 'shadow-[0_0_20px_-6px_rgba(251,191,36,0.3)]' : ''}
        ${extraClass ?? ''}`}
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

// ─── HeroCard ─────────────────────────────────────────────────────────────────
// Used for: medal_gold, medal_silver, medal_bronze, milestone_500/1000, streak_365.
// NOT used for place1_new — that is now a standard historical event.
// Current #1 state is shown via CurrentLeaderCard (built from live leaderboard).

function HeroCard({ group, rankList, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const shortName = (group.display_name || group.username || 'Unbekannt').split(' ')[0];
  const [headline, ...secondary] = group.items;
  const { icon: hIcon } = getChip(headline);
  const m = headline.metadata as Record<string, unknown>;

  const bigNumber = (m.today_total ?? m.reps ?? m.total) as number | undefined;
  const streakDays = m.streak_days as number | undefined;
  const rank = (m.rank ?? m.new_rank) as number | undefined;

  // Competitive context: lead over #2 from live leaderboard
  const myRankEntry = rankList.find(r => r.userId === group.user_id);
  const myReps = myRankEntry?.reps ?? (bigNumber as number | undefined);
  const myRank = myRankEntry?.rank ?? rank;
  const nextBelow = myRankEntry ? rankList[myRankEntry.rank] : undefined; // rank is 1-indexed, array is 0-indexed
  const leadReps = myReps != null && nextBelow ? myReps - nextBelow.reps : undefined;
  const leadName = nextBelow?.displayName.split(' ')[0];

  const displayTime = group.latest_at;

  const isGold = headline.event_type === 'medal_gold' || headline.event_type === 'place1_new';

  return (
    <CardShell
      group={group}
      flashing={false}
      extraClass={`bg-gradient-to-br from-ink-900 via-ink-900 ${isGold ? 'to-amber-950/25' : 'to-brand-950/20'}`}
    >
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-3.5 pt-3 pb-2">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={displayTime} size={30} />

          <div className="mt-2 flex items-end gap-2.5">
            <span className="text-[22px] leading-none">{hIcon}</span>
            <div className="min-w-0 flex-1">
              {bigNumber != null ? (
                <>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-[28px] font-black leading-none tabular-nums ${isGold ? 'text-amber-300' : 'text-brand-300'}`}>
                      {bigNumber.toLocaleString('de-DE')}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {headline.exercise_name ?? 'PushUps'}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={`text-[11px] font-bold ${isGold ? 'text-amber-400' : 'text-brand-400'}`}>
                      {storyHeadline(headline, shortName)}
                    </span>
                    {myRank != null && (
                      <span className="text-[10px] font-semibold text-slate-600">#{myRank}</span>
                    )}
                  </div>
                </>
              ) : (
                <span className={`text-[16px] font-black leading-tight tracking-tight ${isGold ? 'text-amber-300' : 'text-brand-300'}`}>
                  {storyHeadline(headline, shortName)}
                </span>
              )}

              {/* Competitive or streak context */}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0">
                {leadReps != null && leadName && leadReps > 0 && (
                  <span className="text-[10px] text-slate-600">
                    {leadReps} vor {leadName}
                  </span>
                )}
                {streakDays && streakDays > 1 && (
                  <span className="text-[10px] text-amber-500/70">
                    🔥 {streakDays} Tage in Folge
                  </span>
                )}
              </div>
            </div>
          </div>

          <SecondaryChips events={secondary} overflow={group.secondaryOverflow} />
        </div>
      </button>
      <div className="px-3.5 pb-2.5">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── StandardCard ──────────────────────────────────────────────────────────────

function StandardCard({ group, rankList, liveReps, onOpenProfile, onToggleReaction }: CardProps) {
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
  const shortName = (group.display_name || group.username || 'Unbekannt').split(' ')[0];
  const [headline, ...secondary] = group.items;
  const { icon: hIcon } = getChip(headline);
  const displayTime = liveReps?.ts && liveReps.ts > group.latest_at ? liveReps.ts : group.latest_at;

  // Context line: for place1_new, describe the event moment (never the live state).
  // For all other events, show current competitive proximity from the live leaderboard.
  const headlineMeta = headline.metadata as Record<string, unknown>;
  let contextLine: string | null = null;

  if (headline.event_type === 'place1_new') {
    // Show the rep count at the moment they took #1 — stays accurate even after they're overtaken.
    const repsAtEvent = (headlineMeta.today_total ?? headlineMeta.reps) as number | undefined;
    if (repsAtEvent != null) {
      contextLine = `Führte mit ${repsAtEvent.toLocaleString('de-DE')} ${headline.exercise_name ?? 'PushUps'}`;
    }
  } else {
    const myEntry = rankList.find(r => r.userId === group.user_id);
    if (myEntry) {
      const above = rankList[myEntry.rank - 2]; // rank is 1-indexed; rank-2 is the entry just above
      if (above && above.reps > myEntry.reps) {
        const gap = above.reps - myEntry.reps;
        contextLine = `Noch ${gap} bis Platz ${myEntry.rank - 1}`;
      } else if (myEntry.rank === 1) {
        const below = rankList[1];
        if (below) contextLine = `${myEntry.reps - below.reps} vor ${below.displayName.split(' ')[0]}`;
      }
    }
  }

  return (
    <CardShell group={group} flashing={flashing}>
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-3.5 pt-3 pb-2">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={displayTime} size={30} />

          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[20px] leading-none">{hIcon}</span>
            <div className="min-w-0">
              <span className="block truncate text-[14px] font-extrabold leading-snug tracking-tight text-slate-100">
                {storyHeadline(headline, shortName)}
              </span>
              {contextLine && (
                <span className="text-[11px] font-medium text-slate-600">{contextLine}</span>
              )}
            </div>
          </div>

          {liveReps && liveReps.addedReps > 0 && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold text-brand-400">
                +{liveReps.addedReps}
              </span>
              <span className="flex items-center gap-1 text-[9px] text-slate-600">
                <span className="inline-block h-1 w-1 rounded-full bg-green-400 animate-pulse" />
                gerade eben
              </span>
            </div>
          )}

          <SecondaryChips events={secondary} overflow={group.secondaryOverflow} />
        </div>
      </button>
      <div className="px-3.5 pb-2.5">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── RecordCard ────────────────────────────────────────────────────────────────

function RecordCard({ group, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const shortName = (group.display_name || group.username || 'Unbekannt').split(' ')[0];
  const [headline, ...secondary] = group.items;
  const { icon: hIcon } = getChip(headline);
  const m = headline.metadata as Record<string, unknown>;
  const reps = m.reps as number | undefined;
  const prevBest = m.prev_best as number | undefined;
  const delta = reps != null && prevBest != null ? reps - prevBest : undefined;

  return (
    <CardShell group={group} flashing={false}>
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-3.5 pt-3 pb-2">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={group.latest_at} size={30} />
          <div className="mt-1.5 flex items-end gap-2">
            <span className="text-[22px] leading-none">{hIcon}</span>
            {reps != null ? (
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[26px] font-black leading-none tabular-nums text-brand-400">
                    {reps.toLocaleString('de-DE')}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {headline.exercise_name ?? 'Wdh.'}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-brand-300">
                    {storyHeadline(headline, shortName)}
                  </span>
                  {prevBest != null && prevBest > 0 && (
                    <span className="text-[10px] text-slate-600">
                      vorher {prevBest}
                      {delta != null && delta > 0 && (
                        <span className="ml-1 font-bold text-green-400">+{delta}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-[14px] font-extrabold leading-snug text-slate-100">
                {storyHeadline(headline, shortName)}
              </span>
            )}
          </div>
          <SecondaryChips events={secondary} overflow={group.secondaryOverflow} />
        </div>
      </button>
      <div className="px-3.5 pb-2.5">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── RankMovementCard ─────────────────────────────────────────────────────────

function RankMovementCard({ group, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const [headline] = group.items;
  const m = headline.metadata as Record<string, unknown>;
  const oldRank = m.old_rank as number | undefined;
  const newRank = m.new_rank as number | undefined;
  const overtaken = m.overtaken_name as string | undefined;
  const improvement = m.improvement as number | undefined;

  return (
    <CardShell group={group} flashing={false}>
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-3.5 pt-3 pb-2">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={group.latest_at} size={30} />
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[20px] leading-none">📈</span>
            {oldRank != null && newRank != null ? (
              <span className="flex items-center gap-1.5 text-[15px] font-black tabular-nums">
                <span className="text-slate-500">#{oldRank}</span>
                <span className="text-brand-400">→</span>
                <span className="text-brand-300">#{newRank}</span>
              </span>
            ) : (
              <span className="text-[14px] font-extrabold text-slate-100">Rangverbesserung</span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            {improvement != null && `${improvement} ${improvement === 1 ? 'Platz' : 'Plätze'} gewonnen`}
            {improvement != null && overtaken && ' · '}
            {overtaken && `${overtaken} überholt`}
          </p>
        </div>
      </button>
      <div className="px-3.5 pb-2.5">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── ComebackCard ─────────────────────────────────────────────────────────────

function ComebackCard({ group, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const shortName = (group.display_name || group.username || 'Unbekannt').split(' ')[0];
  const [headline, ...secondary] = group.items;
  const daysOff = (headline.metadata as Record<string, unknown>).days_off as number | undefined;

  return (
    <CardShell group={group} flashing={false} extraClass="bg-gradient-to-br from-ink-900 to-orange-950/15">
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-3.5 pt-3 pb-2">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={group.latest_at} size={30} />
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[20px] leading-none">💥</span>
            <span className="text-[14px] font-extrabold text-orange-300">
              {daysOff != null
                ? `${shortName} zurück nach ${daysOff} Tagen`
                : `${shortName} ist zurück`}
            </span>
          </div>
          <SecondaryChips events={secondary} overflow={group.secondaryOverflow} />
        </div>
      </button>
      <div className="px-3.5 pb-2.5">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── StreakCard ────────────────────────────────────────────────────────────────

function StreakCard({ group, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const [headline, ...secondary] = group.items;
  const { icon: hIcon, label: hLabel } = getChip(headline);
  const days = (headline.metadata as Record<string, unknown>).days as number | undefined;

  return (
    <CardShell group={group} flashing={false}>
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-3.5 pt-3 pb-2">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={group.latest_at} size={30} />
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[22px] leading-none">{hIcon}</span>
            <div>
              <span className="block text-[14px] font-extrabold text-slate-100">{hLabel}</span>
              {days != null && (
                <span className="text-[11px] text-slate-600">{days} Tage in Folge</span>
              )}
            </div>
          </div>
          <SecondaryChips events={secondary} overflow={group.secondaryOverflow} />
        </div>
      </button>
      <div className="px-3.5 pb-2.5">
        <ReactionsBar eventId={headline.id} reactions={headline.reactions} onToggle={onToggleReaction} />
      </div>
    </CardShell>
  );
}

// ─── DuelCard — knapper Zweikampf (rank_improved mit improvement === 1) ────────

function DuelCard({ group, rankList, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const [headline] = group.items;
  const m = headline.metadata as Record<string, unknown>;
  const overtaken = m.overtaken_name as string | undefined;
  const newRank = m.new_rank as number | undefined;

  // Live reps comparison
  const myEntry = rankList.find(r => r.userId === group.user_id);
  const overtakenEntry = rankList.find(r => r.displayName === overtaken);
  const gap = myEntry && overtakenEntry ? myEntry.reps - overtakenEntry.reps : undefined;

  return (
    <CardShell group={group} flashing={false} extraClass="bg-gradient-to-br from-ink-900 to-brand-950/20">
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-3.5 pt-3 pb-2">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={group.latest_at} size={30} />
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[20px] leading-none">⚔️</span>
            <div className="min-w-0">
              <span className="block text-[14px] font-extrabold text-brand-300">
                {overtaken
                  ? `${overtaken} überholt${newRank != null ? ` · Platz ${newRank}` : ''}`
                  : 'Knapper Zweikampf'}
              </span>
              {gap != null && gap > 0 && (
                <span className="text-[11px] text-slate-500">
                  {gap} {gap === 1 ? 'Wiederholung' : 'Wiederholungen'} Vorsprung
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
      <div className="px-3.5 pb-2.5">
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
  const m = headline.metadata as Record<string, unknown>;
  if (headline.event_type === 'rank_improved' && (m.improvement as number | undefined) === 1) {
    return <DuelCard {...props} />;
  }
  switch (props.group.cardType) {
    case 'hero':         return <HeroCard {...props} />;
    case 'record':        return <RecordCard {...props} />;
    case 'rank_movement': return <RankMovementCard {...props} />;
    case 'comeback':      return <ComebackCard {...props} />;
    case 'streak':        return <StreakCard {...props} />;
    default:              return <StandardCard {...props} />;
  }
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
