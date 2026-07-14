/**
 * feedRegistry.ts — Central registry for all feed event types (V3).
 *
 * To add a new event type:
 *   1. Add an entry to FEED_EVENT_REGISTRY with icon, label function, accent, category, priority.
 *   2. Create the corresponding DB logic (trigger / edge function) that inserts the event.
 *
 * Categories:
 *   medal      – Podium placements (gold / silver only)
 *   community  – Live leaderboard events (place1, top3, top10, rank_improved)
 *   training   – Daily performance events (records, milestone reps)
 *   streak     – Consecutive-day milestones
 *   milestone  – Cumulative totals
 *   social     – Social interactions
 *   special    – Unique behaviour events (comeback, night owl, etc.)
 *
 * Priority (used to sort chips within a card, highest first):
 *   5 ★★★★★  Place 1, Gold, 1000-rep day, 100k total, 365d streak, first_1000_day
 *   4 ★★★★☆  Personal/Day record, Silver, Top-3-first, 500-rep day, 100d streak, 50k total, first_500_day
 *   3 ★★★☆☆  100-rep day, Top-10-first, rank_improved, New friend, 1k–25k total, 30d streak
 *   2 ★★☆☆☆  250-rep day, 7d streak, Comeback, Frühstarter, Night-owl
 *   1 ★☆☆☆☆  Everything else
 */

import type { FeedEvent } from '@/hooks/useFeed';

export type EventAccent =
  | 'gold'
  | 'silver'
  | 'brand'
  | 'orange'
  | 'green'
  | 'pink'
  | 'teal'
  | 'none';

export type EventCategory =
  | 'medal'
  | 'community'
  | 'training'
  | 'streak'
  | 'milestone'
  | 'social'
  | 'special';

export interface EventDefinition {
  icon: string;
  label: (ev: FeedEvent) => string;
  accent: EventAccent;
  category: EventCategory;
  /** 1–5 — higher = shown first within a grouped card */
  priority: number;
}

/** German thousand-separator formatting, e.g. 1247 → "1.247" */
function fmtDe(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!isFinite(n)) return '?';
  return Math.round(n).toLocaleString('de-DE');
}

/** Handles both old (reps) and new (today_total) metadata field names for daily rep events. */
function dailyReps(ev: FeedEvent, fallback: number): number {
  const m = ev.metadata as Record<string, unknown> | undefined;
  return (m?.today_total ?? m?.reps ?? fallback) as number;
}

