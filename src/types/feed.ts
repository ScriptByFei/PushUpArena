/**
 * Arena Feed V2 — zentrale Typdefinitionen.
 */

export type FeedCardType =
  | 'standard'
  | 'hero'
  | 'record'
  | 'rank_movement'
  | 'comeback'
  | 'streak'
  | 'live'
  | 'duel';

export type FeedCategory =
  | 'medal'
  | 'community'
  | 'training'
  | 'streak'
  | 'milestone'
  | 'social'
  | 'special';

export type FeedVisibility = 'global' | 'friends' | 'private';

export type FeedAccent =
  | 'gold'
  | 'silver'
  | 'brand'
  | 'orange'
  | 'green'
  | 'pink'
  | 'teal'
  | 'none';

export interface FeedEventDefinition {
  icon: string;
  label: (ev: ArenaFeedEvent) => string;
  accent: FeedAccent;
  category: FeedCategory;
  cardType: FeedCardType;
  /** 1–10 — higher = shown first / surfaced more prominently */
  priority: number;
  visibility: FeedVisibility;
  /** Time-to-live in hours, mirrors the DB default (informational only on the client). */
  ttlHours: number;
}

export interface ArenaFeedReactions {
  [emoji: string]: { count: number; reacted: boolean };
}

export interface ArenaFeedEvent {
  id: string;
  user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  event_type: string;
  exercise_id: string | null;
  exercise_name: string | null;
  exercise_unit: string | null;
  metadata: Record<string, unknown>;
  priority: number;
  visibility: FeedVisibility;
  target_user_id: string | null;
  target_name: string | null;
  group_key: string;
  event_date: string;
  created_at: string;
  expires_at: string | null;
  reactions: ArenaFeedReactions;
}

export interface ArenaFeedGroup {
  key: string;
  user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  event_date: string;
  latest_at: string;
  items: ArenaFeedEvent[];
  isNew: boolean;
  cardType: FeedCardType;
}
