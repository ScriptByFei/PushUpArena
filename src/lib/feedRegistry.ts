/**
 * feedRegistry.ts — Central registry for all Arena Feed V2 event types.
 *
 * To add a new event type:
 *   1. Add an entry to FEED_EVENT_REGISTRY with icon, label function, accent,
 *      category, cardType, priority, visibility, ttlHours.
 *   2. Create the corresponding DB logic (trigger / edge function) that inserts
 *      the event — priority/visibility/expires_at there must mirror this entry
 *      (see feed_event_priority / feed_event_visibility / feed_event_ttl in
 *      supabase/migrations/20260716_arena_feed_v2.sql).
 *
 * Priority (1–10, higher = shown first / surfaced more prominently):
 *   10  1000-rep day, first 1000er day, 365d streak, 100k total
 *    9  Gold, Platz 1
 *    8  500-rep day, first 500er day, 100d streak, 50k total
 *    7  Silver, Day record, Top-3-first
 *    6  30d streak, Comeback, 25k total, Bronze
 *    5  100-rep day, Top-10-first, rank improved, 10k total
 *    4  7d streak, 1k/5k total
 *    3  New friend, friendship confirmed, milestone_50, first_workout
 *    2  20-rep day, Frühstarter, Nachteule
 */

import type {
  ArenaFeedEvent,
  FeedAccent,
  FeedCardType,
  FeedCategory,
  FeedEventDefinition,
  FeedVisibility,
} from '@/types/feed';

export type EventAccent = FeedAccent;
export type EventCategory = FeedCategory;
export type EventDefinition = FeedEventDefinition;

/** German thousand-separator formatting, e.g. 1247 → "1.247" */
function fmtDe(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!isFinite(n)) return '?';
  return Math.round(n).toLocaleString('de-DE');
}

/** Handles both old (reps) and new (today_total) metadata field names for daily rep events. */
function dailyReps(ev: ArenaFeedEvent, fallback: number): number {
  const m = ev.metadata as Record<string, unknown> | undefined;
  return (m?.today_total ?? m?.reps ?? fallback) as number;
}

function meta(ev: ArenaFeedEvent): Record<string, unknown> {
  return (ev.metadata ?? {}) as Record<string, unknown>;
}

