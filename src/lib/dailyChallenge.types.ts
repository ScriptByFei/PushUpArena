// Domain-Typen und Mapper für Daily Live.
// Raw-Formen kommen aus database.types.ts (snake_case, Daten als strings).
// Die hier definierten Typen werden in Hooks und UI-Komponenten verwendet.

import type { Database } from './database.types';

// ── Raw-Typen (direkt aus den RPC-Signaturen) ──────────────────────────────
type StatusRaw        = Database['public']['Functions']['get_daily_challenge_status']['Returns'];
type LbRowRaw         = Database['public']['Functions']['get_daily_challenge_leaderboard']['Returns'][number];
type SetRowRaw        = Database['public']['Functions']['get_my_challenge_sets']['Returns'][number];
type ParticipantSetRowRaw = Database['public']['Functions']['get_daily_challenge_participant_sets_today']['Returns'][number];
type HistoryRowRaw    = Database['public']['Functions']['get_challenge_history']['Returns'][number];
type DayDetailsRaw    = Database['public']['Functions']['get_daily_challenge_day_details']['Returns'];
type DayLbRowRaw      = NonNullable<DayDetailsRaw['leaderboard']>[number];

// ── Fehlercodes ────────────────────────────────────────────────────────────
export type DailyChallengeError =
  | 'CHALLENGE_NOT_ACTIVE'
  | 'INVALID_REPETITIONS'
  | 'COOLDOWN_ACTIVE'
  | 'UNAUTHENTICATED'
  | 'INVALID_EXERCISE'
  | 'EXERCISE_NOT_IN_CHALLENGE'
  | 'DUPLICATE_REQUEST'
  | 'ENTRY_NOT_FOUND'
  | 'EDIT_WINDOW_EXPIRED'
  | 'UNKNOWN';

export const DC_ERROR_MESSAGES: Record<string, string> = {
  CHALLENGE_NOT_ACTIVE:    'Daily Live ist gerade nicht aktiv.',
  INVALID_REPETITIONS:     'Ein Satz muss 10–100 Wiederholungen enthalten.',
  COOLDOWN_ACTIVE:         'Bitte warte noch kurz vor dem nächsten Satz.',
  UNAUTHENTICATED:         'Bitte melde dich erneut an.',
  INVALID_EXERCISE:        'Ungültige Übung.',
  EXERCISE_NOT_IN_CHALLENGE: 'Diese Übung hat kein aktives Daily Live.',
  DUPLICATE_REQUEST:       'Dieser Satz wurde bereits verarbeitet.',
  ENTRY_NOT_FOUND:         'Dieser Satz wurde nicht gefunden.',
  EDIT_WINDOW_EXPIRED:     'Das Bearbeitungsfenster ist abgelaufen. Dieser Satz ist gesperrt.',
  UNKNOWN:                 'Aktion fehlgeschlagen. Bitte versuche es erneut.',
};

// ── Domain-Typen (camelCase, Dates als Date-Objekte) ──────────────────────
export interface DailyChallengeStatus {
  isActive: boolean;
  challengeDate: string;             // 'YYYY-MM-DD' (Berliner Datum)
  startsAt: Date;
  endsAt: Date;
  serverNow: Date;
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
  rank: number;
  isMe: boolean;
}

export interface DailyChallengeSet {
  id: string;
  repetitions: number;
  createdAt: Date;
  /** Bearbeitbar bis zu diesem Zeitpunkt. NULL = alter Eintrag → gesperrt. */
  editUntil: Date | null;
  /** true = automatisch beim Beitritt importiert (READ-ONLY, kein Edit/Delete) */
  isImported: boolean;
}

/** Ein einzelner Satz eines ANDEREN Teilnehmers, heute — nur lesend. */
export interface DailyChallengeParticipantSet {
  id: string;
  setNumber: number;
  repetitions: number;
  createdAt: Date;
}

/** Eine Zeile im Verlauf: mein Ergebnis an einem vergangenen Tag. */
export interface DailyChallengeHistoryDay {
  challengeDate: string;  // 'YYYY-MM-DD'
  rank: number;
  participantCount: number;
  totalRepetitions: number;
  setCount: number;
  maxSet: number | null;
  averageSet: number | null;
}

/** Ein Ranglisten-Eintrag im finalisierten Tagesergebnis (get_daily_challenge_day_details). */
export interface DailyChallengeDayLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  totalRepetitions: number;
  setCount: number;
  maxSet: number | null;
  minSet: number | null;
  averageSet: number | null;
  isMe: boolean;
}

/** Vollständiges Tagesergebnis eines vergangenen, abgeschlossenen Tages. */
export interface DailyChallengeDayDetails {
  challengeDate: string;
  participantCount: number;
  totalRepetitions: number;
  totalSets: number;
  leaderboard: DailyChallengeDayLeaderboardEntry[];
}

// ── Mapper ─────────────────────────────────────────────────────────────────

export function mapStatus(raw: StatusRaw): DailyChallengeStatus {
  return {
    isActive:                  raw.is_active,
    challengeDate:             raw.challenge_date,
    startsAt:                  new Date(raw.starts_at),
    endsAt:                    new Date(raw.ends_at),
    serverNow:                 new Date(raw.server_now),
    secondsUntilStart:         raw.seconds_until_start,
    secondsUntilEnd:           raw.seconds_until_end,
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
    rank:             Number(raw.rank),
    isMe:             raw.is_me,
  };
}

export function mapSet(raw: SetRowRaw): DailyChallengeSet {
  return {
    id:          raw.id,
    repetitions: raw.repetitions,
    createdAt:   new Date(raw.created_at),
    editUntil:   raw.edit_until ? new Date(raw.edit_until) : null,
    isImported:  raw.is_imported,
  };
}

export function mapParticipantSet(raw: ParticipantSetRowRaw): DailyChallengeParticipantSet {
  return {
    id:          raw.entry_id,
    setNumber:   raw.set_number,
    repetitions: raw.repetitions,
    createdAt:   new Date(raw.created_at),
  };
}

export function mapHistoryDay(raw: HistoryRowRaw): DailyChallengeHistoryDay {
  return {
    challengeDate:    raw.challenge_date,
    rank:             raw.rank,
    participantCount: raw.participant_count,
    totalRepetitions: raw.total_repetitions,
    setCount:         raw.set_count,
    maxSet:           raw.max_set,
    averageSet:       raw.avg_set != null ? parseFloat(raw.avg_set) : null,
  };
}

function mapDayLeaderboardEntry(raw: DayLbRowRaw): DailyChallengeDayLeaderboardEntry {
  return {
    rank:             raw.rank,
    userId:           raw.user_id,
    displayName:      raw.display_name,
    avatarUrl:        raw.avatar_url,
    totalRepetitions: raw.total_repetitions,
    setCount:         raw.set_count,
    maxSet:           raw.max_set,
    minSet:           raw.min_set,
    averageSet:       raw.avg_set != null ? parseFloat(raw.avg_set) : null,
    isMe:             raw.is_me,
  };
}

/** null = Fehler (z. B. Tag noch nicht abgeschlossen) oder Tag ohne Ergebnis. */
export function mapDayDetails(raw: DayDetailsRaw): DailyChallengeDayDetails | null {
  if (!raw || raw.error || !raw.summary) return null;
  return {
    challengeDate:    raw.summary.challenge_date,
    participantCount: raw.summary.participant_count,
    totalRepetitions: raw.summary.total_repetitions,
    totalSets:        raw.summary.total_sets,
    leaderboard:      (raw.leaderboard ?? []).map(mapDayLeaderboardEntry),
  };
}
