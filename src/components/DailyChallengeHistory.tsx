// Challenge-Verlauf: zeigt abgeschlossene Challenge-Tage als Kartenliste.
// Reine Props-Komponente — kein eigener Supabase-Zugriff, kein useDailyChallenge.
// Lazy Loading liegt in DailyChallengeModal (hasRequestedHistoryRef).

import { Card, CardTitle } from '@/components/ui/Card';
import { formatChallengeDateLong } from '@/lib/date';
import type { DailyChallengeHistoryDay } from '@/lib/dailyChallenge.types';

// ── Rang-Stil-Helfer ───────────────────────────────────────────────────────

function rankTextColor(rank: number): string {
  if (rank === 1) return 'text-amber-400';
  if (rank === 2) return 'text-slate-400';
  if (rank === 3) return 'text-orange-400';
  return 'text-slate-200';
}

// Dezente Top-3-Akzentlinie oben auf der Karte (Farbe statt Emoji/Bild)
function rankAccentClass(rank: number): string {
  if (rank === 1) return 'bg-amber-500/35';
  if (rank === 2) return 'bg-slate-400/25';
  if (rank === 3) return 'bg-orange-500/30';
  return '';
}

// ── Einzelne History-Karte (anklickbar) ───────────────────────────────────

function HistoryCard({
  day,
  onSelect,
}: {
  day: DailyChallengeHistoryDay;
  onSelect: (challengeDate: string) => void;
}) {
  const {
    challengeDate,
    rank,
    totalRepetitions,
    setCount,
    participantCount,
    displayName,
  } = day;

  const isTop3 = rank <= 3;
  const accent = rankAccentClass(rank);

  return (
    <button
      onClick={() => onSelect(challengeDate)}
      className="w-full text-left transition active:scale-[0.98]"
    >
      <Card className="overflow-hidden">
        {/* Dezente Akzentlinie für Top 3 */}
        {isTop3 && (
          <div className={`-mx-4 -mt-4 mb-3 h-[3px] ${accent}`} />
        )}

        <div className="flex items-start">
          <div className="flex-1 min-w-0">
            {/* Datum */}
            <p className="text-xs text-slate-500">{formatChallengeDateLong(challengeDate)}</p>

            {/* Platz */}
            <p className={`mt-1 text-2xl font-bold tabular-nums leading-none ${rankTextColor(rank)}`}>
              Platz {rank}
            </p>

            {/* Wiederholungen + Sätze */}
            <p className="mt-2 text-sm text-slate-400">
              <span className="tabular-nums font-semibold text-slate-100">{totalRepetitions}</span>
              {' '}Wdh.
              <span className="mx-1.5 text-slate-700">·</span>
              <span className="tabular-nums font-semibold text-slate-100">{setCount}</span>
              {' '}{setCount === 1 ? 'Satz' : 'Sätze'}
            </p>

            {/* Teilnehmer + Sieger (falls sinnvoll) */}
            {(participantCount > 1 || (displayName && rank > 1)) && (
              <p className="mt-1 text-xs text-slate-600">
                {participantCount > 1 && `${participantCount} Teilnehmer`}
                {participantCount > 1 && displayName && rank > 1 && (
                  <span className="mx-1">·</span>
                )}
                {displayName && rank > 1 && `Sieger: ${displayName}`}
              </p>
            )}
          </div>

          {/* Chevron */}
          <svg viewBox="0 0 20 20" fill="currentColor" className="mt-1 h-4 w-4 shrink-0 text-slate-700">
            <path
              fillRule="evenodd"
              d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </Card>
    </button>
  );
}

// ── Skeleton-Karte ─────────────────────────────────────────────────────────

function HistoryCardSkeleton() {
  return (
    <Card>
      <div className="animate-pulse space-y-2.5">
        <div className="h-3 w-24 rounded bg-ink-700" />
        <div className="h-7 w-20 rounded bg-ink-700" />
        <div className="h-3.5 w-40 rounded bg-ink-700" />
        <div className="h-3 w-32 rounded bg-ink-700" />
      </div>
    </Card>
  );
}

// ── Verlaufsliste ──────────────────────────────────────────────────────────

export interface HistoryListProps {
  history: DailyChallengeHistoryDay[];
  isLoadingHistory: boolean;
  historyError: string | null;
  refreshHistory: () => Promise<void>;
  onSelectDay: (challengeDate: string) => void;
}

export function HistoryList({
  history,
  isLoadingHistory,
  historyError,
  refreshHistory,
  onSelectDay,
}: HistoryListProps) {
  // Fehler
  if (historyError) {
    return (
      <Card>
        <CardTitle>Verlauf</CardTitle>
        <p className="mt-2 text-sm text-slate-500">
          Der Challenge-Verlauf konnte nicht geladen werden.
        </p>
        <button
          onClick={() => void refreshHistory()}
          className="mt-3 rounded-xl border border-ink-600 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-ink-700"
        >
          Erneut versuchen
        </button>
      </Card>
    );
  }

  // Skeleton — nur beim initialen Laden (kein Flash bei Hintergrund-Refresh)
  if (isLoadingHistory && history.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <HistoryCardSkeleton />
        <HistoryCardSkeleton />
        <HistoryCardSkeleton />
      </div>
    );
  }

  // Leer
  if (history.length === 0) {
    return (
      <Card>
        <CardTitle>Noch kein Challenge-Verlauf</CardTitle>
        <p className="mt-2 text-sm text-slate-500">
          Abgeschlossene Daily Challenges werden hier angezeigt.
        </p>
      </Card>
    );
  }

  // Neueste Tage zuerst — stabile Sortierung nach challengeDate DESC
  // (vertraut auf RPC-Reihenfolge, sortiert lokal als Absicherung)
  const sorted = [...history].sort((a, b) =>
    b.challengeDate.localeCompare(a.challengeDate),
  );

  return (
    <div className="flex flex-col gap-3">
      {sorted.map(day => (
        <HistoryCard key={day.challengeDate} day={day} onSelect={onSelectDay} />
      ))}
    </div>
  );
}