export const FEED_EVENT_REGISTRY: Record<string, FeedEventDefinition> = {
  // ── Medaillen ─────────────────────────────────────────────────────────────────
  medal_gold:   { icon: '🥇', label: ev => `Goldmedaille · ${ev.exercise_name ?? 'PushUp'}`,   accent: 'gold',   category: 'medal', cardType: 'hero',     priority: 9, visibility: 'global', ttlHours: 168 },
  medal_silver: { icon: '🥈', label: ev => `Silbermedaille · ${ev.exercise_name ?? 'PushUp'}`, accent: 'silver', category: 'medal', cardType: 'standard', priority: 7, visibility: 'global', ttlHours: 168 },
  medal_bronze: { icon: '🥉', label: ev => `Bronzemedaille · ${ev.exercise_name ?? 'PushUp'}`, accent: 'orange', category: 'medal', cardType: 'standard', priority: 6, visibility: 'global', ttlHours: 168 },

  // ── Live Leaderboard ───────────────────────────────────────────────────────────
  place1_new: {
    icon: '👑',
    // Past-tense label: this is a HISTORICAL event ("first reached #1 today"), not current state.
    // Current #1 state is derived from the live leaderboard, not from this event.
    label: ev => `Platz 1 übernommen · ${ev.exercise_name ?? 'PushUp'}`,
    accent: 'gold', category: 'community',
    // standard, not hero — current-state hero comes from leaderboard, not event snapshots
    cardType: 'standard',
    priority: 9, visibility: 'global', ttlHours: 24,
  },
  top3_first: {
    icon: '🏅',
    label: ev => `Erstmals Top 3 · ${ev.exercise_name ?? 'PushUp'}`,
    accent: 'brand', category: 'community', cardType: 'standard', priority: 7, visibility: 'global', ttlHours: 72,
  },
  top10_first: {
    icon: '📊',
    label: ev => `Erstmals Top 10 · ${ev.exercise_name ?? 'PushUp'}`,
    accent: 'teal', category: 'community', cardType: 'standard', priority: 5, visibility: 'global', ttlHours: 72,
  },
  rank_improved: {
    icon: '📈',
    label: ev => {
      const m = meta(ev);
      const oldR = m.old_rank as number | undefined;
      const newR = m.new_rank as number | undefined;
      const name = m.overtaken_name as string | undefined;
      if (oldR != null && newR != null) {
        const core = `Platz ${oldR} → ${newR}`;
        return name ? `${name} überholt · ${core}` : core;
      }
      return 'Rangverbesserung';
    },
    accent: 'brand', category: 'community', cardType: 'rank_movement', priority: 5, visibility: 'global', ttlHours: 24,
  },

  // ── Training: daily rep milestones ────────────────────────────────────────────
  milestone_20: {
    icon: '💪',
    label: ev => `${fmtDe(dailyReps(ev, 20))} ${ev.exercise_name ?? 'PushUps'} heute`,
    accent: 'none', category: 'training', cardType: 'standard', priority: 2, visibility: 'friends', ttlHours: 24,
  },
  milestone_50: {
    icon: '✊',
    label: ev => `${fmtDe(dailyReps(ev, 50))} ${ev.exercise_name ?? 'PushUps'} heute`,
    accent: 'none', category: 'training', cardType: 'standard', priority: 3, visibility: 'friends', ttlHours: 24,
  },
  milestone_100: {
    icon: '💯',
    label: ev => `${fmtDe(dailyReps(ev, 100))} ${ev.exercise_name ?? 'PushUps'} heute`,
    accent: 'brand', category: 'training', cardType: 'standard', priority: 5, visibility: 'global', ttlHours: 72,
  },
  milestone_250: {
    icon: '🔥',
    label: ev => `${fmtDe(dailyReps(ev, 250))} ${ev.exercise_name ?? 'PushUps'} heute`,
    accent: 'orange', category: 'training', cardType: 'standard', priority: 5, visibility: 'global', ttlHours: 72,
  },
  milestone_500: {
    icon: '🚀',
    label: ev => `${fmtDe(dailyReps(ev, 500))} ${ev.exercise_name ?? 'PushUps'} heute`,
    accent: 'orange', category: 'training', cardType: 'hero', priority: 8, visibility: 'global', ttlHours: 168,
  },
  milestone_1000: {
    icon: '🤯',
    label: ev => `${fmtDe(dailyReps(ev, 1000))} ${ev.exercise_name ?? 'PushUps'} heute`,
    accent: 'pink', category: 'training', cardType: 'hero', priority: 10, visibility: 'global', ttlHours: 336,
  },

  // ── Training: personal records ────────────────────────────────────────────────
  daily_record: {
    icon: '📈',
    label: ev => {
      const reps = meta(ev).reps as number | undefined;
      return reps != null
        ? `Neuer Rekord · ${fmtDe(reps)} ${ev.exercise_name ?? 'Wdh.'}`
        : 'Neuer persönlicher Rekord';
    },
    accent: 'brand', category: 'training', cardType: 'record', priority: 7, visibility: 'global', ttlHours: 72,
  },
  personal_record: {
    icon: '🏆',
    label: ev => {
      const reps = meta(ev).reps as number | undefined;
      return reps != null
        ? `Neuer Rekord · ${fmtDe(reps)} ${ev.exercise_name ?? 'Wdh.'}`
        : 'Neuer persönlicher Rekord';
    },
    accent: 'brand', category: 'training', cardType: 'record', priority: 7, visibility: 'global', ttlHours: 72,
  },

  // ── Lifetime day-rep milestones ────────────────────────────────────────────────
  first_500_day: {
    icon: '🎖',
    label: ev => {
      const reps = meta(ev).reps as number | undefined;
      return reps != null
        ? `Erster 500er-Tag · ${fmtDe(reps)} ${ev.exercise_name ?? 'Wdh.'}`
        : `Erster 500er-Tag · ${ev.exercise_name ?? 'PushUp'}`;
    },
    accent: 'orange', category: 'training', cardType: 'record', priority: 8, visibility: 'global', ttlHours: 168,
  },
  first_1000_day: {
    icon: '🤯',
    label: ev => {
      const reps = meta(ev).reps as number | undefined;
      return reps != null
        ? `Erster 1000er-Tag · ${fmtDe(reps)} ${ev.exercise_name ?? 'Wdh.'}`
        : `Erster 1000er-Tag · ${ev.exercise_name ?? 'PushUp'}`;
    },
    accent: 'pink', category: 'training', cardType: 'hero', priority: 10, visibility: 'global', ttlHours: 336,
  },
  first_workout: {
    icon: '🌱',
    label: ev => `Erstes Training · ${ev.exercise_name ?? 'PushUp'}`,
    accent: 'green', category: 'training', cardType: 'standard', priority: 3, visibility: 'friends', ttlHours: 24,
  },

  // ── Streaks ────────────────────────────────────────────────────────────────────
  streak_7:      { icon: '🔥', label: () => '7-Tage-Streak',   accent: 'orange', category: 'streak', cardType: 'streak', priority: 4,  visibility: 'global', ttlHours: 24 },
  streak_30:     { icon: '⚡', label: () => '30-Tage-Streak',  accent: 'orange', category: 'streak', cardType: 'streak', priority: 6,  visibility: 'global', ttlHours: 168 },
  streak_100:    { icon: '🔱', label: () => '100-Tage-Streak', accent: 'pink',   category: 'streak', cardType: 'streak', priority: 8,  visibility: 'global', ttlHours: 168 },
  streak_365:    { icon: '💎', label: () => '365-Tage-Streak', accent: 'gold',   category: 'streak', cardType: 'hero',   priority: 10, visibility: 'global', ttlHours: 336 },
  streak_broken: { icon: '💔', label: () => 'Streak beendet',  accent: 'none',   category: 'streak', cardType: 'standard', priority: 1, visibility: 'private', ttlHours: 48 },

  // ── Gesamtmeilensteine ─────────────────────────────────────────────────────────
  total_500:    { icon: '🎯', label: ev => `${fmtDe(meta(ev).total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'teal', category: 'milestone', cardType: 'standard', priority: 4,  visibility: 'global', ttlHours: 72 },
  total_1000:   { icon: '🎯', label: ev => `${fmtDe(meta(ev).total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'teal', category: 'milestone', cardType: 'standard', priority: 4,  visibility: 'global', ttlHours: 72 },
  total_5000:   { icon: '🌟', label: ev => `${fmtDe(meta(ev).total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'teal', category: 'milestone', cardType: 'standard', priority: 4,  visibility: 'global', ttlHours: 72 },
  total_10000:  { icon: '💎', label: ev => `${fmtDe(meta(ev).total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'pink', category: 'milestone', cardType: 'standard', priority: 5,  visibility: 'global', ttlHours: 72 },
  total_25000:  { icon: '👑', label: ev => `${fmtDe(meta(ev).total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'gold', category: 'milestone', cardType: 'standard', priority: 6,  visibility: 'global', ttlHours: 168 },
  total_50000:  { icon: '🚀', label: ev => `${fmtDe(meta(ev).total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'pink', category: 'milestone', cardType: 'hero',     priority: 8,  visibility: 'global', ttlHours: 168 },
  total_100000: { icon: '🌌', label: ev => `${fmtDe(meta(ev).total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'gold', category: 'milestone', cardType: 'hero',     priority: 10, visibility: 'global', ttlHours: 336 },

  // ── Special events ─────────────────────────────────────────────────────────────
  comeback: {
    icon: '💥',
    label: ev => {
      const days = meta(ev).days_off as number | undefined;
      return days != null ? `Comeback nach ${days} Tagen` : 'Comeback';
    },
    accent: 'orange', category: 'special', cardType: 'comeback', priority: 6, visibility: 'global', ttlHours: 24,
  },
  quick_starter: {
    icon: '🌅',
    label: ev => {
      const reps = meta(ev).reps as number | undefined;
      return reps != null
        ? `Frühstarter · ${fmtDe(reps)} Wdh. vor 8 Uhr`
        : 'Frühstarter · Training vor 8 Uhr';
    },
    accent: 'brand', category: 'special', cardType: 'standard', priority: 2, visibility: 'global', ttlHours: 24,
  },
  night_owl: {
    icon: '🌙',
    label: () => 'Nachteule · Training nach Mitternacht',
    accent: 'teal', category: 'special', cardType: 'standard', priority: 2, visibility: 'global', ttlHours: 24,
  },

  // ── Social ─────────────────────────────────────────────────────────────────────
  new_friend:           { icon: '👋', label: () => 'Neuer Freund',           accent: 'green',  category: 'social', cardType: 'standard', priority: 3, visibility: 'friends', ttlHours: 24 },
  friendship_confirmed: { icon: '🤝', label: () => 'Freundschaft bestätigt', accent: 'green',  category: 'social', cardType: 'standard', priority: 3, visibility: 'friends', ttlHours: 24 },
  friend_overtaken:     { icon: '⚔️', label: () => 'Freund überholt',        accent: 'orange', category: 'social', cardType: 'standard', priority: 2, visibility: 'friends', ttlHours: 24 },
};

// ─── Accent → Tailwind class ──────────────────────────────────────────────────

export const ACCENT_CLASSES: Record<FeedAccent, string> = {
  gold:   'border-l-[3px] border-amber-400/80',
  silver: 'border-l-[3px] border-slate-400/60',
  brand:  'border-l-[3px] border-brand-500/70',
  orange: 'border-l-[3px] border-orange-500/65',
  green:  'border-l-[3px] border-green-500/65',
  pink:   'border-l-[3px] border-pink-500/65',
  teal:   'border-l-[3px] border-teal-500/65',
  none:   'border-l-[3px] border-transparent',
};

const ACCENT_PRIORITY: Record<FeedAccent, number> = {
  gold: 8, silver: 7, pink: 5, orange: 4, brand: 3, teal: 2, green: 1, none: 0,
};

/** Returns the Tailwind left-border class for the most important event in a group. */
export function groupAccentClass(events: { event_type: string }[]): string {
  let best: FeedAccent = 'none';
  let bestPriority = -1;
  for (const ev of events) {
    const def = FEED_EVENT_REGISTRY[ev.event_type];
    if (def) {
      const p = ACCENT_PRIORITY[def.accent] ?? 0;
      if (p > bestPriority) { best = def.accent; bestPriority = p; }
    }
  }
  return ACCENT_CLASSES[best];
}

/** Returns the icon + label for a single feed event. */
export function getChip(ev: ArenaFeedEvent): { icon: string; label: string } {
  const def = FEED_EVENT_REGISTRY[ev.event_type];
  if (!def) return { icon: '⚡', label: ev.event_type };
  return { icon: def.icon, label: def.label(ev) };
}

/** Returns the priority for a feed event (higher = more important). */
export function getEventPriority(eventType: string): number {
  return FEED_EVENT_REGISTRY[eventType]?.priority ?? 1;
}

/** Returns the card type used to render the highest-priority event in a group. */
export function getGroupCardType(events: { event_type: string }[]): FeedCardType {
  let best: FeedCardType = 'standard';
  let bestPriority = -1;
  for (const ev of events) {
    const def = FEED_EVENT_REGISTRY[ev.event_type];
    if (def && def.priority > bestPriority) {
      best = def.cardType;
      bestPriority = def.priority;
    }
  }
  return best;
}
