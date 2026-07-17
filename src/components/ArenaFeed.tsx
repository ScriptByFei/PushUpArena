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

function storyHeadline(ev: ArenaFeedEvent, shortName: string): string {
  const m = ev.metadata as Record<string, unknown>;
  const exName = ev.exercise_name ?? 'PushUps';

  switch (ev.event_type) {

    // ── Lead changes ──────────────────────────────────────────────────────────
    case 'place1_new': {
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

    // ── Medals ────────────────────────────────────────────────────────────────
    case 'medal_gold':   return `${shortName} holt Gold`;
    case 'medal_silver': return `${shortName} sichert sich Silber`;
    case 'medal_bronze': return `${shortName} gewinnt Bronze`;

    // ── Rank movement ─────────────────────────────────────────────────────────
    case 'rank_improved': {
      const nr = m.new_rank as number | undefined;
      const over = m.overtaken_name as string | undefined;
      if (over) {
        return pickPhrase([
          `${shortName} überholt ${over}`,
          `${shortName} zieht an ${over} vorbei`,
          `${shortName} schiebt sich vor ${over}`,
        ], ev.id);
      }
      return nr != null ? `${shortName} auf Platz ${nr}` : 'Rang verbessert';
    }

    // ── Top 3 ─────────────────────────────────────────────────────────────────
    case 'top3_first':
      return pickPhrase([
        `${shortName} kommt in die Top 3`,
        `${shortName} drängt sich in die Top 3`,
        `${shortName} schiebt sich in die Top 3`,
      ], ev.id);

    // ── Records ───────────────────────────────────────────────────────────────
    case 'daily_record':
    case 'personal_record':
      return pickPhrase([
        `${shortName} stellt einen neuen Rekord auf`,
        `Neuer Rekord für ${shortName}`,
        `${shortName} schreibt Geschichte`,
      ], ev.id);

    // ── Milestones ────────────────────────────────────────────────────────────
    case 'milestone_100':
      return pickPhrase([
        `${shortName} knackt die 100`,
        `${shortName} erreicht 100 ${exName}`,
        `Erstmals dreistellig — ${shortName}`,
      ], ev.id);
    case 'milestone_250':
      return pickPhrase([
        `${shortName} durchbricht die 250`,
        `${shortName} erreicht 250 ${exName}`,
        `250 — ${shortName} hält das Tempo`,
      ], ev.id);
    case 'milestone_500':
      return pickPhrase([
        `${shortName} knackt die 500-Marke`,
        `${shortName} erreicht 500 ${exName}`,
        `500 ${exName} — ${shortName} macht Druck`,
      ], ev.id);
    case 'milestone_1000':
      return pickPhrase([
        `${shortName} erreicht die Tausend`,
        `1.000 — ${shortName} in einer anderen Liga`,
        `${shortName} schafft 1.000 ${exName}`,
      ], ev.id);

    // ── Streaks ───────────────────────────────────────────────────────────────
    case 'streak_7':   return `${shortName} — 7 Tage am Stück`;
    case 'streak_30':  return `${shortName} — 30-Tage-Streak`;
    case 'streak_100': return `${shortName} — 100 Tage in Folge`;
    case 'streak_365': return `${shortName} — Ein ganzes Jahr aktiv`;

    // ── Comeback ──────────────────────────────────────────────────────────────
    case 'comeback': {
      const days = m.days_off as number | undefined;
      return days
        ? pickPhrase([
            `${shortName} zurück nach ${days} Tagen`,
            `${shortName} meldet sich zurück`,
            `${shortName} macht weiter`,
          ], ev.id)
        : `${shortName} ist zurück`;
    }

    // ── Total milestones ──────────────────────────────────────────────────────
    case 'total_500':
    case 'total_1000':
    case 'total_5000':
    case 'total_10000':
    case 'total_25000':
    case 'total_50000':
    case 'total_100000': {
      const total = m.total as number | undefined;
      return total != null
        ? `${shortName} — ${total.toLocaleString('de-DE')} ${exName} gesamt`
        : getChip(ev).label;
    }

    // ── Fallback ──────────────────────────────────────────────────────────────
    default:
      return getChip(ev).label;
  }
}

// ─── Snapshot rank status line ────────────────────────────────────────────────
// Generates a compact rank status badge from event metadata (snapshot at event
// time, never live). Returns null when rank is unknown so callers can skip it.

function rankStatusLine(ev: ArenaFeedEvent): string | null {
  const m = ev.metadata as Record<string, unknown>;
  const rank = (m.new_rank ?? m.rank) as number | undefined;
  if (rank == null) return null;

  // Optional enrichment fields (stored by DB edge function when available)
  const leadOver    = m.lead_over    as number | undefined; // reps ahead of #2
  const gapToFirst  = m.gap_to_first as number | undefined; // reps behind #1
  const compName    = ((m.lead_name ?? m.target_name ?? m.overtaken_name) as string | undefined)
                        ?.split(' ')[0];

  if (rank === 1) {
    if (leadOver != null && leadOver > 0 && compName) {
      return `🥇 Führt mit +${leadOver} vor ${compName}`;
    }
    if (leadOver != null && leadOver > 0) {
      return `🥇 Führt mit +${leadOver} Vorsprung`;
    }
    return ev.event_type === 'place1_new' ? '🥇 Platz 1 übernommen' : '🥇 Führt weiterhin';
  }

  if (rank === 2) {
    if (gapToFirst != null && gapToFirst > 0 && compName) {
      return `🥈 ${gapToFirst} hinter ${compName}`;
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

function HeroCard({ group, onOpenProfile, onToggleReaction }: CardProps) {
  const name = group.display_name || group.username || 'Unbekannt';
  const shortName = (group.display_name || group.username || 'Unbekannt').split(' ')[0];
  const [headline, ...secondary] = group.items;
  const { icon: hIcon } = getChip(headline);
  const m = headline.metadata as Record<string, unknown>;

  const bigNumber = (m.today_total ?? m.reps ?? m.total) as number | undefined;
  const isGold = headline.event_type === 'medal_gold' || headline.event_type === 'place1_new';

  // Snapshot-based status — never from live leaderboard
  const heroStatus = rankStatusLine(headline);

  return (
    <CardShell
      group={group}
      flashing={false}
      extraClass={`bg-gradient-to-br from-ink-900 via-ink-900 ${isGold ? 'to-amber-950/25' : 'to-brand-950/20'}`}
    >
      <button className="w-full text-left" onClick={() => onOpenProfile(group)} aria-label={`Profil von ${name}`}>
        <div className="px-3.5 pt-3 pb-2">
          <CardHeader name={name} avatarUrl={group.avatar_url} time={group.latest_at} size={30} />

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
                  <span className={`mt-0.5 block text-[11px] font-bold ${isGold ? 'text-amber-400' : 'text-brand-400'}`}>
                    {storyHeadline(headline, shortName)}
                  </span>
                </>
              ) : (
                <span className={`text-[16px] font-black leading-tight tracking-tight ${isGold ? 'text-amber-300' : 'text-brand-300'}`}>
                  {storyHeadline(headline, shortName)}
                </span>
              )}
              {heroStatus && (
                <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                  {heroStatus}
                </span>
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

  // Snapshot data from event metadata — never from live rankList.
  // repsLine: how many reps the user had at event time.
  // statusLine: their rank situation at that exact moment.
  const headlineMeta = headline.metadata as Record<string, unknown>;
  const exName = headline.exercise_name ?? 'PushUps';
  const repsAtEvent = (headlineMeta.today_total ?? headlineMeta.reps) as number | undefined;

  // Streak events show duration instead of reps as the primary number
  const streakDays = headlineMeta.days as number | undefined;

  const repsLine = repsAtEvent != null
    ? `${repsAtEvent.toLocaleString('de-DE')} ${exName}`
    : streakDays != null
      ? `${streakDays} Tage aktiv`
      : null;

  const statusLine = rankStatusLine(headline);

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
              {repsLine && (
                <span className="block text-[12px] font-semibold leading-snug text-slate-400">
                  {repsLine}
                </span>
              )}
              {statusLine && (
                <span className="block text-[11px] font-medium leading-snug text-slate-500">
                  {statusLine}
                </span>
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
