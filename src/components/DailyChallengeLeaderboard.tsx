// Live-Rangliste für Daily Live.
// Reine Props-Komponente — kein eigener Supabase-Zugriff, kein useDailyChallenge.
// Daten kommen ausschließlich aus dem Hook über DailyChallengeModal.

import { Avatar } from '@/components/ui/Avatar';
import { Card, CardTitle } from '@/components/ui/Card';
import { formatBerlinTime } from '@/lib/date';
import type { DailyChallengeLeaderboardEntry } from '@/lib/dailyChallenge.types';

// ── Gemeinsamer Karten-Look (Glow + dezenter Verlauf) ───────────────────────
// Nur innerhalb von Daily Live verwendet — die globale .card-Klasse in
// index.css bleibt unangetastet (wirkt sonst app-weit).

const PREMIUM_CARD = 'border-ink-600/60 shadow-glow bg-gradient-to-b from-ink-800/85 to-ink-800/55';

// ── Rang-Stil-Helfer ───────────────────────────────────────────────────────
// Platz 1 = Gold, Platz 2 = Silber, Platz 3 = Bronze — deutlich gesättigter
// als die übrigen Plätze, mit leichtem Glow via drop-shadow.

function rankTextColor(rank: number): string {
  if (rank === 1) return 'text-amber-300 [filter:drop-shadow(0_0_6px_rgba(251,191,36,0.5))]';
  if (rank === 2) return 'text-slate-200 [filter:drop-shadow(0_0_6px_rgba(203,213,225,0.35))]';
  if (rank === 3) return 'text-orange-300 [filter:drop-shadow(0_0_6px_rgba(251,146,60,0.4))]';
  return 'text-slate-500';
}

function rowClassName(rank: number, isMe: boolean): string {
  const base = 'rounded-xl border px-3 py-2.5 transition-colors';
  // Eigener Eintrag: dezenter Brand-Rahmen + Glow, unabhängig vom Platz.
  const meRing = isMe ? ' ring-2 ring-brand-400/50 shadow-glow' : '';
  if (rank === 1) {
    return isMe
      ? `${base} border-amber-400/60 bg-gradient-to-r from-amber-500/15 to-amber-500/5${meRing}`
      : `${base} border-amber-400/50 bg-gradient-to-r from-amber-500/12 to-amber-500/4`;
  }
  if (rank === 2) {
    return isMe
      ? `${base} border-slate-300/50 bg-gradient-to-r from-slate-300/12 to-slate-300/4${meRing}`
      : `${base} border-slate-300/40 bg-gradient-to-r from-slate-300/10 to-slate-300/3`;
  }
  if (rank === 3) {
    return isMe
      ? `${base} border-orange-400/55 bg-gradient-to-r from-orange-500/14 to-orange-500/4${meRing}`
      : `${base} border-orange-400/45 bg-gradient-to-r from-orange-500/10 to-orange-500/3`;
  }
  return isMe
    ? `${base} border-brand-500/40 bg-brand-400/8${meRing}`
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
          <p className="tabular-nums text-base font-bold leading-none text-brand-300">
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
  leaderboard: DailyChallengeLeaderboardEntry[];
  isLoadingLeaderboard: boolean;
  leaderboardError: string | null;
  refreshLeaderboard: () => Promise<void>;
}

export function LeaderboardCard({
  isActive,
  leaderboard,
  isLoadingLeaderboard,
  leaderboardError,
  refreshLeaderboard,
}: LeaderboardCardProps) {
  // Challenge noch nicht aktiv
  if (!isActive) {
    return (
      <Card className={PREMIUM_CARD}>
        <CardTitle>Live-Rangliste</CardTitle>
        <p className="mt-2 text-sm text-slate-500">Die Rangliste wird um Mitternacht aktiv.</p>
      </Card>
    );
  }

  // Fehler
  if (leaderboardError) {
    return (
      <Card className={PREMIUM_CARD}>
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
      <Card className={PREMIUM_CARD}>
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

  // Leer — legitimer Zustand: niemand hat heute schon einen Satz absolviert.
  // Die Rangliste zeigt ausschließlich Nutzer mit set_count > 0 (serverseitig
  // gefiltert in get_daily_challenge_leaderboard).
  if (leaderboard.length === 0) {
    return (
      <Card className={PREMIUM_CARD}>
        <CardTitle>Live-Rangliste</CardTitle>
        <p className="mt-2 text-sm text-slate-500">
          Noch keine Sätze heute. Sei der Erste!
        </p>
      </Card>
    );
  }

  const participantCount = leaderboard.length;

  return (
    <Card className={PREMIUM_CARD}>
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
