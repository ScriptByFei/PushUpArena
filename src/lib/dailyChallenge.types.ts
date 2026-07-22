// Domain-Typen und Mapper für die Daily Challenge.
// Raw-Formen kommen aus database.types.ts (snake_case, Daten als strings).
// Die hier definierten Typen werden in Hooks und UI-Komponenten verwendet.

import type { Database } from './database.types';

// ── Raw-Typen (direkt aus den RPC-Signaturen) ──────────────────────────────
type StatusRaw    = Database['public']['Functions']['get_daily_challenge_status']['Returns'];
type LbRowRaw     = Database['public']['Functions']['get_daily_challenge_leaderboard']['Returns'][number];
type SetRowRaw    = Database['public']['Functions']['get_my_challenge_sets']['Returns'][number];
type HistoryRaw   = Database['public']['Functions']['get_challenge_history']['Returns'][number];

// ── Fehlercodes ────────────────────────────────────────────────────────────
export type DailyChallengeError =
  | 'CHALLENGE_NOT_ACTIVE'
  | 'NOT_JOINED'
  | 'ALREADY_JOINED'
  | 'INVALID_REPETITIONS'
  | 'COOLDOWN_ACTIVE'
  | 'UNAUTHENTICATED'
  | 'INVALID_EXERCISE'
  | 'DUPLICATE_REQUEST'
  | 'UNKNOWN';

export const DC_ERROR_MESSAGES: Record<string, string> = {
  CHALLENGE_NOT_ACTIVE: 'Die Daily Challenge ist gerade nicht aktiv.',
  NOT_JOINED:           'Bitte nimm zuerst an der Challenge teil.',
  ALREADY_JOINED:       'Du nimmst bereits an der Challenge teil.',
  INVALID_REPETITIONS:  'Ein Satz muss 10–100 Wiederholungen enthalten.',
  COOLDOWN_ACTIVE:      'Bitte warte noch kurz vor dem nächsten Satz.',
  UNAUTHENTICATED:      'Bitte melde dich erneut an.',
  INVALID_EXERCISE:     'Ungültige Übung.',
  DUPLICATE_REQUEST:    'Dieser Satz wurde bereits verarbeitet.',
  UNKNOWN:              'Aktion fehlgeschlagen. Bitte versuche es erneut.',
};

// ── Domain-Typen (camelCase, Dates als Date-Objekte) ──────────────────────
export interface DailyChallengeStatus {
  isActive: boolean;
  challengeDate: string;    // 'YYYY-MM-DD' (Berliner Datum)
  startsAt: Date;
  endsAt: Date;
  serverNow: Date;
  hasJoined: boolean;
  secondsUntilStart: number;
  secondsUntilEnd: number;
}

export interface DailyChallengeLeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  totalRepetitions: number;
  setCount: number;
  maxSet: number | null;
  minSet: number | null;
  averageSet: number | null;  // aus string (numeric) geparst
  firstSetAt: Date | null;
  lastSetAt: Date | null;
  joinedAt: Date;
  rank: number;
  isMe: boolean;
}

export interface DailyChallengeSet {
  id: string;
  repetitions: number;
  createdAt: Date;
}

export interface DailyChallengeHistoryDay {
  challengeDate: string;    // 'YYYY-MM-DD'
  rank: number;
  participantCount: number;
  displayName: string;
  avatarUrl: string | null;
  totalRepetitions: number;
  setCount: number;
  maxSet: number | null;
  minSet: number | null;
  avgSet: number | null;    // aus string (numeric) geparst
  firstSetAt: Date | null;
  lastSetAt: Date | null;
}

// ── Mapper ─────────────────────────────────────────────────────────────────

export function mapStatus(raw: StatusRaw): DailyChallengeStatus {
  return {
    isActive:           raw.is_active,
    challengeDate:      raw.challenge_date,
    startsAt:           new Date(raw.starts_at),
    endsAt:             new Date(raw.ends_at),
    serverNow:          new Date(raw.server_now),
    hasJoined:          raw.has_joined,
    secondsUntilStart:  raw.seconds_until_start,
    secondsUntilEnd:    raw.seconds_until_end,
  };
}

export function mapLeaderboardEntry(raw: LbRowRaw): DailyChallengeLeaderboardEntry {
  return {
    userId:           raw.user_id,
    displayName:      raw.display_name,
    avatarUrl:        raw.avatar_url,
    totalRepetitions: raw.total_repetitions,
    setCount:         raw.set_count,
    maxSet:           raw.max_set,
    minSet:           raw.min_set,
    averageSet:       raw.average_set != null ? parseFloat(raw.average_set) : null,
    firstSetAt:       raw.first_set_at  ? new Date(raw.first_set_at)  : null,
    lastSetAt:        raw.last_set_at   ? new Date(raw.last_set_at)   : null,
    joinedAt:         new Date(raw.joined_at),
    rank:             Number(raw.rank),
    isMe:             raw.is_me,
  };
}

export function mapSet(raw: SetRowRaw): DailyChallengeSet {
  return {
    id:          raw.id,
    repetitions: raw.repetitions,
    createdAt:   new Date(raw.created_at),
  };
}

export function mapHistoryDay(raw: HistoryRaw): DailyChallengeHistoryDay {
  return {
    challengeDate:    raw.challenge_date,
    rank:             Number(raw.rank),
    participantCount: Number(raw.participant_count),
    displayName:      raw.display_name,
    avatarUrl:        raw.avatar_url,
    totalRepetitions: raw.total_repetitions,
    setCount:         raw.set_count,
    maxSet:           raw.max_set,
    minSet:           raw.min_set,
    avgSet:           raw.avg_set != null ? parseFloat(raw.avg_set) : null,
    firstSetAt:       raw.first_set_at ? new Date(raw.first_set_at) : null,
    lastSetAt:        raw.last_set_at  ? new Date(raw.last_set_at)  : null,
  };
}