export const FEED_EVENT_REGISTRY: Record<string, EventDefinition> = {
  // ── Medaillen ─────────────────────────────────────────────────────────────────
  medal_gold:   { icon: '🥇', label: ev => `Goldmedaille · ${ev.exercise_name ?? 'PushUp'}`,   accent: 'gold',   category: 'medal',     priority: 5 },
  medal_silver: { icon: '🥈', label: ev => `Silbermedaille · ${ev.exercise_name ?? 'PushUp'}`, accent: 'silver', category: 'medal',     priority: 4 },

  // ── Live Leaderboard ───────────────────────────────────────────────────────────
  place1_new: {
    icon: '👑',
    label: ev => `Platz 1 · ${ev.exercise_name ?? 'PushUp'}`,
    accent: 'gold',
    category: 'community',
    priority: 5,
  },
  top3_first: {
    icon: '🏅',
    label: ev => `Erstmals Top 3 · ${ev.exercise_name ?? 'PushUp'}`,
    accent: 'brand',
    category: 'community',
    priority: 4,
  },
  top10_first: {
    icon: '📊',
    label: ev => `Erstmals Top 10 · ${ev.exercise_name ?? 'PushUp'}`,
    accent: 'teal',
    category: 'community',
    priority: 3,
  },
  rank_improved: {
    icon: '📈',
    label: ev => {
      const m = ev.metadata as Record<string, unknown> | undefined;
      const oldR = m?.old_rank as number | undefined;
      const newR = m?.new_rank as number | undefined;
      const name = m?.overtaken_name as string | undefined;
      if (oldR != null && newR != null) {
        const core = `Platz ${oldR} → ${newR}`;
        return name ? `${name} überholt · ${core}` : core;
      }
      return 'Rangverbesserung';
    },
    accent: 'brand',
    category: 'community',
    priority: 3,
  },

  // ── Training: daily rep milestones ────────────────────────────────────────────
  milestone_100: {
    icon: '💯',
    label: ev => `${fmtDe(dailyReps(ev, 100))} ${ev.exercise_name ?? 'PushUps'} heute`,
    accent: 'brand',
    category: 'training',
    priority: 3,
  },
  milestone_250: {
    icon: '🔥',
    label: ev => `${fmtDe(dailyReps(ev, 250))} ${ev.exercise_name ?? 'PushUps'} heute`,
    accent: 'orange',
    category: 'training',
    priority: 2,
  },
  milestone_500: {
    icon: '🚀',
    label: ev => `${fmtDe(dailyReps(ev, 500))} ${ev.exercise_name ?? 'PushUps'} heute`,
    accent: 'orange',
    category: 'training',
    priority: 4,
  },
  milestone_1000: {
    icon: '🤯',
    label: ev => `${fmtDe(dailyReps(ev, 1000))} ${ev.exercise_name ?? 'PushUps'} heute`,
    accent: 'pink',
    category: 'training',
    priority: 5,
  },

  // ── Training: personal records ────────────────────────────────────────────────
  daily_record: {
    icon: '📈',
    label: ev => {
      const reps = (ev.metadata as Record<string, unknown> | undefined)?.reps as number | undefined;
      return reps != null
        ? `Neuer Rekord · ${fmtDe(reps)} ${ev.exercise_name ?? 'Wdh.'}`
        : 'Neuer persönlicher Rekord';
    },
    accent: 'brand',
    category: 'training',
    priority: 4,
  },
  personal_record: {
    icon: '🏆',
    label: ev => {
      const reps = (ev.metadata as Record<string, unknown> | undefined)?.reps as number | undefined;
      return reps != null
        ? `Neuer Rekord · ${fmtDe(reps)} ${ev.exercise_name ?? 'Wdh.'}`
        : 'Neuer persönlicher Rekord';
    },
    accent: 'brand',
    category: 'training',
    priority: 4,
  },

  // ── Lifetime day-rep milestones ────────────────────────────────────────────────
  first_500_day: {
    icon: '🎖',
    label: ev => {
      const reps = (ev.metadata as Record<string, unknown> | undefined)?.reps as number | undefined;
      return reps != null
        ? `Erster 500er-Tag · ${fmtDe(reps)} ${ev.exercise_name ?? 'Wdh.'}`
        : `Erster 500er-Tag · ${ev.exercise_name ?? 'PushUp'}`;
    },
    accent: 'orange',
    category: 'training',
    priority: 4,
  },
  first_1000_day: {
    icon: '🤯',
    label: ev => {
      const reps = (ev.metadata as Record<string, unknown> | undefined)?.reps as number | undefined;
      return reps != null
        ? `Erster 1000er-Tag · ${fmtDe(reps)} ${ev.exercise_name ?? 'Wdh.'}`
        : `Erster 1000er-Tag · ${ev.exercise_name ?? 'PushUp'}`;
    },
    accent: 'pink',
    category: 'training',
    priority: 5,
  },

  // ── Streaks ────────────────────────────────────────────────────────────────────
  streak_7:   { icon: '🔥', label: () => '7-Tage-Streak',   accent: 'orange', category: 'streak', priority: 2 },
  streak_30:  { icon: '⚡', label: () => '30-Tage-Streak',  accent: 'orange', category: 'streak', priority: 3 },
  streak_100: { icon: '🔱', label: () => '100-Tage-Streak', accent: 'pink',   category: 'streak', priority: 4 },
  streak_365: { icon: '💎', label: () => '365-Tage-Streak', accent: 'gold',   category: 'streak', priority: 5 },

  // ── Gesamtmeilensteine ─────────────────────────────────────────────────────────
  total_1000:   { icon: '🎯', label: ev => `${fmtDe((ev.metadata as Record<string, unknown>)?.total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'teal', category: 'milestone', priority: 3 },
  total_5000:   { icon: '🌟', label: ev => `${fmtDe((ev.metadata as Record<string, unknown>)?.total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'teal', category: 'milestone', priority: 3 },
  total_10000:  { icon: '💎', label: ev => `${fmtDe((ev.metadata as Record<string, unknown>)?.total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'pink', category: 'milestone', priority: 3 },
  total_25000:  { icon: '👑', label: ev => `${fmtDe((ev.metadata as Record<string, unknown>)?.total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'gold', category: 'milestone', priority: 3 },
  total_50000:  { icon: '🚀', label: ev => `${fmtDe((ev.metadata as Record<string, unknown>)?.total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'pink', category: 'milestone', priority: 4 },
  total_100000: { icon: '🌌', label: ev => `${fmtDe((ev.metadata as Record<string, unknown>)?.total)} ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'gold', category: 'milestone', priority: 5 },

  // ── Special events ─────────────────────────────────────────────────────────────
  comeback: {
    icon: '💥',
    label: ev => {
      const days = (ev.metadata as Record<string, unknown> | undefined)?.days_off as number | undefined;
      return days != null ? `Comeback nach ${days} Tagen` : 'Comeback';
    },
    accent: 'orange',
    category: 'special',
    priority: 2,
  },
  quick_starter: {
    icon: '🌅',
    label: ev => {
      const reps = (ev.metadata as Record<string, unknown> | undefined)?.reps as number | undefined;
      return reps != null
        ? `Frühstarter · ${fmtDe(reps)} Wdh. vor 8 Uhr`
        : 'Frühstarter · Training vor 8 Uhr';
    },
    accent: 'brand',
    category: 'special',
    priority: 2,
  },
  night_owl: {
    icon: '🌙',
    label: () => 'Nachteule · Training nach Mitternacht',
    accent: 'teal',
    category: 'special',
    priority: 2,
  },

  // ── Social ─────────────────────────────────────────────────────────────────────
  new_friend:           { icon: '👋', label: () => 'Neuer Freund',           accent: 'green',  category: 'social', priority: 3 },
  friendship_confirmed: { icon: '🤝', label: () => 'Freundschaft bestätigt', accent: 'green',  category: 'social', priority: 3 },
  friend_overtaken:     { icon: '⚔️', label: () => 'Freund überholt',        accent: 'orange', category: 'social', priority: 2 },
};

// ─── Accent → Tailwind class ──────────────────────────────────────────────────

export const ACCENT_CLASSES: Record<EventAccent, string> = {
  gold:   'border-l-[3px] border-amber-400/80',
  silver: 'border-l-[3px] border-slate-400/60',
  brand:  'border-l-[3px] border-brand-500/70',
  orange: 'border-l-[3px] border-orange-500/65',
  green:  'border-l-[3px] border-green-500/65',
  pink:   'border-l-[3px] border-pink-500/65',
  teal:   'border-l-[3px] border-teal-500/65',
  none:   'border-l-[3px] border-transparent',
};

const ACCENT_PRIORITY: Record<EventAccent, number> = {
  gold: 8, silver: 7, pink: 5, orange: 4, brand: 3, teal: 2, green: 1, none: 0,
};

/** Returns the Tailwind left-border class for the most important event in a group. */
export function groupAccentClass(events: { event_type: string }[]): string {
  let best: EventAccent = 'none';
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
export function getChip(ev: FeedEvent): { icon: string; label: string } {
  const def = FEED_EVENT_REGISTRY[ev.event_type];
  if (!def) return { icon: '⚡', label: ev.event_type };
  return { icon: def.icon, label: def.label(ev) };
}

/** Returns the priority for a feed event (higher = more important). */
export function getEventPriority(eventType: string): number {
  return FEED_EVENT_REGISTRY[eventType]?.priority ?? 1;
}
