/**
 * feedRegistry.ts — Central registry for all feed event types.
 *
 * To add a new event type:
 *   1. Add an entry to FEED_EVENT_REGISTRY with icon, label function, accent, category.
 *   2. Create the corresponding DB logic (trigger / edge function) that inserts the event.
 *
 * Categories:
 *   medal      – Podium placements (gold / silver / bronze)
 *   community  – Competition rankings (top 3 / top 10 / place 1)
 *   training   – Daily performance events (daily record, milestone reps)
 *   streak     – Consecutive-day milestones
 *   milestone  – Cumulative totals
 *   social     – Social interactions (new friend)
 *
 * Accents (left-border colours on GroupCard):
 *   gold, silver, bronze, brand, orange, green, pink, teal, none
 */

import type { FeedEvent } from '@/hooks/useFeed';

export type EventAccent =
  | 'gold'
  | 'silver'
  | 'bronze'
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
  | 'social';

export interface EventDefinition {
  icon: string;
  label: (ev: FeedEvent) => string;
  accent: EventAccent;
  category: EventCategory;
}

export const FEED_EVENT_REGISTRY: Record<string, EventDefinition> = {
  // ── Medaillen ──────────────────────────────────────────────────────────────
  medal_gold:   { icon: '🥇', label: ev => `Gold · ${ev.exercise_name ?? 'PushUp'}`,   accent: 'gold',   category: 'medal' },
  medal_silver: { icon: '🥈', label: ev => `Silber · ${ev.exercise_name ?? 'PushUp'}`, accent: 'silver', category: 'medal' },
  medal_bronze: { icon: '🥉', label: ev => `Bronze · ${ev.exercise_name ?? 'PushUp'}`, accent: 'bronze', category: 'medal' },

  // ── Platzierungen ──────────────────────────────────────────────────────────
  place1: { icon: '👑', label: ev => `Platz 1 · ${ev.exercise_name ?? 'PushUp'}`, accent: 'gold',  category: 'community' },
  top3:   { icon: '🏅', label: ev => `Top 3 · ${ev.exercise_name ?? 'PushUp'}`,   accent: 'brand', category: 'community' },
  top10:  { icon: '📊', label: ev => `Top 10 · ${ev.exercise_name ?? 'PushUp'}`,  accent: 'teal',  category: 'community' },

  // ── Training ───────────────────────────────────────────────────────────────
  daily_record: {
    icon: '📈',
    label: ev => {
      const reps = ev.metadata?.reps as number | undefined;
      return reps != null ? `Tagesrekord · ${reps} Wdh.` : `Neuer Tagesrekord`;
    },
    accent: 'brand',
    category: 'training',
  },
  personal_record: {
    icon: '🏆',
    label: ev => {
      const reps = ev.metadata?.reps as number | undefined;
      return reps != null ? `Persönlicher Rekord · ${reps} Wdh.` : 'Neuer Rekord';
    },
    accent: 'brand',
    category: 'training',
  },
  milestone_100:  { icon: '💯', label: ev => `100 ${ev.exercise_name ?? 'PushUps'} heute`,  accent: 'brand',  category: 'training' },
  milestone_250:  { icon: '🔥', label: ev => `250 ${ev.exercise_name ?? 'PushUps'} heute`,  accent: 'orange', category: 'training' },
  milestone_500:  { icon: '🚀', label: ev => `500 ${ev.exercise_name ?? 'PushUps'} heute`,  accent: 'orange', category: 'training' },
  milestone_1000: { icon: '🤯', label: ev => `1.000 ${ev.exercise_name ?? 'PushUps'} heute`, accent: 'pink',   category: 'training' },
  daily_goal:     { icon: '✅', label: ev => `Tagesziel · ${ev.exercise_name ?? 'PushUp'}`,  accent: 'green',  category: 'training' },
  weekly_goal:    { icon: '🎯', label: ev => `Wochenziel · ${ev.exercise_name ?? 'PushUp'}`, accent: 'green',  category: 'training' },

  // ── Streaks ────────────────────────────────────────────────────────────────
  streak_7:   { icon: '🔥', label: () => '7-Tage-Streak',   accent: 'orange', category: 'streak' },
  streak_14:  { icon: '🔥', label: () => '14-Tage-Streak',  accent: 'orange', category: 'streak' },
  streak_30:  { icon: '⚡', label: () => '30-Tage-Streak',  accent: 'orange', category: 'streak' },
  streak_50:  { icon: '⚡', label: () => '50-Tage-Streak',  accent: 'pink',   category: 'streak' },
  streak_100: { icon: '🔱', label: () => '100-Tage-Streak', accent: 'pink',   category: 'streak' },
  streak_365: { icon: '💎', label: () => '365-Tage-Streak', accent: 'gold',   category: 'streak' },

  // ── Gesamtmeilensteine ─────────────────────────────────────────────────────
  total_1000:  { icon: '🎯', label: ev => `1.000 ${ev.exercise_name ?? 'PushUps'} gesamt`,   accent: 'teal', category: 'milestone' },
  total_5000:  { icon: '🌟', label: ev => `5.000 ${ev.exercise_name ?? 'PushUps'} gesamt`,   accent: 'teal', category: 'milestone' },
  total_10000: { icon: '💎', label: ev => `10.000 ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'pink', category: 'milestone' },
  total_25000: { icon: '👑', label: ev => `25.000 ${ev.exercise_name ?? 'PushUps'} gesamt`,  accent: 'gold', category: 'milestone' },

  // ── Social ─────────────────────────────────────────────────────────────────
  new_friend: { icon: '👋', label: () => 'Neuer Freund', accent: 'green', category: 'social' },

  // ── Achievements ───────────────────────────────────────────────────────────
  achievement: { icon: '🏅', label: () => 'Erfolg freigeschaltet', accent: 'teal', category: 'milestone' },
};

// ─── Accent → Tailwind class ──────────────────────────────────────────────────

export const ACCENT_CLASSES: Record<EventAccent, string> = {
  gold:   'border-l-[3px] border-amber-400/80',
  silver: 'border-l-[3px] border-slate-400/60',
  bronze: 'border-l-[3px] border-orange-600/60',
  brand:  'border-l-[3px] border-brand-500/70',
  orange: 'border-l-[3px] border-orange-500/65',
  green:  'border-l-[3px] border-green-500/65',
  pink:   'border-l-[3px] border-pink-500/65',
  teal:   'border-l-[3px] border-teal-500/65',
  none:   'border-l-[3px] border-transparent',
};

// Priority used to pick the "best" accent when a group contains multiple event types.
const ACCENT_PRIORITY: Record<EventAccent, number> = {
  gold: 8, silver: 7, bronze: 6, pink: 5, orange: 4, brand: 3, teal: 2, green: 1, none: 0,
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
  if (!def) return { icon: '⚡', label: 'Aktiv' };
  return { icon: def.icon, label: def.label(ev) };
}
