// Live-Rangliste für die Daily Challenge.
// Reine Props-Komponente — kein eigener Supabase-Zugriff, kein useDailyChallenge.
// Daten kommen ausschließlich aus dem Hook über DailyChallengeModal.

import { Avatar } from '@/components/ui/Avatar';
import { Card, CardTitle } from '@/components/ui/Card';
import { formatBerlinTime } from '@/lib/date';
import type { DailyChallengeLeaderboardEntry } from '@/lib/dailyChallenge.types';

// ── Rang-Stil-Helfer ───────────────────────────────────────────────────────

function rankTextColor(rank: number): string {
  if (rank === 1) return 'text-amber-400';
  if (rank === 2) return 'text-slate-400';
  if (rank === 3) return 'text-orange-400';
  return 'text-slate-500';
}

function rowClassName(rank: number, isMe: boolean): string {
  const base = 'rounded-xl border px-3 py-2.5';
  if (rank === 1) {
    return isMe
      ? `${base} border-amber-500/30 bg-amber-500/5 ring-1 ring-brand-500/30`
      : `${base} border-amber-500/30 bg-amber-500/5`;
  }
  if (rank === 2) {
    return isMe
      ? `${base} border-slate-400/25 bg-brand-400/8 ring-1 ring-brand-500/25`
      : `${base} border-slate-400/25 bg-slate-400/4`;
  }
  if (rank === 3) {
    return isMe
      ? `${base} border-orange-500/25 bg-brand-400/8 ring-1 ring-brand-500/25`
      : `${base} border-orange-500/25 bg-orange-500/4`;
  }
  return isMe
    ? `${base} border-brand-500/30 bg-brand-400/8`
    : `${base} border-ink-800`;
}

// ── Einzelner Ranglisten-Eintrag ───────────────────────────────────────────

export function LeaderboardRow({ entry }: { entry: DailyChallengeLeaderboardEntry }) {
  const {
    rank,
    displayName,
    avatarUrl,
    totalRepetitions,
    setCount,
    maxSet,
    lastSetAt,
    isMe,
  } = entry;

  const hasAnySets = setCount > 0;

  return (
    <li className={rowClassName(rank, isMe)}>
      <div className="flex items-center gap-2.5">
        {/* Platz */}
        <span
          className={`w-5 shrink-0 text-center text-sm font-bold tabular-nums ${rankTextColor(rank)}`}
        >
          {rank}
        </span>

        {/* Avatar */}
        <Avatar url={avatarUrl} name={displayName} size={32} />

        {/* Name + Meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-100">
              {displayName}
            </span>
            {isMe && (
              <span className="shrink-0 rounded bg-brand-400/15 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-400">
                Du
              </span>
            )}
          </div>

          {hasAnySets ? (
            <>
              <p className="mt-0.5 text-xs text-slate-500">
                {setCount} {setCount === 1 ? 'Satz' : 'Sätze'}
                {' · '}
                Bester Satz {maxSet ?? '–'}
              </p>
              {lastSetAt && (
                <p className="mt-0.5 tabular-nums text-xs text-slate-600">
                  Letzter Satz {formatBerlinTime(lastSetAt)} Uhr
                </p>
              )}
            </>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">Noch kein Satz</p>
          )}
        </div>

        {/* Gesamtwiederholungen */}
        <div className="shrink-0 text-right">
          <p className="tabular-nums text-base font-bold leading-none text-slate-100">
            {totalRepetitions}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-600">Wdh.</p>
        </div>
      </div>
    </li>
  );
}

// ── Skeleton-Zeile ─────────────────────────────────────────────────────────

function LeaderboardRowSkeleton({ wide }: { wide?: boolean }) {
  return (
    <li className="animate-pulse rounded-xl border border-ink-800 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="h-4 w-5 shrink-0 rounded bg-ink-700" />
        <div className="h-8 w-8 shrink-0 rounded-full bg-ink-700" />
        <div className="flex-1 space-y-1.5">
          <div className={`h-3.5 rounded bg-ink-700 ${wide ? 'w-28' : 'w-20'}`} />
          <div className="h-3 w-32 rounded bg-ink-700" />
        </div>
        <div className="h-5 w-7 shrink-0 rounded bg-ink-700" />
      </div>
    </li>
  );
}

// ── Ranglistenkarte ────────────────────────────────────────────────────────

export interface LeaderboardCardProps {
  isActive: boolean;
  hasJoined: boolean;
  leaderboard: DailyChallengeLeaderboardEntry[];
  isLoadingLeaderboard: boolean;
  leaderboardError: string | null;
  refreshLeaderboard: () => Promise<void>;
}

export function LeaderboardCard({
  isActive,
  hasJoined,
  leaderboard,
  isLoadingLeaderboard,
  leaderboardError,
  refreshLeaderboard,
}: LeaderboardCardProps) {
  // Challenge noch nicht aktiv
  if (!isActive) {
    return (
      <Card>
        <CardTitle>Live-Rangliste</CardTitle>
        <p className="mt-2 text-sm text-slate-500">Die Rangliste ist ab 05:00 Uhr aktiv.</p>
      </Card>
    );
  }

  // Fehler
  if (leaderboardError) {
    return (
      <Card>
        <CardTitle>Live-Rangliste</CardTitle>
        <p className="mt-2 text-sm text-slate-500">
          Die Live-Rangliste konnte nicht geladen werden.
        </p>
        <button
          onClick={() => void refreshLeaderboard()}
          className="mt-3 rounded-xl border border-ink-600 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-ink-700"
        >
          Erneut versuchen
        </button>
      </Card>
    );
  }

  // Skeleton — nur beim initialen Laden (keine Daten vorhanden)
  if (isLoadingLeaderboard && leaderboard.length === 0) {
    return (
      <Card>
        <CardTitle>Live-Rangliste</CardTitle>
        <ul className="mt-2 space-y-2">
          <LeaderboardRowSkeleton wide />
          <LeaderboardRowSkeleton />
          <LeaderboardRowSkeleton />
          <LeaderboardRowSkeleton />
        </ul>
      </Card>
    );
  }

  // Leer
  if (leaderboard.length === 0) {
    return (
      <Card>
        <CardTitle>Live-Rangliste</CardTitle>
        {hasJoined ? (
          // User hat teilgenommen, aber ist nicht in der Liste — inkonsistenter Zustand
          <>
            <p className="mt-2 text-sm text-slate-500">
              Du solltest bereits gelistet sein — lade die Rangliste neu.
            </p>
            <button
              onClick={() => void refreshLeaderboard()}
              className="mt-3 rounded-xl border border-ink-600 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-ink-700"
            >
              Aktualisieren
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            Noch keine Teilnehmer. Sei der Erste!
          </p>
        )}
      </Card>
    );
  }

  const participantCount = leaderboard.length;

  return (
    <Card>
      {/* Titel + Teilnehmeranzahl */}
      <div className="flex items-baseline justify-between">
        <CardTitle>Live-Rangliste</CardTitle>
        <span className="text-xs text-slate-600">
          {participantCount} Teilnehmer
        </span>
      </div>

      {/* Einträge — serverseitige Sortierung nach rank */}
      <ul className="mt-2 space-y-2">
        {leaderboard.map(entry => (
          <LeaderboardRow key={entry.userId} entry={entry} />
        ))}
      </ul>
    </Card>
  );
}
